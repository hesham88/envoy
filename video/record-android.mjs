/* global console, process, setTimeout */
/**
 * Records the v8 Android scene on the emulator (F:/Android, AVD "envoy"): the companion app picks the
 * fictional lease, shows what the cloud will see (every detail a tag), sends it with App Check, and
 * puts the real values back on the phone. Taps are placed from a fresh UI dump each time.
 *
 * Needs: the emulator running with the debug build installed (its App Check debug token registered).
 * Usage: node video/record-android.mjs
 * Output: video/out/raw/n16-android-phone.mp4 (the phone's own screen, 1080x2400) + .marks.json
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'out', 'raw');
mkdirSync(RAW, { recursive: true });
const ADB = 'F:/Android/Sdk/platform-tools/adb.exe';
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', maxBuffer: 64 << 20 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const marks = [];
const mark = (name) => marks.push({ name, at: (Date.now() - t0) / 1000 });

function nodes() {
  const xml = adb('exec-out', 'uiautomator', 'dump', '/dev/tty');
  const out = [];
  for (const m of xml.matchAll(/text="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g))
    out.push({ text: m[1], x: (+m[2] + +m[4]) / 2, y: (+m[3] + +m[5]) / 2 });
  return out;
}
const find = (re) => nodes().find((n) => re.test(n.text));
async function waitFor(re, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const n = find(re);
    if (n) return n;
    await wait(700);
  }
  throw new Error(`not on screen: ${re}`);
}
async function tap(re) {
  const n = await waitFor(re, 20000);
  adb('shell', 'input', 'tap', String(Math.round(n.x)), String(Math.round(n.y)));
}
/** Scrolls slowly (a long swipe reads as a gentle glide on screen). */
const scroll = (from, to, ms = 1400) =>
  adb('shell', 'input', 'swipe', '540', String(from), '540', String(to), String(ms));

adb('shell', 'am', 'force-stop', 'app.envoy.hybrid');
adb('shell', 'am', 'start', '-n', 'app.envoy.hybrid/.MainActivity');
await waitFor(/^Check what leaves$/, 30000);
await wait(1500);

const DEVICE_FILE = '/sdcard/envoy-android.mp4';
adb('shell', 'rm', '-f', DEVICE_FILE);
// screenrecord runs until killed (or 180 s); spawn it detached through the shell.
const { spawn } = await import('node:child_process');
const rec = spawn(ADB, ['shell', 'screenrecord', '--bit-rate', '12000000', DEVICE_FILE], {
  stdio: 'ignore',
});
await wait(1800);
mark('start');
await tap(/^Residential lease, Cairo$/);
mark('sample');
await wait(2200);
await tap(/^Check what leaves$/);
mark('check');
await waitFor(/^WHAT THE CLOUD WILL SEE$/);
mark('excerpt');
await wait(1500);
scroll(1900, 700, 1800); // the excerpt, every detail a tag
await wait(3200);
// Compose lists only what is on screen: glide down until the button shows.
for (let i = 0; i < 6 && !find(/^Approve and send$/); i++) {
  scroll(1900, 900, 1200);
  await wait(900);
}
await wait(1200);
await tap(/^Approve and send$/);
mark('approve');
const answered = /Read aloud on this phone|No on-device voice|Real values restored/;
for (let i = 0; i < 90 && !find(answered); i++) {
  await wait(1000);
  if (i % 3 === 2) scroll(1900, 1300, 600);
}
mark('answer');
await wait(1000);
scroll(1900, 1000, 1800);
await wait(3500);
scroll(1900, 1100, 1600);
await wait(3000);
mark('end');
adb('shell', 'pkill', '-INT', 'screenrecord');
await wait(2500);
rec.kill();
const local = join(RAW, 'n16-android-phone.mp4');
adb('pull', DEVICE_FILE, local);
writeFileSync(join(RAW, 'n16-android-phone.marks.json'), JSON.stringify(marks, null, 1));
console.log('android footage', local, marks);
process.exit(0);

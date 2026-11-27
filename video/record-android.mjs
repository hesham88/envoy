/* global console, process, setTimeout */
/**
 * Records the Android scene on the emulator (F:/Android, AVD "envoy"): the three-step companion app
 * picks the fictional lease, shows what leaves (every detail a tag), sends it with App Check, and
 * puts the real values back on the phone. Taps are placed from a fresh UI dump each time; the
 * action bar is sticky, so nothing has to be scrolled into view.
 *
 * Needs: the emulator running with the debug build installed (its App Check debug token registered).
 * Usage: node video/record-android.mjs [--shots]   (--shots: a screenshot per step, no recording)
 * Output: video/out/raw/n16-android-phone.mp4 (1080x2400) + n16-android-phone.marks.json,
 *         or F:/Android/tmp/frames/ui/step-*.png with --shots
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'out', 'raw');
const SHOTS = 'F:/Android/tmp/frames/ui';
const shots = process.argv.includes('--shots');
mkdirSync(shots ? SHOTS : RAW, { recursive: true });
const ADB = 'F:/Android/Sdk/platform-tools/adb.exe';
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', maxBuffer: 64 << 20 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let t0 = Date.now();
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
async function waitFor(re, ms = 90000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const n = find(re);
    if (n) return n;
    await wait(600);
  }
  throw new Error(`not on screen: ${re}`);
}
async function tap(re) {
  const n = await waitFor(re, 20000);
  adb('shell', 'input', 'tap', String(Math.round(n.x)), String(Math.round(n.y)));
}
const scroll = (from, to, ms = 1600) =>
  adb('shell', 'input', 'swipe', '540', String(from), '540', String(to), String(ms));
const shot = (name) => {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20 });
  writeFileSync(join(SHOTS, `step-${name}.png`), png);
};

adb('shell', 'am', 'force-stop', 'app.envoy.hybrid');
adb('shell', 'am', 'start', '-n', 'app.envoy.hybrid/.MainActivity');
await waitFor(/^Check what leaves/, 30000);
await wait(1500);

const DEVICE_FILE = '/sdcard/envoy-android.mp4';
let rec;
if (!shots) {
  adb('shell', 'rm', '-f', DEVICE_FILE);
  rec = spawn(ADB, ['shell', 'screenrecord', '--bit-rate', '12000000', DEVICE_FILE], {
    stdio: 'ignore',
  });
  await wait(1200);
  t0 = Date.now(); // marks on the recording's own clock (screenrecord starts within ~0.3 s)
}
await wait(1500);
await tap(/^Residential lease, Cairo$/);
mark('sample');
await wait(2600);
if (shots) shot('1-document');
await tap(/^Check what leaves/);
await waitFor(/^What leaves this phone$/);
mark('leaves');
await wait(2600);
if (shots) shot('2-leaves');
scroll(1700, 800); // the found details, then the excerpt with its tags
await wait(2600);
if (shots) shot('2b-excerpt');
await tap(/^Approve and send$/);
mark('approve');
await waitFor(/^Your answer$/, 90000);
mark('answer');
await wait(3200);
if (shots) shot('3-answer');
scroll(1700, 900); // the flight recorder
await wait(3000);
if (shots) shot('3b-recorder');
mark('end');
if (!shots) {
  adb('shell', 'pkill', '-INT', 'screenrecord');
  await wait(2500);
  rec.kill();
  adb('pull', DEVICE_FILE, join(RAW, 'n16-android-phone.mp4'));
  writeFileSync(join(RAW, 'n16-android-phone.marks.json'), JSON.stringify(marks, null, 1));
}
console.log(shots ? `screenshots in ${SHOTS}` : 'android footage recorded', marks);
process.exit(0);

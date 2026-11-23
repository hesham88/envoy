/* global console, process, window, self, setTimeout, Buffer */
/**
 * Records the private-mode scenes (n04-n08) as ONE real session in the model Chrome (Gemma 4, the
 * model Gemini Nano 4 is built on), on the dev server with the App Check debug token, then cuts the
 * five clips from that single take at the moments it marked. Nothing is staged or sped up; the long
 * on-device wait is cut out, and the film says so.
 *
 * Prereqs: model Chrome on CDP 9333 with on-device AI ready; `npm run dev` on 5173.
 * Usage: node video/record-private.mjs   ->  video/out/raw/n04..n08.mp4 (+ master.mp4)
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'out', 'raw');
const W = 1600;
const H = 900;
const APP = 'http://localhost:5173/app?sample=lease';
mkdirSync(RAW, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: W, height: H });

const status = await page.goto(APP).then(() =>
  page.evaluate(async () => ('LanguageModel' in self ? await globalThis.LanguageModel.availability() : 'no-api')),
);
if (status !== 'available') throw new Error(`on-device model is "${status}", not available: not recording`);

// One continuous screencast; marks are seconds from its first frame.
const cdp = await ctx.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', (f) => {
  frames.push({ data: f.data, t: f.metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await page.reload({ waitUntil: 'load' });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H });
await wait(500);
const t0 = Date.now() / 1000;
const marks = {};
const mark = (k) => {
  marks[k] = Date.now() / 1000 - t0;
  console.log(`${k.padEnd(16)} ${marks[k].toFixed(1)} s`);
};
const center = (loc) => loc.first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));

mark('loaded');
await wait(2500);
await page.locator('#envoy-composer').click();
await wait(1200);
await page.keyboard.press('End');
await wait(700);
mark('send');
await page.keyboard.press('Enter');
await page.getByText('Privacy flight recorder').first().waitFor({ timeout: 30000 });
await wait(800);
await center(page.locator('details').last());
mark('analysing');
const approve = page.getByRole('button', { name: 'Approve and send' });
await approve.waitFor({ timeout: 20 * 60 * 1000 });
mark('analysed');
await center(page.locator('details').last());
await wait(5000);
mark('approval');
await page.getByRole('group', { name: 'Before and after' }).first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
await wait(5000);
await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
await wait(5000);

// The guard: type a raw IBAN into the excerpt, watch the send get blocked, then take it out again.
mark('guard');
await page.getByRole('button', { name: 'Edit excerpt' }).click();
const box = page.getByLabel(/Excerpt to send/);
await center(box);
await wait(800);
await box.click();
await page.keyboard.press('Control+End');
const raw = ' Pay to EG38 0019 0005 0000 0000 2631 8000 2.';
await page.keyboard.type(raw, { delay: 45 });
await page.getByRole('alert').first().waitFor({ timeout: 10000 });
await center(page.getByRole('alert'));
mark('blocked');
await wait(4000);
for (let i = 0; i < raw.length; i++) await page.keyboard.press('Backspace');
await wait(1200);
await page.getByRole('button', { name: 'Done editing' }).click();
await wait(800);

// Approve: the cloud reasons over tags, the device restores the values and does the maths.
await center(approve);
await wait(1200);
mark('approve');
await approve.click();
await page.getByText(/Reasoned in the cloud over tags|Answered on this device/).first().waitFor({ timeout: 180000 });
mark('answer');
await center(page.locator('article').last().locator('p.whitespace-pre-wrap').last());
await wait(9000);
mark('end');
await cdp.send('Page.stopScreencast');
await page.close();
await browser.close();

// Encode the master at a constant 30 fps from the variable-rate frames.
const dir = join(RAW, '.private');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const first = frames.find((f) => f.t >= t0) ? t0 : frames[0].t;
const kept = frames.filter((f, i) => f.t >= first || frames[i + 1]?.t > first);
const end = t0 + marks.end;
const list = [];
kept.forEach((f, i) => {
  const name = `f${String(i).padStart(5, '0')}.jpg`;
  writeFileSync(join(dir, name), Buffer.from(f.data, 'base64'));
  const next = kept[i + 1]?.t ?? end;
  list.push(`file '${name}'`, `duration ${Math.max(0.001, next - Math.max(f.t, first)).toFixed(4)}`);
});
list.push(`file 'f${String(kept.length - 1).padStart(5, '0')}.jpg'`);
writeFileSync(join(dir, 'list.txt'), list.join('\n'));
const master = join(RAW, 'private-master.mp4');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', `fps=30,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0b0a1f,format=yuv420p`, '-c:v', 'libx264', '-crf', '16', master]);
rmSync(dir, { recursive: true, force: true });
writeFileSync(join(RAW, 'private-marks.json'), JSON.stringify(marks, null, 2));

// Cut the scenes from the one take.
const cut = (id, parts) => {
  const tmp = parts.map((_, i) => join(RAW, `.${id}-${i}.mp4`));
  parts.forEach(([a, b], i) =>
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', a.toFixed(2), '-i', master, '-t', (b - a).toFixed(2), '-c:v', 'libx264', '-crf', '16', '-an', tmp[i]]),
  );
  if (tmp.length === 1) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp[0], '-c', 'copy', join(RAW, `${id}.mp4`)]);
  else {
    writeFileSync(join(RAW, `.${id}.txt`), tmp.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(RAW, `.${id}.txt`), '-c', 'copy', join(RAW, `${id}.mp4`)]);
    rmSync(join(RAW, `.${id}.txt`));
  }
  tmp.forEach((f) => rmSync(f, { force: true }));
  console.log(`cut ${id}`);
};
const m = marks;
cut('n04-chat', [[Math.max(0, m.loaded + 0.3), m.send + 3.5]]);
cut('n05-recorder', [
  [m.analysing, m.analysing + 6],
  [Math.max(m.analysing + 6, m.analysed - 1), m.analysed + 5],
]);
cut('n06-approve', [[m.approval, m.guard]]);
cut('n07-guard', [[m.guard, m.blocked + 4]]);
cut('n08-answer', [[m.approve - 0.5, m.end]]);
console.log(`on-device wait cut from the film: ${(m.analysed - m.analysing - 6).toFixed(0)} s`);
process.exit(0);

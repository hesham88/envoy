/* global console, process, window, document, self, setTimeout, Buffer */
/**
 * Records the private-mode scenes as ONE real session in the model Chrome (Gemma 4, the model
 * Gemini Nano 4 is built on), with Gemini 4 Hydrogen chosen as the cloud model, on the dev server
 * (App Check debug token). Then it cuts the scenes from that single take at the moments it marked.
 * Nothing is staged or sped up; long waits are cut, and the film says so.
 *
 * Take: rent question -> on-device analysis -> approval -> the guard blocks a pasted IBAN -> approve
 * -> Hydrogen answer, maths restored on the device -> "When does my lease end?" answered on the
 * device (0 bytes sent) -> the network ledger.
 *
 * Prereqs: model Chrome on CDP 9333 with on-device AI ready; dev server on 5173 started WITHOUT a
 * VITE_CLOUD_MODEL override (so the composer's model choice decides).
 * Usage: node video/record-private.mjs  ->  video/out/raw/n06..n12.mp4 (+ marks, master)
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
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => document.fonts.ready);
// Right after Chrome starts, the model can report "downloading" for a moment while it registers.
let status = 'unknown';
for (let i = 0; i < 15 && status !== 'available'; i++) {
  status = await page.evaluate(async () =>
    'LanguageModel' in self ? await globalThis.LanguageModel.availability() : 'no-api',
  );
  if (status !== 'available') await wait(2000);
}
if (status !== 'available') throw new Error(`on-device model is "${status}": not recording`);

// The cloud model for this take: Gemini 4 Hydrogen (the saved composer choice).
await page.getByRole('radio', { name: 'Gemini 4 Hydrogen' }).click();
await wait(1500);
const model = await page.evaluate(
  () => document.body.innerText.match(/Cloud model: ([\w.-]+)/)?.[1],
);
if (model !== 'gemini-4-hydrogen')
  throw new Error(`cloud model is ${model}, not gemini-4-hydrogen`);

const cdp = await ctx.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', (f) => {
  frames.push({ data: f.data, t: f.metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await page.evaluate(() => window.scrollTo(0, 0));
await wait(600);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H });
const t0 = Date.now() / 1000;
const marks = {};
const typing = [];
const mark = (k) => {
  marks[k] = Date.now() / 1000 - t0;
  console.log(`${k.padEnd(16)} ${marks[k].toFixed(1)} s`);
};
const center = (loc) =>
  loc.first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
const approveBtn = () => page.getByRole('button', { name: 'Approve and send' }).last();

// 1. Ask about the rent.
mark('loaded');
await wait(2200);
await page.locator('#envoy-composer').click();
await wait(900);
await page.keyboard.press('End');
await wait(600);
mark('send');
await page.keyboard.press('Enter');
await page.getByText('Privacy flight recorder').first().waitFor({ timeout: 30000 });
await wait(800);
await center(page.locator('details').last());
mark('analysing');
await approveBtn().waitFor({ timeout: 20 * 60 * 1000 });
mark('analysed');
await center(page.locator('details').last());
await wait(5000);

// 2. What the cloud will see.
mark('approval');
await page
  .getByRole('group', { name: 'Before and after' })
  .last()
  .evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
await wait(5000);
await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
await wait(5000);

// 3. The guard: a raw IBAN typed into the excerpt blocks the send; then it's taken out again.
mark('guard');
await page.getByRole('button', { name: 'Edit excerpt' }).last().click();
const box = page.getByLabel(/Excerpt to send/).last();
await center(box);
await wait(800);
await box.click();
await page.keyboard.press('Control+End');
const raw = ' Pay to EG38 0019 0005 0000 0000 2631 8000 2.';
typing.push({ name: 'type-start', at: Date.now() / 1000 - t0 });
await page.keyboard.type(raw, { delay: 45 });
typing.push({ name: 'type-end', at: Date.now() / 1000 - t0 });
await page.getByRole('alert').first().waitFor({ timeout: 10000 });
await center(page.getByRole('alert').last());
mark('blocked');
await wait(4000);
for (let i = 0; i < raw.length; i++) await page.keyboard.press('Backspace');
await wait(1200);
await page.getByRole('button', { name: 'Done editing' }).last().click();
await wait(800);

// 4. Approve: Gemini 4 Hydrogen reasons over tags; the device restores values and does the maths.
await center(approveBtn());
await wait(1200);
mark('approve');
await approveBtn().click();
await page
  .getByText(/Reasoned in the cloud over tags|Answered on this device|Lighter answer/)
  .first()
  .waitFor({ timeout: 240000 });
mark('answer');
// This take must show Gemini 4 Hydrogen itself answering: stop at once otherwise.
const answerText = await page.locator('article').last().innerText();
if (/Lighter answer|cloud unreachable|answered instead/.test(answerText))
  throw new Error('Hydrogen did not answer (quota or network): not a usable take');
await center(page.locator('article').last().locator('p.whitespace-pre-wrap').last());
await wait(9000);
mark('answer-end');

// 5. A question the document answers: on the device, nothing sent.
const zeroBytes = () =>
  page.evaluate(() => document.body.innerText.split('0 bytes left this device.').length - 1);
const before = await zeroBytes();
await page.locator('#envoy-composer').click();
mark('q2');
typing.push({ name: 'type-start', at: Date.now() / 1000 - t0 });
await page.keyboard.type('When does my lease end?', { delay: 55 });
typing.push({ name: 'type-end', at: Date.now() / 1000 - t0 });
await wait(500);
await page.keyboard.press('Enter');
await wait(1500);
await center(page.locator('details').last());
mark('analysing2');
// Wait for THIS answer's receipt (not one already on screen), or for an approval card: if the
// router sends this question to the cloud, stop (nothing is sent before approval).
const approvalsBefore = await page.getByRole('button', { name: 'Approve and send' }).count();
const outcome = await page.waitForFunction(
  ([n, k]) => {
    if (document.body.innerText.split('0 bytes left this device.').length - 1 > n) return 'local';
    const approve = [...document.querySelectorAll('button')].filter(
      (x) => x.textContent?.trim() === 'Approve and send',
    );
    return approve.length > k ? 'cloud' : false;
  },
  [before, approvalsBefore],
  { timeout: 20 * 60 * 1000, polling: 500 },
);
if ((await outcome.jsonValue()) !== 'local')
  throw new Error(
    'the second question was routed to the cloud: not a usable take (nothing was sent)',
  );
mark('answer2');
await center(page.locator('article').last());
await wait(8000);

// 6. The network ledger: every request, and what reached the cloud.
await page.getByRole('button', { name: 'Network ledger' }).first().click();
await wait(600);
mark('ledger');
await wait(4500);
await page
  .getByRole('complementary', { name: 'Network inspector' })
  .evaluate((d) => d.scrollBy({ top: 500, behavior: 'smooth' }));
await wait(4500);
mark('end');
await cdp.send('Page.stopScreencast');
await page.close();
await browser.close();

// Encode the master at a constant 30 fps from the variable-rate frames.
const dir = join(RAW, '.private');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const kept = frames.filter((f, i) => f.t >= t0 || frames[i + 1]?.t > t0);
const end = t0 + marks.end;
const list = [];
kept.forEach((f, i) => {
  const name = `f${String(i).padStart(5, '0')}.jpg`;
  writeFileSync(join(dir, name), Buffer.from(f.data, 'base64'));
  const next = kept[i + 1]?.t ?? end;
  list.push(`file '${name}'`, `duration ${Math.max(0.001, next - Math.max(f.t, t0)).toFixed(4)}`);
});
list.push(`file 'f${String(kept.length - 1).padStart(5, '0')}.jpg'`);
writeFileSync(join(dir, 'list.txt'), list.join('\n'));
const master = join(RAW, 'private-master.mp4');
execFileSync('ffmpeg', [
  '-loglevel',
  'error',
  '-y',
  '-f',
  'concat',
  '-safe',
  '0',
  '-i',
  join(dir, 'list.txt'),
  '-vf',
  `fps=30,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0b0a1f,format=yuv420p`,
  '-c:v',
  'libx264',
  '-crf',
  '16',
  master,
]);
rmSync(dir, { recursive: true, force: true });
writeFileSync(join(RAW, 'private-marks.json'), JSON.stringify({ marks, typing }, null, 2));

// Cut the scenes from the one take. Each part is [from, to] in master seconds.
const m = marks;
const cuts = {};
const cut = (id, parts) => {
  cuts[id] = parts;
  const tmp = parts.map((_, i) => join(RAW, `.${id}-${i}.mp4`));
  parts.forEach(([a, b], i) =>
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-ss',
      a.toFixed(2),
      '-i',
      master,
      '-t',
      (b - a).toFixed(2),
      '-c:v',
      'libx264',
      '-crf',
      '16',
      '-an',
      tmp[i],
    ]),
  );
  writeFileSync(
    join(RAW, `.${id}.txt`),
    tmp.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'),
  );
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    join(RAW, `.${id}.txt`),
    '-c',
    'copy',
    join(RAW, `${id}.mp4`),
  ]);
  rmSync(join(RAW, `.${id}.txt`));
  tmp.forEach((f) => rmSync(f, { force: true }));
  // Typing moments inside this scene, re-timed to the scene's own clock.
  const local = [];
  let offset = 0;
  for (const [a, b] of parts) {
    for (const t of typing)
      if (t.at >= a && t.at <= b) local.push({ name: t.name, at: offset + t.at - a });
    offset += b - a;
  }
  writeFileSync(join(RAW, `${id}.marks.json`), JSON.stringify(local, null, 1));
  console.log(`cut ${id} (${offset.toFixed(1)} s)`);
};
const waitCut = (a, b, keepStart, keepEnd) =>
  b - a > keepStart + keepEnd + 2
    ? [
        [a, a + keepStart],
        [b - keepEnd, b],
      ]
    : [[a, b]];
cut('n06-chat', [[Math.max(0, m.loaded + 0.3), m.send + 3.5]]);
cut('n07-recorder', waitCut(m.analysing, m.analysed + 5, 6, 6));
cut('n08-approve', [[m.approval, m.guard]]);
cut('n09-guard', [[m.guard, m.blocked + 4]]);
cut('n10-answer', waitCut(m.approve - 0.5, m['answer-end'], 3.5, 10));
cut('n11-local', [
  [m.q2 - 0.3, m.analysing2 + 4],
  ...waitCut(m.analysing2 + 4, m.answer2 + 8, 0, 9.5).slice(-1),
]);
cut('n12-ledger', [[m.ledger - 0.3, m.end]]);
writeFileSync(join(RAW, 'private-cuts.json'), JSON.stringify(cuts, null, 1));
writeFileSync(
  join(RAW, 'private-waits.json'),
  JSON.stringify(
    {
      analysis: m.analysed - m.analysing,
      hydrogen: m.answer - m.approve,
      local: m.answer2 - m.analysing2,
    },
    null,
    2,
  ),
);
console.log(
  `waits: analysis ${(m.analysed - m.analysing).toFixed(0)} s, Hydrogen ${(m.answer - m.approve).toFixed(0)} s, local ${(m.answer2 - m.analysing2).toFixed(0)} s`,
);
process.exit(0);

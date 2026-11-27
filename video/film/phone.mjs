/* global console, process, document */ // document: inside page callbacks
/**
 * Composes the Android scene: the emulator's screen recording (video/out/raw/n16-android-phone.mp4)
 * inside a drawn phone bezel, beside a panel that names the three steps and lights the current one
 * in time with the footage. The footnote says what this is: the Android emulator, in Basic
 * protection (no Gemini Nano there). A "Wait cut" chip marks where the cloud's reply is shortened.
 *
 * Usage: node video/film/phone.mjs
 * Output: video/out/raw/n16-android.mp4 (1600x900, meant for the frameless "bleed" layout)
 *         + n16-android.marks.json (on the composed clip's clock)
 */
import '../../scripts/lib/scratch.mjs'; // Chrome's scratch space off C: (TEMP -> node_modules/.cache)
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(HERE, '../out/raw');
const TMP = resolve(HERE, '../out/phone');
mkdirSync(TMP, { recursive: true });
const W = 1600;
const H = 900;

// Segments of the recording [from, to] (seconds), chosen from its frames: pick the lease, What
// leaves appears, glide to the tagged excerpt, Approve, (the cloud's wait, shortened), the answer,
// glide to the flight recorder.
const SEGMENTS = [
  { from: 3.0, to: 5.6, stage: 1 },
  { from: 8.3, to: 12.5, stage: 2 },
  { from: 15.2, to: 19.0, stage: 2 },
  { from: 21.0, to: 23.2, stage: 2 },
  { from: 26.75, to: 31.4, stage: 3, waitCut: true },
  { from: 32.6, to: 35.4, stage: 3 },
];

// Phone geometry: the 1080x2400 screen at 378x840, in a bezel.
const SCREEN = { x: 196, y: 30, w: 378, h: 840, r: 40 };
const BEZEL = 14;

const STEPS = [
  ['Your document', 'Pick a sample, paste, or take a photo.'],
  ['What leaves', 'Every private detail becomes a tag, on the phone.'],
  ['Your answer', 'Gemini reasons over tags; real names come back on the phone.'],
];

const page = (body) => `<!doctype html><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=IBM+Plex+Sans:wght@400;600&display=block');
  html,body{margin:0;width:${W}px;height:${H}px;background:transparent;font-family:'IBM Plex Sans',sans-serif}
  .panel{position:absolute;left:700px;top:120px;width:780px;color:#ece9ff}
  h1{margin:0;font:500 64px/1.05 Fraunces,serif;letter-spacing:-.01em}
  .sub{margin:14px 0 40px;font-size:25px;color:#a9a6cc}
  .step{display:flex;gap:20px;align-items:flex-start;margin:0 0 28px;opacity:.42;transition:none}
  .step.on{opacity:1}
  .num{flex:none;width:46px;height:46px;border-radius:50%;border:2px solid #3dffb0;color:#3dffb0;display:grid;place-items:center;font-weight:600;font-size:22px}
  .step.on .num{background:#3dffb0;color:#0b0a1c;box-shadow:0 0 28px -4px #3dffb0}
  .t{font-size:30px;font-weight:600;line-height:1.2}.d{font-size:21px;color:#a9a6cc;margin-top:4px}
  .foot{position:absolute;left:700px;bottom:56px;width:800px;font-size:18px;color:#a9a6cc;line-height:1.5}
  .foot b{color:#ffb547;font-weight:600}
  .wait{position:absolute;left:${SCREEN.x + 70}px;top:${SCREEN.y + SCREEN.h - 120}px;padding:10px 16px;border-radius:14px;border:1.5px solid #ffb547;background:rgba(11,10,31,.9);color:#ffb547;font:500 24px Fraunces,serif}
</style>${body}`;

const panel = (on, wait) =>
  page(`<div class="panel"><h1>Envoy for Android</h1><p class="sub">The same promise, in your pocket.</p>
  ${STEPS.map(([t, d], i) => `<div class="step${i + 1 === on ? ' on' : ''}"><div class="num">${i + 1}</div><div><div class="t">${t}</div><div class="d">${d}</div></div></div>`).join('')}
  </div><div class="foot">Filmed on the Android emulator, which has no Gemini Nano: <b>Basic protection</b> (local rules), so every part is sent, masked. Firebase AI Logic for Android (firebase-ai, firebase-ai-ondevice) with App Check.</div>${wait ? '<div class="wait">Wait cut</div>' : ''}`);

const bezel = () =>
  page(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><mask id="m"><rect width="${W}" height="${H}" fill="white"/><rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.w}" height="${SCREEN.h}" rx="${SCREEN.r}" fill="black"/></mask>
  <filter id="g" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter></defs>
  <g mask="url(#m)">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#0b0a1f"/>
    <rect x="${SCREEN.x - BEZEL}" y="${SCREEN.y - BEZEL}" width="${SCREEN.w + 2 * BEZEL}" height="${SCREEN.h + 2 * BEZEL}" rx="${SCREEN.r + BEZEL}" fill="#3dffb0" opacity=".16" filter="url(#g)"/>
    <rect x="${SCREEN.x - BEZEL}" y="${SCREEN.y - BEZEL}" width="${SCREEN.w + 2 * BEZEL}" height="${SCREEN.h + 2 * BEZEL}" rx="${SCREEN.r + BEZEL}" fill="#07061a" stroke="#3a3870" stroke-width="2"/>
  </g></svg>`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const p = await browser.newPage({ viewport: { width: W, height: H } });
const shot = async (name, html) => {
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(TMP, `${name}.png`), omitBackground: true });
};
await shot('bezel', bezel());
for (const on of [1, 2, 3]) await shot(`panel-${on}`, panel(on, false));
await shot('wait', page('<div class="wait">Wait cut</div>'));
await browser.close();

// Compose: background, the phone's screen in the hole, the bezel over it, the panel for each stage.
// screenrecord writes a frame only when the screen changes; trims of that stream end at the last
// changed frame, not at the cut. A constant 30 fps copy (gaps filled with held frames) trims exactly.
const src = join(TMP, 'phone-cfr.mp4');
execFileSync('ffmpeg', [
  '-loglevel',
  'error',
  '-y',
  '-i',
  join(RAW, 'n16-android-phone.mp4'),
  '-vf',
  'fps=30',
  '-c:v',
  'libx264',
  '-crf',
  '14',
  '-preset',
  'veryfast',
  src,
]);
const parts = [];
const f = [];
let t = 0;
SEGMENTS.forEach((s, i) => {
  f.push(`[0:v]trim=${s.from}:${s.to},setpts=PTS-STARTPTS,scale=${SCREEN.w}:${SCREEN.h}[s${i}]`);
  parts.push({ ...s, start: t, end: t + (s.to - s.from) });
  t += s.to - s.from;
});
const total = t;
f.push(`${SEGMENTS.map((_, i) => `[s${i}]`).join('')}concat=n=${SEGMENTS.length}:v=1[phone]`);
f.push(`color=c=0x0b0a1f:s=${W}x${H}:r=30:d=${total.toFixed(3)}[bg]`);
f.push(`[bg][phone]overlay=${SCREEN.x}:${SCREEN.y}[a]`, '[a][1:v]overlay=0:0[b]');
let last = 'b';
const panelInput = { 1: 2, 2: 3, 3: 4, wait: 5 };
for (const on of [1, 2, 3]) {
  const spans = parts
    .filter((x) => x.stage === on)
    .map((x) => `between(t,${x.start.toFixed(3)},${x.end.toFixed(3)})`);
  f.push(`[${last}][${panelInput[on]}:v]overlay=0:0:enable='${spans.join('+')}'[p${on}]`);
  last = `p${on}`;
}
const w = parts.find((x) => x.waitCut);
f.push(
  `[${last}][${panelInput.wait}:v]overlay=0:0:enable='between(t,${(w.start - 0.6).toFixed(3)},${(w.start + 1.2).toFixed(3)})',format=yuv420p[out]`,
);
const filter = join(TMP, 'filter.txt');
writeFileSync(filter, f.join(';\n'));
execFileSync(
  'ffmpeg',
  [
    '-loglevel',
    'error',
    '-y',
    '-i',
    src,
    ...['bezel', 'panel-1', 'panel-2', 'panel-3', 'wait'].flatMap((n) => [
      '-loop',
      '1',
      '-t',
      total.toFixed(3),
      '-i',
      join(TMP, `${n}.png`),
    ]),
    '-/filter_complex',
    filter,
    '-map',
    '[out]',
    '-t',
    total.toFixed(3),
    '-c:v',
    'libx264',
    '-crf',
    '16',
    '-preset',
    'medium',
    join(RAW, 'n16-android.mp4'),
  ],
  { stdio: 'inherit' },
);
// Marks on the composed clock: the tap on the lease, What leaves, Approve, the answer.
const at = (rec) => {
  const s = parts.find((x) => rec >= x.from && rec <= x.to);
  return s ? +(s.start + rec - s.from).toFixed(2) : null;
};
const marks = [
  { name: 'sample', at: at(4.0) },
  { name: 'leaves', at: at(9.0) },
  { name: 'approve', at: at(21.1) },
  { name: 'answer', at: +(w.start + 0.1).toFixed(2) },
];
writeFileSync(join(RAW, 'n16-android.marks.json'), JSON.stringify(marks, null, 1));
console.log(`n16-android: ${total.toFixed(1)} s`, JSON.stringify(marks));
process.exit(0);

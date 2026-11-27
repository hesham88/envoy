/* global console, document */
/**
 * Renders the film's stills (1920x1080 PNGs) from HTML with headless Chrome: the guilloche pattern
 * that lies over the animated background, each layout's card frame (shadow + glow below the footage,
 * a hairline ring above it, a rounded mask), the margin captions, chapter cards, wait-cut notes with
 * the take's real times, and the closing links. Brand: UV night, Fraunces display, IBM Plex text,
 * green = this device, blue = cloud, amber = the guard.
 *
 * Usage: node video/film/overlays.mjs  ->  video/out/overlays/*.png
 */
import '../../scripts/lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS, COLOR, H, LABEL, LAYOUTS, SCENES, W } from './layout.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT = join(HERE, '../out/overlays');
const RAW = join(HERE, '../out/raw');
mkdirSync(OUT, { recursive: true });

// The Envoy mark, read from its source so the film always shows the product's real logo.
const LOGO_PATHS = [
  ...readFileSync(join(REPO, 'packages/ui/src/Logo.tsx'), 'utf8')
    .match(/LOGO_PATHS = \{([\s\S]*?)\}/)[1]
    .matchAll(/'(M[^']+)'/g),
].map((m) => m[1]);
if (LOGO_PATHS.length !== 3) throw new Error('could not read the logo paths from Logo.tsx');

const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(join(REPO, 'node_modules', pkg, 'files', file)).toString('base64')}`;
const FONTS = `
@font-face { font-family: Plex; font-weight: 500; src: url(${font('@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-500-normal.woff2')}); }
@font-face { font-family: Plex; font-weight: 600; src: url(${font('@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff2')}); }
@font-face { font-family: PlexMono; font-weight: 500; src: url(${font('@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff2')}); }
@font-face { font-family: Fraunces; src: url(${font('@fontsource-variable/fraunces', 'fraunces-latin-opsz-normal.woff2')}); }`;

const RADIUS = 22;
const css = `${FONTS}
html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden;color:#ece9ff}
.pill{display:inline-flex;align-items:center;gap:10px;padding:7px 16px 7px 12px;border-radius:999px;
  border:1.5px solid var(--c);background:rgba(11,10,31,.72);box-shadow:0 0 22px -8px var(--c);
  font:600 19px/1 Plex,sans-serif;color:#ece9ff;white-space:nowrap}
.dot{width:11px;height:11px;border-radius:50%;background:var(--c);box-shadow:0 0 12px var(--c)}
h2{margin:0;font:400 50px/1.07 Fraunces,serif;letter-spacing:-.01em;color:#f4f2ff;text-wrap:balance}
p{margin:0;font:500 23px/1.45 Plex,sans-serif;color:#b9b5d6;text-wrap:pretty}
.col{position:absolute;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:20px}
.bottom{position:absolute;left:160px;right:160px;top:952px;display:flex;align-items:center;justify-content:space-between;gap:40px}
.bottom h2{font-size:38px}
.bottom p{font-size:21px;margin-top:6px}
.wait{position:absolute;padding:14px 18px;border-radius:16px;border:1.5px solid #ffb547;background:rgba(11,10,31,.86);
  box-shadow:0 0 26px -10px #ffb547;font:500 19px/1.4 Plex,sans-serif;color:#ece9ff}
.wait b{display:block;margin-bottom:0;font:400 26px/1.1 Fraunces,serif;font-weight:400;color:#ffb547}
`;
const page = (body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;

const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: W, height: H } });
const shot = async (name, html) => {
  await p.setContent(page(html));
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(OUT, `${name}.png`), omitBackground: true });
};

// 1. Guilloche: security-print rosettes drawn as faint light (green = device, blue = cloud).
await p.setContent(page('<canvas id="c" width="1920" height="1080"></canvas>'));
await p.evaluate(() => {
  const g = document.getElementById('c').getContext('2d');
  const rosette = (cx, cy, R, r, d, turns, color, lines) => {
    g.strokeStyle = color;
    g.lineWidth = 1.1;
    for (let j = 0; j < lines; j++) {
      const rot = (j / lines) * Math.PI * 2;
      g.beginPath();
      for (let i = 0; i <= 1400; i++) {
        const t = (i / 1400) * Math.PI * 2 * turns;
        const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
        const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
        const xr = x * Math.cos(rot) - y * Math.sin(rot);
        const yr = x * Math.sin(rot) + y * Math.cos(rot);
        if (i) g.lineTo(cx + xr, cy + yr);
        else g.moveTo(cx + xr, cy + yr);
      }
      g.stroke();
    }
  };
  rosette(1640, 170, 420, 150, 120, 3, 'rgba(122,167,255,0.06)', 6);
  rosette(250, 930, 380, 130, 110, 3, 'rgba(61,255,176,0.055)', 6);
});
await p.screenshot({ path: join(OUT, 'bg-pattern.png'), omitBackground: true });
console.log('bg-pattern');

// 2. Card frames per layout and colour: below (shadow + glow), above (hairline ring), mask.
const frames = new Set();
for (const s of Object.values(SCENES)) {
  const L = LAYOUTS[s.layout];
  if (L.frameless) continue;
  const key = `${s.layout}-${s.where}`;
  if (frames.has(key)) continue;
  frames.add(key);
  const c = COLOR[s.where];
  const box = `left:${L.x}px;top:${L.y}px;width:${L.w}px;height:${L.h}px;border-radius:${RADIUS}px;position:absolute`;
  await shot(
    `under-${key}`,
    `<div style="${box};background:#0b0a1f;box-shadow:0 50px 120px -30px rgba(0,0,0,.9),0 0 90px -20px ${c}66"></div>`,
  );
  await shot(
    `over-${key}`,
    `<div style="${box};box-sizing:border-box;border:1.5px solid ${c}8c"></div>`,
  );
  if (!existsSync(join(OUT, `mask-${s.layout}.png`))) {
    await p.setViewportSize({ width: L.w, height: L.h });
    await p.setContent(
      `<html><body style="margin:0;background:#000"><div style="width:${L.w}px;height:${L.h}px;border-radius:${RADIUS}px;background:#fff"></div></body></html>`,
    );
    await p.screenshot({ path: join(OUT, `mask-${s.layout}.png`) });
    await p.setViewportSize({ width: W, height: H });
  }
}
console.log('frames', [...frames].join(' '));

// 3. Captions in the margins.
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pill = (where) =>
  `<span class="pill" style="--c:${COLOR[where]}"><span class="dot"></span>${LABEL[where]}</span>`;
const column = (L) => {
  const left = L.caption === 'column-left' ? 80 : L.x + L.w + 44;
  const width = L.caption === 'column-left' ? L.x - 80 - 44 : W - left - 80;
  return { left, width };
};
// Variant captions for the Flash-Lite cut (video/narration-flash.json), as cap-<id>-flash.png.
const flashFile = join(REPO, 'video/narration-flash.json');
const flash = existsSync(flashFile) ? JSON.parse(readFileSync(flashFile, 'utf8')) : [];
const captioned = [
  ...Object.entries(SCENES),
  ...flash.filter((o) => o.caption).map((o) => [`${o.id}-flash`, { ...SCENES[o.id], ...o.caption }]),
];
for (const [id, s] of captioned) {
  const L = LAYOUTS[s.layout];
  if (L.caption === 'none') continue;
  let html;
  if (L.caption === 'bottom') {
    html = `<div class="bottom"><div><h2>${esc(s.title)}</h2><p>${esc(s.sub)}</p></div>${pill(s.where)}</div>`;
  } else if (L.caption === 'open') {
    // The Envoy mark beside the name: the real logo paths from packages/ui (one source of truth).
    const mark = `<svg width="118" height="118" viewBox="0 0 24 24" fill="none" stroke="#f4f2ff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 14px rgba(61,255,176,.55))">${LOGO_PATHS.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
    html = `<div style="position:absolute;left:0;right:0;top:56px;display:flex;align-items:center;justify-content:center;gap:30px;font:400 120px/1 Fraunces,serif;letter-spacing:-.02em;color:#f4f2ff">${mark}<span style="transform:translateY(-6px)">${esc(s.title)}</span></div>
      <div style="position:absolute;left:0;right:0;top:922px;text-align:center"><p style="font-size:32px;color:#d7d3ee">${esc(s.sub)}</p></div>`;
  } else {
    const { left, width } = column(L);
    html = `<div class="col" style="left:${left}px;width:${width}px"><div>${pill(s.where)}</div><h2>${esc(s.title)}</h2><p>${esc(s.sub)}</p></div>`;
  }
  await shot(`cap-${id}`, html);
}
console.log('captions');

// 4. Wait-cut notes: the label only (the take's real times stay in private-waits.json).
const waitsFile = join(RAW, 'private-waits.json');
const waits = existsSync(waitsFile) ? JSON.parse(readFileSync(waitsFile, 'utf8')) : null;
for (const [id, s] of Object.entries(SCENES)) {
  if (!s.wait) continue;
  const L = LAYOUTS[s.layout];
  const { left, width } = column(L);
  await shot(
    `wait-${id}`,
    `<div class="wait" style="left:${left}px;width:${width - 36}px;bottom:${H - (L.y + L.h)}px"><b>Wait cut</b></div>`, // the label only (owner, 27 Nov): no durations on screen
  );
}
console.log('waits', waits ? JSON.stringify(waits) : '(placeholders)');

// 5. Chapter cards and the closing links.
for (const [id, c] of Object.entries(CHAPTERS))
  await shot(
    `chapter-${id}`,
    `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px">
      <div style="font:400 118px/1 Fraunces,serif;letter-spacing:-.02em;color:#f4f2ff">${esc(c.title)}</div>
      <p style="font-size:30px;color:#c9c5e6">${esc(c.sub)}</p></div>`,
  );
await shot(
  'end-links',
  `<div style="position:absolute;left:0;right:0;bottom:92px;text-align:center;font:500 30px/1.5 PlexMono,monospace;color:#ece9ff">
    <span style="color:#3dffb0">envoy-hybrid-ai.web.app</span>&nbsp;&nbsp;&nbsp;github.com/hesham88/envoy</div>`,
);
console.log('chapters, links');
await b.close();

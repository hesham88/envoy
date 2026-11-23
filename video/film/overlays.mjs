/* global console, document */
/**
 * Renders the film's caption overlays (transparent PNGs, 1920x1080) from HTML with headless Chrome:
 * one step chip per scene, the "wait cut" card, and the closing links. Brand: UV night, Fraunces for
 * display, IBM Plex for text, green = this device, blue = cloud.
 *
 * Usage: node video/film/overlays.mjs  ->  video/out/overlays/<id>.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT = join(HERE, '../out/overlays');
mkdirSync(OUT, { recursive: true });

const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(join(REPO, 'node_modules', pkg, 'files', file)).toString('base64')}`;
const FONTS = `
@font-face { font-family: Plex; font-weight: 500; src: url(${font('@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-500-normal.woff2')}); }
@font-face { font-family: Plex; font-weight: 600; src: url(${font('@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff2')}); }
@font-face { font-family: PlexMono; font-weight: 500; src: url(${font('@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff2')}); }
@font-face { font-family: Fraunces; src: url(${font('@fontsource-variable/fraunces', 'fraunces-latin-opsz-normal.woff2')}); }`;

/** where: 'device' (green), 'cloud' (blue), 'you' (white), 'note' (amber). */
const CHIPS = {
  'n01-hook': ['note', 'Today: you paste everything into the cloud'],
  'n02-promise': ['device', 'Envoy: your private AI agent to the cloud'],
  'n03-live': ['device', 'Live on the page: local rules, nothing sent'],
  'n04-chat': ['device', "Private mode: Chrome's built-in Gemma 4 model (Gemini Nano 4)"],
  'n05-recorder': ['device', 'Privacy flight recorder: every step, where it ran'],
  'n06-approve': ['you', 'You approve the exact text that leaves'],
  'n07-guard': ['note', 'The guard blocks raw details, even disguised'],
  'n08-answer': ['cloud', 'Gemini reasons over tags; the maths is done on your device'],
  'n09-hybrid': ['cloud', 'Firebase AI Logic: ONLY_ON_DEVICE + PREFER_IN_CLOUD'],
  'n10-extension': ['device', 'Chrome extension: the text boxes you choose'],
  'n11-measured': ['device', '36 documents · 263 private details · 0 leaks · 28/28 attacks blocked'],
};
const COLOR = { device: '#3dffb0', cloud: '#7aa7ff', you: '#ece9ff', note: '#ffb547' };

const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
html,body{margin:0;width:1920px;height:1080px;background:transparent;overflow:hidden}
.chip{position:absolute;left:96px;bottom:84px;display:flex;align-items:center;gap:16px;padding:16px 28px 16px 22px;border-radius:999px;
 background:rgba(11,10,31,.82);border:1.5px solid var(--c);box-shadow:0 0 28px -6px var(--c),inset 0 0 18px -10px var(--c);
 font:600 30px/1.2 Plex,sans-serif;color:#ece9ff;letter-spacing:.005em}
.dot{width:14px;height:14px;border-radius:50%;background:var(--c);box-shadow:0 0 14px var(--c)}
.card{position:absolute;left:340px;top:16px;padding:12px 24px;border-radius:999px;background:rgba(11,10,31,.9);border:1.5px solid #ffb547;
 box-shadow:0 0 26px -8px #ffb547;font:500 21px/1.3 Plex,sans-serif;color:#ece9ff;white-space:nowrap}
.card b{font:600 22px/1 Fraunces,serif;color:#ffb547;margin-right:10px}
.links{position:absolute;left:0;right:0;bottom:96px;text-align:center;font:500 30px/1.5 PlexMono,monospace;color:#ece9ff}
.links span{color:#3dffb0}
</style></head><body>${body}</body></html>`;

const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const shot = async (id, html) => {
  await p.setContent(page(html));
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(OUT, `${id}.png`), omitBackground: true });
  console.log(id);
};
for (const [id, [where, text]] of Object.entries(CHIPS))
  await shot(id, `<div class="chip" style="--c:${COLOR[where]}"><span class="dot"></span>${text}</div>`);
await shot(
  'wait-cut',
  `<div class="card"><b>Wait cut</b>About 3.5 minutes on this CPU-only laptop. Times vary a lot by device.</div>`,
);
await shot(
  'n12-links',
  `<div class="links"><span>envoy-hybrid-ai.web.app</span> &nbsp;·&nbsp; github.com/hesham88/envoy</div>`,
);
await b.close();

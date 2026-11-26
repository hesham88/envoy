#!/usr/bin/env node
/**
 * Submission artwork, rendered from HTML with Envoy's own fonts and logo (no third-party marks,
 * as the contest rules require), plus gallery stills taken from the finished film.
 *
 *   docs/submission/youtube-thumbnail.jpg   1280x720  (YouTube custom thumbnail, < 2 MB)
 *   docs/submission/devpost-thumbnail.png   1500x1000 (Devpost project thumbnail, 3:2)
 *   docs/submission/gallery-*.jpg           1920x1080 (Devpost image gallery, from the film)
 *
 * Usage: node scripts/render-submission.mjs [path/to/film.mp4]
 */
import './lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'docs/submission');
mkdirSync(OUT, { recursive: true });
const FILM = process.argv[2] ?? resolve(REPO, '../_backup-1527/envoy-demo-v6.mp4');

const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(join(REPO, 'node_modules', pkg, 'files', file)).toString('base64')}`;
const LOGO = [
  ...readFileSync(join(REPO, 'packages/ui/src/Logo.tsx'), 'utf8')
    .match(/LOGO_PATHS = \{([\s\S]*?)\}/)[1]
    .matchAll(/'(M[^']+)'/g),
].map((m) => m[1]);
const mark = (size, color = '#f4f2ff') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 ${size / 6}px rgba(61,255,176,.55))">${LOGO.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
const shot = readFileSync(join(REPO, 'docs/img/screens/chat-recorder.png')).toString('base64');

const css = `
@font-face { font-family: Plex; font-weight: 500; src: url(${font('@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-500-normal.woff2')}); }
@font-face { font-family: Plex; font-weight: 600; src: url(${font('@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff2')}); }
@font-face { font-family: Mono; font-weight: 500; src: url(${font('@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff2')}); }
@font-face { font-family: Fraunces; src: url(${font('@fontsource-variable/fraunces', 'fraunces-latin-opsz-normal.woff2')}); }
* { box-sizing: border-box; margin: 0; }
body { width: var(--w); height: var(--h); overflow: hidden; color: #f4f2ff; font-family: Plex, sans-serif;
  background: radial-gradient(900px 600px at 78% 30%, #2a1f6b 0%, transparent 60%),
              radial-gradient(700px 500px at 10% 100%, #0c3a33 0%, transparent 60%), #0b0a1f; position: relative; }
.brand { position: absolute; display: flex; align-items: center; gap: 14px; font: 600 var(--bs) Plex; letter-spacing: -.01em; }
h1 { position: absolute; font: 400 var(--hs)/1.0 Fraunces, serif; letter-spacing: -.025em; }
.swap { position: absolute; display: flex; flex-direction: column; gap: var(--gap); }
.row { display: flex; align-items: center; gap: 14px; font: 500 var(--cs) Mono, monospace; }
.raw { color: #ffb547; text-decoration: line-through; text-decoration-thickness: 3px; opacity: .9; }
.arrow { color: #7d7aa8; font-family: Plex; }
.tag { color: #3dffb0; border: 2px solid rgba(61,255,176,.6); background: rgba(61,255,176,.12); padding: 2px 12px; border-radius: 10px; box-shadow: 0 0 24px -8px #3dffb0; }
.shot { position: absolute; border-radius: 22px; overflow: hidden; border: 1.5px solid rgba(61,255,176,.55);
  box-shadow: 0 40px 100px -30px rgba(0,0,0,.9), 0 0 80px -20px rgba(61,255,176,.45); transform: rotate(-2.5deg); }
.shot img { display: block; width: 100%; }
.foot { position: absolute; font: 500 var(--fs) Plex; color: #c9c5e6; }
`;
const page = (w, h, vars, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${css} body{--w:${w}px;--h:${h}px;${vars}}</style></head><body>${body}</body></html>`;

const swap = `
  <div class="row"><span class="raw">Mona Adel</span><span class="arrow">→</span><span class="tag">[PERSON]</span></div>
  <div class="row"><span class="raw">1010192316</span><span class="arrow">→</span><span class="tag">[ACCOUNT]</span></div>`;

const b = await chromium.launch({ channel: 'chrome', headless: true });
const render = async (file, w, h, html, type) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(OUT, file), type, ...(type === 'jpeg' ? { quality: 90 } : {}) });
  await p.close();
  console.log(file);
};

// YouTube: readable at phone size, so few words and big type.
await render(
  'youtube-thumbnail.jpg',
  1280,
  720,
  page(
    1280,
    720,
    '--bs:34px;--hs:104px;--cs:30px;--gap:16px;--fs:22px;',
    `<div class="brand" style="left:64px;top:56px">${mark(52)}Envoy</div>
     <h1 style="left:60px;top:150px;width:700px">Ask the cloud.<br>Keep your secrets.</h1>
     <div class="swap" style="left:66px;top:430px">${swap}</div>
     <div class="foot" style="left:66px;bottom:44px">Private AI on your device, Firebase AI Logic for the cloud</div>
     <div class="shot" style="left:790px;top:80px;width:470px"><img src="data:image/png;base64,${shot}"></div>`,
  ),
  'jpeg',
);

// Devpost: 3:2, the same story with a little more room.
await render(
  'devpost-thumbnail.png',
  1500,
  1000,
  page(
    1500,
    1000,
    '--bs:40px;--hs:120px;--cs:34px;--gap:18px;--fs:26px;',
    `<div class="brand" style="left:80px;top:72px">${mark(60)}Envoy</div>
     <h1 style="left:76px;top:190px;width:800px">Ask the cloud.<br>Keep your secrets.</h1>
     <div class="swap" style="left:82px;top:520px">${swap}</div>
     <div class="foot" style="left:82px;bottom:70px">Your private AI agent to the cloud. Hybrid inference with Firebase AI Logic.</div>
     <div class="shot" style="left:900px;top:110px;width:540px"><img src="data:image/png;base64,${shot}"></div>`,
  ),
  'png',
);
await b.close();

// Gallery: stills from the finished film (real footage, captions included).
if (existsSync(FILM)) {
  for (const [name, at] of [
    ['gallery-1-tags.jpg', 23],
    ['gallery-2-recorder.jpg', 62],
    ['gallery-3-approval.jpg', 72],
    ['gallery-4-guard.jpg', 81],
    ['gallery-5-extension.jpg', 2 * 60 + 12],
    ['gallery-6-upload.jpg', 2 * 60 + 21.5],
    ['gallery-7-measured.jpg', 2 * 60 + 38],
  ]) {
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(at),
      '-i',
      FILM,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      join(OUT, name),
    ]);
    console.log(name);
  }
} else console.log(`film not found at ${FILM}: gallery skipped`);

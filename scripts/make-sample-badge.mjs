#!/usr/bin/env node
/**
 * Makes the sample "phone photo" of a staff badge: apps/web/public/samples/staff-badge.webp.
 * A fictional company and person (the portrait is AI-generated, scripts/assets/badge-portrait.json),
 * laid out as a printed badge with a QR code, photographed in headless Chrome on a desk with a tilt,
 * shading and grain. It exercises what the lab bill doesn't: a face, plus a name, an employee ID, an
 * email and a phone on a card. Everything in it is fictional.
 * Usage: node scripts/make-sample-badge.mjs
 */
import './lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { writeBarcode } from 'zxing-wasm/writer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'apps/web/public/samples/staff-badge.webp');
const exe = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const portrait = readFileSync(resolve(ROOT, 'scripts/assets/badge-portrait.webp')).toString('base64');
const qr = (await writeBarcode('NB-4471-2290|Mona Adel', { format: 'QRCode', scale: 4 })).svg;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1200px;height:860px;overflow:hidden;background:
    radial-gradient(120% 100% at 25% 15%, #8a6f55 0%, #6b533e 50%, #4a3828 100%);}
  .wood{position:absolute;inset:0;opacity:.18;background:repeating-linear-gradient(92deg,
    rgba(0,0,0,.35) 0 2px, transparent 2px 23px, rgba(255,255,255,.12) 23px 24px, transparent 24px 61px);}
  .card{position:absolute;left:150px;top:120px;width:900px;height:560px;border-radius:26px;
    background:linear-gradient(160deg,#ffffff 0%,#f4f6f8 70%,#e9edf1 100%);color:#16202a;
    font:600 26px/1.35 Arial,Helvetica,sans-serif;box-sizing:border-box;padding:0;overflow:hidden;
    transform:perspective(1800px) rotateX(9deg) rotateY(-4deg) rotateZ(-3deg);
    box-shadow:0 34px 70px rgba(0,0,0,.55), 0 3px 8px rgba(0,0,0,.35);}
  .band{height:92px;background:#0f4c5c;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 40px}
  .band b{font:800 30px Arial,Helvetica,sans-serif;letter-spacing:1px}
  .band span{font:600 22px Arial,Helvetica,sans-serif;opacity:.9}
  .body{display:flex;gap:40px;padding:36px 40px}
  .photo{width:250px;height:290px;border-radius:12px;object-fit:cover;flex:none;box-shadow:0 0 0 3px #d6dde3}
  .name{font:800 40px/1.1 Arial,Helvetica,sans-serif;margin:4px 0 6px}
  .role{font:500 24px Arial,Helvetica,sans-serif;color:#3d4a56;margin-bottom:22px}
  .row{font:500 24px/1.6 Arial,Helvetica,sans-serif}
  .row i{font-style:normal;color:#5a6773;display:inline-block;width:150px}
  .qr{position:absolute;right:40px;bottom:34px;width:120px;background:#fff}
  .shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(120deg,rgba(255,255,255,.22),rgba(255,255,255,0) 35%,rgba(0,0,0,.10) 100%);}
  .grain{position:absolute;inset:0;pointer-events:none;opacity:.08;mix-blend-mode:multiply;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");}
</style></head><body><div class="wood"></div>
<div class="card">
  <div class="band"><b>NILEBRIDGE LOGISTICS</b><span>Staff ID card</span></div>
  <div class="body">
    <img class="photo" alt="" src="data:image/webp;base64,${portrait}">
    <div>
      <div class="name">Mona Adel</div>
      <div class="role">Payroll Officer, Cairo office</div>
      <div class="row"><i>Employee</i>NB-4471-2290</div>
      <div class="row"><i>Email</i>mona.adel@example.com</div>
      <div class="row"><i>Phone</i>+20 100 555 0192</div>
      <div class="row"><i>Valid to</i>31 December 2027</div>
    </div>
  </div>
  <img class="qr" alt="" src="data:image/svg+xml;base64,${Buffer.from(qr).toString('base64')}">
  <div class="shade"></div><div class="grain"></div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 860 } });
  await page.setContent(html, { waitUntil: 'load' });
  const png = await page.screenshot({ type: 'png' });
  const webp = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.82).split(',')[1];
  }, png.toString('base64'));
  mkdirSync(dirname(OUT), { recursive: true });
  const buf = Buffer.from(webp, 'base64');
  writeFileSync(OUT, buf);
  console.log(`sample photo: ${OUT} (${Math.round(buf.length / 1024)} KB)`);
} finally {
  await browser.close();
}

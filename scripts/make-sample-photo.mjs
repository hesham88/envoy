#!/usr/bin/env node
/**
 * Makes the sample "phone photo" of a lab bill: apps/web/public/samples/lab-bill.webp.
 * The bill is the fictional lab sample (EN_LAB: same patient, MRN, accession, member ID, claim and
 * IBAN), laid out as a printed page with a real QR code and a Code 128 accession barcode, then
 * photographed in headless Chrome with a slight tilt, perspective, paper tone and grain, so OCR
 * meets what a real photo looks like. Everything in it is fictional.
 * Usage: node scripts/make-sample-photo.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { writeBarcode } from 'zxing-wasm/writer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'apps/web/public/samples/lab-bill.webp');
const exe = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const qr = (
  await writeBarcode('NVL REPORT|MRN 4471-2093-88|ACC LB5520918|Adel Mansour', {
    format: 'QRCode',
    scale: 4,
  })
).svg;
const code128 = (await writeBarcode('LB5520918', { format: 'Code128', scale: 2 })).svg;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1100px;height:1080px;overflow:hidden;background:
    radial-gradient(120% 90% at 30% 20%, #5b5650 0%, #3a3632 55%, #24211e 100%);}
  .paper{position:absolute;left:105px;top:70px;width:860px;padding:54px 60px 48px;box-sizing:border-box;
    background:linear-gradient(180deg,#f7f3ea 0%,#f1ecdf 60%,#ebe5d6 100%);color:#1d1c1a;
    font:17px/1.5 Georgia,'Times New Roman',serif;font-variant-numeric:lining-nums;
    transform:perspective(1700px) rotateX(3.5deg) rotateY(-2deg) rotateZ(-1.6deg);
    box-shadow:0 28px 60px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.35);}
  .grain{position:absolute;inset:0;pointer-events:none;opacity:.09;mix-blend-mode:multiply;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");}
  .shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,rgba(255,255,255,.10),rgba(0,0,0,0) 40%,rgba(0,0,0,.10) 100%);}
  h1{font:700 26px/1.1 Arial,Helvetica,sans-serif;letter-spacing:.5px;margin:0}
  .sub{font:15px Arial,Helvetica,sans-serif;color:#4a4740;margin:4px 0 0}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2a2824;padding-bottom:16px}
  .qr{width:118px;height:auto;display:block;background:#fff}
  .block{margin-top:18px}
  .row{display:flex;gap:10px}
  .k{width:200px;color:#4a4740}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:16px}
  td,th{border-bottom:1px solid #c9c2b2;padding:6px 4px;text-align:left}
  th{font:700 14px Arial,Helvetica,sans-serif;color:#3a3732}
  .bar{width:260px;height:auto;display:block;margin-top:6px;background:#fff}
  .foot{margin-top:18px;font-size:15px;color:#3a3732}
</style></head><body>
<div class="paper">
  <div class="top">
    <div><h1>NILE VALLEY LABORATORIES</h1><p class="sub">Patient report and invoice</p><p class="sub">Collected on 12 October 2026</p></div>
    <img class="qr" alt="" src="data:image/svg+xml;base64,${Buffer.from(qr).toString('base64')}">
  </div>
  <div class="block">
    <div class="row"><span class="k">Patient</span><span>Adel Mansour</span></div>
    <div class="row"><span class="k">National ID</span><span>26809120103456</span></div>
    <div class="row"><span class="k">Phone</span><span>+20 100 901 2345</span></div>
    <div class="row"><span class="k">Email</span><span>adel.mansour@example.com</span></div>
    <div class="row"><span class="k">Address</span><span>11 Tahrir St, Dokki, Giza</span></div>
    <div class="row"><span class="k">MRN</span><span>MRN: 4471-2093-88</span></div>
    <div class="row"><span class="k">Accession</span><span>Accession #LB 5520918</span></div>
    <img class="bar" alt="" src="data:image/svg+xml;base64,${Buffer.from(code128).toString('base64')}">
  </div>
  <div class="block">
    <table>
      <tr><th>Test</th><th>Result</th><th>Reference</th></tr>
      <tr><td>Fasting glucose</td><td>114 mg/dL</td><td>70 to 99 mg/dL</td></tr>
      <tr><td>HbA1c</td><td>5.9%</td><td>below 5.7%</td></tr>
      <tr><td>Vitamin D (25-OH)</td><td>14 ng/mL</td><td>20 ng/mL or more</td></tr>
    </table>
  </div>
  <div class="block">
    <table>
      <tr><th>Fees</th><th>Amount</th></tr>
      <tr><td>Metabolic panel</td><td>EGP 950</td></tr>
      <tr><td>Vitamin D test</td><td>EGP 500</td></tr>
      <tr><td><b>Total lab fee</b></td><td><b>EGP 1,450</b></td></tr>
    </table>
  </div>
  <div class="foot">
    <div>Insurance Member ID: 4410 2093 7712, Policy Plan B. Claim no. 2026-118843.</div>
    <div>Refunds to IBAN EG38 0019 0005 0000 0000 2631 8000 2</div>
    <div>Ordered by Dr. Hany Selim. All people, IDs and numbers are fictional.</div>
  </div>
  <div class="shade"></div><div class="grain"></div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1080 } });
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
    return c.toDataURL('image/webp', 0.8).split(',')[1];
  }, png.toString('base64'));
  mkdirSync(dirname(OUT), { recursive: true });
  const buf = Buffer.from(webp, 'base64');
  writeFileSync(OUT, buf);
  console.log(`sample photo: ${OUT} (${Math.round(buf.length / 1024)} KB)`);
} finally {
  await browser.close();
}

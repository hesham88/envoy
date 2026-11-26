#!/usr/bin/env node
/**
 * OCR eval: are the private details in a photo of a document boxed?
 *
 * For six eval documents (fictional), each in four looks (serif, sans, tilted 2°, low contrast):
 *  1. render the page in headless Chrome and record the GOLD rectangles of every sensitive value
 *     from the page itself (DOM ranges), so an OCR misread shows up as a miss, not as "nothing
 *     to find";
 *  2. screenshot it, and run the PRODUCT's photo path on the screenshot in the app page:
 *     recognizeImage (Tesseract.js 7.0.0 + zxing-wasm, self-hosted) then ocrMask;
 *  3. score: a gold value is boxed when every word of every occurrence is at least 60% covered.
 * No model and no cloud: any Chrome works. Needs the dev server (apps/web) on 5173.
 * Usage: node tests/eval/run-ocr.mjs → tests/eval/ocr-results.json
 */
import '../../scripts/lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const exe = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = process.env.APP_URL ?? 'http://localhost:5173/app';
const CASES = [
  'lease-01-rent-cap',
  'offer-01-severance-calculation',
  'med-03-insurance-copay-cap',
  'freelance-01-kill-fee',
  'loan-01-early-payoff-penalty',
  'noisy-03-unspaced-iban-and-compact-phone',
];
const VARIANTS = {
  serif: 'font:18px/1.55 Georgia,serif;font-variant-numeric:lining-nums;',
  sans: 'font:17px/1.55 Arial,Helvetica,sans-serif;',
  tilted: 'font:18px/1.55 Georgia,serif;font-variant-numeric:lining-nums;transform:rotate(-2deg);',
  'low-contrast': 'font:17px/1.55 Arial,Helvetica,sans-serif;color:#77736b;background:#ebe6da;',
};

const all = JSON.parse(readFileSync(resolve(ROOT, 'tests/eval/cases.json'), 'utf8'));
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const cases = (Array.isArray(all) ? all : all.cases).filter(
  (c) => CASES.includes(c.id) && (!only || c.id === only),
);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const browser = await chromium.launch({ executablePath: exe, headless: true });
const app = await browser.newPage();
const external = new Set();
await app.route('**/*', (r) => {
  const u = new URL(r.request().url());
  // Firebase start-up calls are allowed; any other outside host is recorded and refused.
  if (u.hostname !== 'localhost' && !/googleapis\.com$|google\.com$|gstatic\.com$/.test(u.hostname)) {
    external.add(u.hostname);
    return r.abort();
  }
  return r.continue();
});
await app.goto(APP, { waitUntil: 'networkidle' });
await app.waitForTimeout(3000);
await app.goto(APP, { waitUntil: 'networkidle' });
// The product's own modules, through the dev server.
const fsPath = (p) => `/@fs/${resolve(ROOT, p).replace(/\\/g, '/')}`;
await app.evaluate((p) => {
  globalThis.__ocrPaths = p;
}, { ocr: fsPath('packages/app/src/lib/ocr.ts'), core: fsPath('packages/core/src/ocr-mask.ts') });
const render = await browser.newPage({ viewport: { width: 1000, height: 1300 } });

const rows = [];
for (const c of cases) {
  for (const [variant, css] of Object.entries(VARIANTS)) {
    const html = `<!doctype html><html><body style="margin:0;background:#cfcac0">
      <div id="p" style="margin:60px;padding:48px;width:780px;background:#fbf8f1;${css}white-space:pre-wrap">${esc(c.document)}</div></body></html>`;
    await render.setContent(html);
    const gold = await render.evaluate((values) => {
      const root = document.getElementById('p');
      const text = root.textContent;
      const node = root.firstChild;
      const out = [];
      for (const v of values) {
        let i = text.indexOf(v.value);
        if (i < 0) {
          out.push({ ...v, rects: [], present: false });
          continue;
        }
        // One rectangle per word of every occurrence: only the ink is gold. (A range over the
        // whole value also returns the space at a line break, which no mask should cover.)
        const rects = [];
        while (i >= 0) {
          for (const m of v.value.matchAll(/\S+/g)) {
            const r = document.createRange();
            r.setStart(node, i + m.index);
            r.setEnd(node, i + m.index + m[0].length);
            for (const b of r.getClientRects())
              if (b.width > 1 && b.height > 1)
                rects.push({ x: b.left, y: b.top, w: b.width, h: b.height });
          }
          i = text.indexOf(v.value, i + v.value.length);
        }
        out.push({ ...v, rects, present: true });
      }
      return out;
    }, c.goldSensitive);
    const png = (await render.screenshot({ type: 'png', fullPage: true })).toString('base64');
    const res = await app.evaluate(async (b64) => {
      const { recognizeImage } = await import(globalThis.__ocrPaths.ocr);
      const { ocrMask } = await import(globalThis.__ocrPaths.core);
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const t0 = performance.now();
      const r = await recognizeImage(new Blob([bytes], { type: 'image/png' }), '/ocr');
      const { boxes, text } = ocrMask(r.words);
      return { ms: Math.round(performance.now() - t0), boxes: [...boxes, ...r.barcodes], text };
    }, png);

    const on = res.boxes.filter((b) => b.on);
    const inter = (a, b) =>
      Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const covered = (r) => Math.min(1, on.reduce((s, b) => s + inter(r, b), 0) / (r.w * r.h));
    const scored = gold
      .filter((g) => g.present)
      .map((g) => ({
        type: g.type,
        value: g.value,
        boxed: g.rects.length > 0 && g.rects.every((r) => covered(r) >= 0.6),
        lines: g.rects.length,
        coverage: Math.round(100 * Math.min(...g.rects.map(covered))) / 100,
      }));
    const goldRects = gold.flatMap((g) => g.rects);
    const boxArea = on.reduce((s, b) => s + b.w * b.h, 0);
    const overArea = on.reduce(
      (s, b) => s + Math.max(0, b.w * b.h - goldRects.reduce((t, r) => t + inter(r, b), 0)),
      0,
    );
    const row = {
      case: c.id,
      variant,
      gold: scored.length,
      boxed: scored.filter((s) => s.boxed).length,
      overMasking: boxArea ? Math.round((100 * overArea) / boxArea) / 100 : 0,
      ms: res.ms,
      missed: scored
        .filter((s) => !s.boxed)
        .map((s) => `${s.type}:${s.value} (${s.lines} word box${s.lines === 1 ? '' : 'es'}, covered ${s.coverage})`),
    };
    rows.push(row);
    if (process.env.OCR_TEXT) console.log(res.text);
    console.log(
      `${c.id.padEnd(44)} ${variant.padEnd(13)} ${row.boxed}/${row.gold} boxed, over-masking ${row.overMasking}, ${row.ms} ms${row.missed.length ? `  missed: ${row.missed.join('; ')}` : ''}`,
    );
  }
}
await browser.close();

const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
const byVariant = Object.fromEntries(
  Object.keys(VARIANTS).map((v) => {
    const rs = rows.filter((r) => r.variant === v);
    return [v, { boxed: rs.reduce((s, r) => s + r.boxed, 0), gold: rs.reduce((s, r) => s + r.gold, 0) }];
  }),
);
const pkg = (p) => JSON.parse(readFileSync(resolve(ROOT, 'node_modules', p, 'package.json'), 'utf8')).version;
const summary = {
  generatedAt: new Date().toISOString(),
  engine: `tesseract.js ${pkg('tesseract.js')} (LSTM, eng 4.0.0_best_int) + zxing-wasm ${pkg('zxing-wasm')}, self-hosted`,
  chrome: browser.version?.() ?? 'Chrome (headless)',
  method:
    'product path (recognizeImage + ocrMask) on screenshots of eval documents; gold rectangles from the rendered page; boxed = every word of every occurrence at least 60% covered',
  recall: Math.round((10000 * sum('boxed')) / sum('gold')) / 10000,
  boxed: sum('boxed'),
  gold: sum('gold'),
  overMaskingMean: Math.round((100 * rows.reduce((s, r) => s + r.overMasking, 0)) / rows.length) / 100,
  msMedian: rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
  byVariant,
  externalHostsRefused: [...external],
  rows,
};
writeFileSync(resolve(ROOT, 'tests/eval/ocr-results.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  `ocr-eval: ${summary.boxed}/${summary.gold} sensitive values boxed (${(summary.recall * 100).toFixed(1)}%), over-masking ${summary.overMaskingMean}, median ${summary.msMedian} ms`,
);

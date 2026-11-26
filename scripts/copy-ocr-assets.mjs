#!/usr/bin/env node
/**
 * Copies the on-device OCR and barcode engines into an app's public folder, so they are served
 * from our own origin (or extension package): never from a CDN.
 *   <public>/ocr/worker.min.js            Tesseract.js 7.0.0 worker
 *   <public>/ocr/core/*-lstm.wasm.js      Tesseract core, LSTM engine (relaxed-SIMD, SIMD, plain)
 *   <public>/ocr/lang/eng.traineddata.gz  English LSTM data (4.0.0_best_int)
 *   <public>/ocr/zxing_reader.wasm        zxing-wasm 3.1.6 barcode reader
 * The worker's own CDN defaults (cdn.jsdelivr.net) are rewritten to a path that does not exist:
 * we always pass our paths, and a Manifest V3 package must not even name remote code (Web Store
 * rejection, 26 Nov 2026; apps/extension/scripts/check-remote-code.mjs).
 * Usage: node scripts/copy-ocr-assets.mjs <public dir>. The copies are gitignored.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.cwd(), process.argv[2] ?? 'public', 'ocr');
// Workspace installs hoist to the root node_modules; packages/app's own is the fallback.
const pkgDir = (name) => {
  const dir = [
    resolve(ROOT, 'node_modules', name),
    resolve(ROOT, 'packages/app/node_modules', name),
  ].find((d) => existsSync(resolve(d, 'package.json')));
  if (!dir) throw new Error(`${name} is not installed (npm install)`);
  return dir;
};

const files = [
  [resolve(pkgDir('tesseract.js'), 'dist/worker.min.js'), 'worker.min.js'],
  ...['relaxedsimd-lstm', 'simd-lstm', 'lstm'].map((v) => [
    resolve(pkgDir('tesseract.js-core'), `tesseract-core-${v}.wasm.js`),
    `core/tesseract-core-${v}.wasm.js`,
  ]),
  [
    resolve(pkgDir('@tesseract.js-data/eng'), '4.0.0_best_int/eng.traineddata.gz'),
    'lang/eng.traineddata.gz',
  ],
  [resolve(pkgDir('zxing-wasm'), 'dist/reader/zxing_reader.wasm'), 'zxing_reader.wasm'],
];

let total = 0;
for (const [from, to] of files) {
  const dest = resolve(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  if (to.endsWith('.js'))
    writeFileSync(
      dest,
      readFileSync(from, 'utf8').replace(
        /https:\/\/(?:cdn|fastly)\.jsdelivr\.net\//g,
        '/no-remote-code/',
      ),
    );
  else copyFileSync(from, dest);
  total += statSync(dest).size;
}
console.log(`ocr assets: ${files.length} files, ${(total / 1048576).toFixed(1)} MB → ${out}`);

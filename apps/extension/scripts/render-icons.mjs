/* global console */
/**
 * Renders the extension icons (16, 32, 48, 128 px) from code: Envoy's shield mark on a UV-night
 * tile, inside a guilloche ring at the larger sizes. Writes apps/extension/public/icons/icon-<n>.png.
 * Usage: node apps/extension/scripts/render-icons.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

// The Logo paths from @envoy/ui (24x24 viewBox).
const SEAL = 'M12 2.75 19.25 5.6v5.65c0 4.55-3.05 8.35-7.25 9.95-4.2-1.6-7.25-5.4-7.25-9.95V5.6Z';
const FLAP = 'M6.9 7.4 12 10.9l5.1-3.5';
const CHEVRON = 'M10.4 13.3 13.4 15.75 10.4 18.2';

function ring(cx, cy, r, amp, waves, strands) {
  const paths = [];
  for (let s = 0; s < strands; s++) {
    let d = '';
    for (let i = 0; i <= 360; i++) {
      const t = (i / 360) * Math.PI * 2;
      const rr = r + amp * Math.sin(t * waves + (s * Math.PI * 2) / strands);
      d += `${i ? 'L' : 'M'}${(cx + rr * Math.cos(t)).toFixed(2)} ${(cy + rr * Math.sin(t)).toFixed(2)}`;
    }
    paths.push(`<path d="${d}Z"/>`);
  }
  return paths.join('');
}

function svg(size) {
  const small = size <= 32;
  const radius = size * 0.22;
  // Mark size: fills more of the tile at small sizes so it stays legible.
  const mark = small ? 0.78 : 0.5;
  const s = (size * mark) / 24;
  const off = (size - 24 * s) / 2;
  const stroke = small ? 2.4 : 1.8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#1b1640"/><stop offset="1" stop-color="#0b0a1c"/></radialGradient></defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  ${small ? '' : `<g fill="none" stroke="#7d95ff" stroke-width="${size / 128}" opacity="0.75">${ring(size / 2, size / 2, size * 0.4, size * 0.025, 22, 3)}</g>
  <g fill="none" stroke="#3dffb0" stroke-width="${size / 160}" opacity="0.55">${ring(size / 2, size / 2, size * 0.34, size * 0.018, 16, 2)}</g>`}
  <g transform="translate(${off} ${off}) scale(${s})" fill="none" stroke="#3dffb0" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 ${small ? 0 : 1.2}px #3dffb0)">
    <path d="${SEAL}"/><path d="${FLAP}"/><path d="${CHEVRON}"/>
  </g>
</svg>`;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`);
  await page.screenshot({ path: join(OUT, `icon-${size}.png`), omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons in', OUT);

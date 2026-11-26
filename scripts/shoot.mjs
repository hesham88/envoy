#!/usr/bin/env node
/**
 * Renders a page (or one element) of the running app to PNG with the installed Chrome, headless.
 * Usage: node scripts/shoot.mjs <url> <out.png> [--selector css] [--width 1280] [--height 900] [--wait 2500] [--dark] [--scale 2]
 */
import './lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [url, out, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(
  rest.reduce(
    (a, v, i, all) =>
      v.startsWith('--')
        ? [
            ...a,
            [
              v.slice(2),
              all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1],
            ],
          ]
        : a,
    [],
  ),
);
if (!url || !out) {
  console.error(
    'usage: node scripts/shoot.mjs <url> <out.png> [--selector css] [--width n] [--height n] [--wait ms] [--dark] [--scale n]',
  );
  process.exit(2);
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: Number(opt.width ?? 1280), height: Number(opt.height ?? 900) },
  deviceScaleFactor: Number(opt.scale ?? 2),
  colorScheme: opt.dark ? 'dark' : 'light',
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(opt.wait ?? 2500));
mkdirSync(dirname(out), { recursive: true });
if (opt.selector) await page.locator(String(opt.selector)).first().screenshot({ path: out });
else await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`saved ${out}`);

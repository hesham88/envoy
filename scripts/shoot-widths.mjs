#!/usr/bin/env node
/**
 * Screenshot one page at several widths (phone to desktop) and report horizontal overflow.
 * Usage: node scripts/shoot-widths.mjs <url> <outDir> [--widths 360,390,768,1280] [--selector css]
 * With --selector, only that element is shot (scrolled into view first).
 */
import './lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [url, out] = process.argv.slice(2);
const opt = (n, d) =>
  process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d;
const widths = opt('widths', '360,390,768,1280').split(',').map(Number);
const selector = opt('selector', '');
const reduced = process.argv.includes('--reduced');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const w of widths) {
    const page = await browser.newPage({
      viewport: { width: w, height: w < 700 ? 800 : 900 },
      deviceScaleFactor: w < 700 ? 2 : 1,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const file = join(out, `w${w}${reduced ? '-reduced' : ''}.png`);
    if (selector) {
      const el = page.locator(selector).first();
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(Number(opt('wait', 1200)));
      await el.screenshot({ path: file });
    } else {
      await page.waitForTimeout(600);
      await page.screenshot({ path: file });
    }
    console.log(`${w}px: overflow ${overflow}px -> ${file}`);
    await page.close();
  }
} finally {
  await browser.close();
}

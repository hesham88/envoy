#!/usr/bin/env node
/**
 * Screenshot each state of a stepped widget: click the n-th button matching --buttons, wait, shoot
 * the --target element. Used to check the landing page's step walkthrough at phone and desktop sizes.
 * Usage: node scripts/shoot-steps.mjs <url> <outDir> --target ".relay" --buttons ".relay-step"
 *        [--widths 390,1280] [--wait 1800] [--reduced]
 */
import './lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [url, out] = process.argv.slice(2);
const opt = (n, d) =>
  process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d;
const target = opt('target', '.relay');
const buttons = opt('buttons', '.relay-step');
const widths = opt('widths', '390,1280').split(',').map(Number);
const wait = Number(opt('wait', 1800));
const reduced = process.argv.includes('--reduced');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const w of widths) {
    const page = await browser.newPage({
      viewport: { width: w, height: 900 },
      deviceScaleFactor: w < 700 ? 2 : 1,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const el = page.locator(target).first();
    await el.scrollIntoViewIfNeeded();
    const n = await page.locator(buttons).count();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    console.log(`${w}px: ${n} steps, page overflow ${overflow}px`);
    for (let i = 0; i < n; i++) {
      await page.locator(buttons).nth(i).click();
      await page.waitForTimeout(wait);
      await el.screenshot({ path: join(out, `w${w}-s${i + 1}${reduced ? '-r' : ''}.png`) });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

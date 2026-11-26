#!/usr/bin/env node
/**
 * Renders Envoy's brand assets from the running dev server into docs/img/brand/:
 *   section-<slug>.png (README banners), emblem-<step>.png, seal.png, hero.png (still) and
 *   hero.webp (animated loop of the DelegationScene, from frame-exact renders + ffmpeg).
 * Usage: node scripts/render-brand.mjs [--app http://localhost:5173] [--frames 60] [--only banners|emblems|hero]
 */
import './lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const APP = opt('app', 'http://localhost:5173');
const FRAMES = Number(opt('frames', 60));
const ONLY = opt('only', 'all');
const OUT = 'docs/img/brand';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1700, height: 1000 },
  deviceScaleFactor: 1.5,
  colorScheme: 'light',
  reducedMotion: 'no-preference',
});

if (ONLY === 'all' || ONLY === 'banners') {
  await page.goto(`${APP}/studio/banners`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // let seal strokes finish drawing in
  for (const el of await page.locator('[data-banner]').all()) {
    const slug = await el.getAttribute('data-banner');
    await el.screenshot({ path: join(OUT, `section-${slug}.png`) });
    console.log(`section-${slug}.png`);
  }
}

if (ONLY === 'all' || ONLY === 'emblems') {
  await page.goto(`${APP}/studio`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('div')?.classList.add('envoy-uv'));
  await page.waitForTimeout(2500);
  const emblems = page.locator('[data-plate=emblems] figure');
  const keys = ['detect', 'minimize', 'approve', 'reason', 'restore'];
  for (let i = 0; i < (await emblems.count()); i++) {
    await emblems.nth(i).screenshot({ path: join(OUT, `emblem-${keys[i]}.png`) });
  }
  await page
    .locator('[data-plate=seal] [role=img]')
    .first()
    .screenshot({ path: join(OUT, 'seal.png') });
  console.log('emblems + seal');
}

if (ONLY === 'all' || ONLY === 'hero') {
  const tmp = join(OUT, '.frames');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 620 });
  for (let i = 0; i < FRAMES; i++) {
    await page.goto(`${APP}/studio/scene?frame=${(i / FRAMES).toFixed(4)}`, {
      waitUntil: 'networkidle',
    });
    await page.waitForTimeout(120);
    await page
      .locator('[data-scene-frame]')
      .screenshot({ path: join(tmp, `f-${String(i).padStart(3, '0')}.png`) });
  }
  await page.goto(`${APP}/studio/scene?frame=0.5`, { waitUntil: 'networkidle' });
  await page.locator('[data-scene-frame]').screenshot({ path: join(OUT, 'hero.png') });
  const fps = (FRAMES / 10).toFixed(2); // the scene loops every 10 s
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-framerate',
    fps,
    '-i',
    join(tmp, 'f-%03d.png'),
    '-vf',
    'scale=1280:-1:flags=lanczos',
    '-loop',
    '0',
    '-c:v',
    'libwebp',
    '-quality',
    '82',
    '-compression_level',
    '6',
    join(OUT, 'hero.webp'),
  ]);
  rmSync(tmp, { recursive: true, force: true });
  console.log('hero.png + hero.webp');
}

await browser.close();

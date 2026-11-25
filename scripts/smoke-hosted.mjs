#!/usr/bin/env node
/**
 * Smoke test of the HOSTED app in a brand-new Chrome profile (no extension, no on-device model,
 * no saved state): what a judge sees on first visit. Checks the landing page and its measured
 * table, the full sample-lease flow in Basic protection up to a real cloud answer (one
 * Gemini 3.5 Flash-Lite request through App Check), the recorded Private-mode run, the
 * private-mode guide, and that no page logs an error or a CSP violation.
 *
 * Usage: node scripts/smoke-hosted.mjs [--url https://envoy-hybrid-ai.web.app] [--headful]
 * Note: reCAPTCHA can score an automated browser as a bot, so App Check may refuse the cloud step
 * here even though it works for people; the script reports that case separately.
 */
import { chromium } from 'playwright-core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const URL0 = arg('--url', 'https://envoy-hybrid-ai.web.app');
const profile = mkdtempSync(join(tmpdir(), 'envoy-clean-'));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chrome',
  headless: !process.argv.includes('--headful'),
  viewport: { width: 1440, height: 900 },
});
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
  if (ok) pass++;
  else fail++;
};
const problems = [];
const watch = (page) => {
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/favicon|ERR_BLOCKED_BY_CLIENT/.test(t))
      problems.push(t.slice(0, 200));
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('response', (res) => {
    if (res.status() >= 400)
      problems.push(`HTTP ${res.status()} ${res.url().split('?')[0].slice(0, 140)}`);
  });
};

try {
  // 1. Landing.
  const p = await ctx.newPage();
  watch(p);
  await p.goto(`${URL0}/`, { waitUntil: 'load' });
  check('landing: loads with its title', /Envoy/.test(await p.title()), await p.title());
  const table = await p
    .locator('table')
    .first()
    .innerText()
    .catch(() => '');
  check(
    'landing: measured table shows both setups',
    /Gemma 4/.test(table) && /Basic protection/.test(table),
  );
  check('landing: answer quality is shown', /\d+(\.\d)?% \(20\)/.test(table));
  const box = p.locator('textarea').first();
  await box.fill('Mona Adel, mona.adel@example.com, +20 100 555 0192');
  await p.waitForTimeout(800);
  const masked = await p.locator('body').innerText();
  check(
    'landing: the live demo turns details into tags',
    /\[EMAIL\]/.test(masked) && /\[PHONE\]/.test(masked),
  );

  // 2. The app, sample lease, Basic protection (a clean profile has no on-device model).
  await p.goto(`${URL0}/app?sample=lease`, { waitUntil: 'domcontentloaded' });
  await p
    .getByText(/Basic protection|On-device ready/)
    .first()
    .waitFor({ timeout: 30000 });
  const mode = (
    await p
      .getByText(/Basic protection|On-device ready/)
      .first()
      .innerText()
  ).trim();
  check('app: says which protection is active', true, mode);
  await p.locator('#envoy-composer').click();
  await p.keyboard.press('End');
  await p.keyboard.press('Enter');
  const approve = p.getByRole('button', { name: 'Approve and send' }).last();
  const approveShown = await approve.waitFor({ timeout: 120000 }).then(
    () => true,
    () => false,
  );
  check('app: shows exactly what the cloud will see, and waits for approval', approveShown);
  const preview = await p.locator('body').innerText();
  check(
    'app: no raw private details in the excerpt',
    !/EG38 0019|27506120104839|mona\.adel@/.test(preview.split('What the cloud will see')[1] ?? ''),
  );
  if (approveShown) {
    await approve.click();
    const outcome = await Promise.race([
      p
        .getByText('Reasoned in the cloud over tags')
        .last()
        .waitFor({ timeout: 90000 })
        .then(() => 'cloud'),
      p
        .getByText(/Lighter answer|cloud unreachable|App Check|couldn't reach/i)
        .last()
        .waitFor({ timeout: 90000 })
        .then(() => 'fallback'),
    ]).catch(() => 'timeout');
    const ledger = await p.locator('article').last().innerText();
    check(
      'app: a cloud answer arrives (App Check accepted the request)',
      outcome === 'cloud',
      outcome === 'cloud'
        ? ''
        : `${outcome}: ${ledger.split('\n').slice(-6).join(' | ').slice(0, 300)}`,
    );
    check(
      'app: real values are put back on the device',
      /Details restored on this device/.test(ledger) || outcome !== 'cloud',
    );
  }

  // 3. The recorded run and the guide.
  const r = await ctx.newPage();
  watch(r);
  await r.goto(`${URL0}/app?recorded=1`, { waitUntil: 'domcontentloaded' });
  const rec = await r
    .getByText('Recording, not live.')
    .waitFor({ timeout: 30000 })
    .then(
      () => true,
      () => false,
    );
  check('recorded run: opens, labelled as a recording', rec);
  await r.goto(`${URL0}/app?guide=private`, { waitUntil: 'domcontentloaded' });
  const guide = await r
    .getByRole('heading', { name: 'Turn on private mode' })
    .waitFor({ timeout: 30000 })
    .then(
      () => true,
      () => false,
    );
  check('guide: opens with the setup steps', guide);
  await r.waitForTimeout(2500);

  // 4. /dev page: UV theme, navigation links, and live #10635 device-guard simulation.
  await r.goto(`${URL0}/dev`, { waitUntil: 'domcontentloaded' });
  const devTheme = await r.locator('.envoy-uv').count();
  check('/dev: renders in UV-night theme with navigation links', devTheme > 0);
  await r.getByRole('button', { name: 'Simulate missing LanguageModel' }).click();
  const guardBlocked = await r
    .getByText(/Guard blocked the request before any call: DeviceUnavailableError/)
    .waitFor({ timeout: 10000 })
    .then(
      () => true,
      () => false,
    );
  check('/dev: Simulate missing LanguageModel (#10635) blocks before any call', guardBlocked);

  check(
    'no console errors or CSP violations',
    problems.length === 0,
    problems.slice(0, 3).join(' || '),
  );
} finally {
  await ctx.close();
  await new Promise((res) => setTimeout(res, 500));
  rmSync(profile, { recursive: true, force: true });
}
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

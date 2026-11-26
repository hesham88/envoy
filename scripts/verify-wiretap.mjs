#!/usr/bin/env node
/**
 * Wiretap check: proves the "What leaves" pane shows what actually left.
 *
 * Drives the real app in Chrome (Basic protection, so any Chrome works), approves one sample
 * question, and reads the real request body from Chrome's network layer. Passes only if:
 *  1. exactly one request went to the Firebase AI Logic endpoint;
 *  2. the excerpt shown in the pane appears verbatim inside that request;
 *  3. none of the real values the pane highlights ("What you see") appear anywhere in it.
 *
 * Usage: start the dev server first (apps/web: VITE_CLOUD_MODEL=gemini-3.5-flash-lite npx vite --port 5173),
 * then: node scripts/verify-wiretap.mjs [--url http://localhost:5173]
 * Costs one Flash-Lite request. Never point it at Hydrogen.
 */
import './lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
import { chromium } from 'playwright-core';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const base = arg('url', 'http://localhost:5173');
const exe = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const AI = 'firebasevertexai.googleapis.com';

const fail = (msg) => {
  console.error(`wiretap-check: FAIL ${msg}`);
  process.exitCode = 1;
};

const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const bodies = [];
  page.on('request', (r) => {
    if (r.url().includes(AI)) bodies.push({ url: r.url(), body: r.postData() ?? '' });
  });

  await page.goto(`${base}/app`, { waitUntil: 'networkidle' });
  await page
    .getByRole('button', { name: /Can my landlord raise the rent 20% this year\?/ })
    .click();
  await page.getByRole('button', { name: 'Approve and send' }).click({ timeout: 60_000 });
  await page.waitForSelector('[data-wiretap-out]', { timeout: 90_000 });
  await page.waitForSelector('[data-testid=wiretap-worked], [role=alert]', { timeout: 90_000 });

  let shown = await page.locator('[data-wiretap-out]').first().textContent();
  // --self-test: pretend the pane showed something else; the check must then fail.
  if (process.argv.includes('--self-test')) shown = `${shown} [tampered]`;
  const real = await page
    .getByRole('region', { name: 'What you see' })
    .locator('mark')
    .allTextContents();
  const model = (
    await page
      .getByText(/^Sent to /)
      .first()
      .textContent()
  )?.replace('Sent to ', '');

  if (bodies.length !== 1) fail(`expected 1 request to ${AI}, saw ${bodies.length}`);
  const raw = bodies.map((b) => b.body).join('\n');
  let texts = '';
  for (const b of bodies) {
    try {
      const j = JSON.parse(b.body);
      texts += (j.contents ?? [])
        .flatMap((c) => c.parts ?? [])
        .map((p) => p.text ?? '')
        .join('\n');
    } catch {
      fail(`request body is not JSON: ${b.body.slice(0, 80)}`);
    }
  }
  if (!shown || !texts.includes(shown))
    fail('the excerpt shown in the pane is not inside the request');
  const leaked = [...new Set(real)].filter((v) => v.length > 2 && raw.includes(v));
  if (real.length < 5) fail(`expected the pane to highlight real values, saw ${real.length}`);
  if (leaked.length) fail(`real values found in the request: ${leaked.join(', ')}`);

  if (!process.exitCode)
    console.log(
      `wiretap-check: OK ${new Date().toISOString().slice(0, 10)} ${model} ` +
        `(1 request, ${shown.length} chars shown = sent, ${new Set(real).size} real values absent)`,
    );
} finally {
  await browser.close();
}

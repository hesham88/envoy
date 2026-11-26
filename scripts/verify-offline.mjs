#!/usr/bin/env node
/**
 * Offline check, in the real app with the on-device model (Gemma 4, model Chrome on CDP 9333):
 *  1. with the network switched off (Chrome's own emulation), a document question is answered on
 *     this device: no request to Firebase AI Logic, "Nothing has left this device";
 *  2. --hold: a question that needs the cloud is held on the device while offline ("Send when I'm
 *     back online"); when the network returns it is sent exactly once and answered.
 * Prereqs: model Chrome (docs/PLAN.md), dev server on 5173 started with
 * VITE_CLOUD_MODEL=gemini-3.5-flash-lite. Usage: node scripts/verify-offline.mjs [--hold]
 */
import { chromium } from 'playwright-core';

const AI = 'firebasevertexai.googleapis.com';
const hold = process.argv.includes('--hold');
const fail = (m) => {
  console.error(`offline-check: FAIL ${m}`);
  process.exitCode = 1;
};

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const aiRequests = [];
page.on('request', (r) => r.url().includes(AI) && aiRequests.push(Date.now()));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const network = (offline) =>
  cdp.send('Network.emulateNetworkConditions', {
    offline,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

try {
  await page.goto('http://localhost:5173/app?sample=lease', { waitUntil: 'networkidle' });
  await page.getByText('On-device ready').first().waitFor({ timeout: 120_000 });
  await network(true);
  const offline = await page.evaluate(() => navigator.onLine === false);
  if (!offline) fail('navigator.onLine did not turn false');
  await page.getByText("You're offline.").first().waitFor({ timeout: 10_000 });

  // 1. A local question, answered with no network at all.
  const composer = page.getByRole('textbox');
  await composer.fill('What is my monthly rent?');
  await composer.press('Enter');
  await page.getByText('Answered on this device').first().waitFor({ timeout: 400_000 });
  // The answer card, not the flight recorder above it.
  if (!(await page.getByText(/rent is EGP 8,500/).first().isVisible().catch(() => false)))
    fail('the local answer does not give the rent (EGP 8,500)');
  if (aiRequests.length) fail(`${aiRequests.length} request(s) went to ${AI} while offline`);
  if (!(await page.getByText('Nothing has left this device.').first().isVisible()))
    fail('the wiretap does not say nothing left');
  if (!process.exitCode) console.log('offline-check: local answer OK (no network, 0 cloud requests)');

  if (hold) {
    // 2. A cloud question while offline: held, then sent once when the network returns.
    const answeredBefore = await page.getByText('Answered on this device').count();
    await composer.fill('Can my landlord raise the rent 20% this year?');
    // Send ignores Enter while the last turn is still finishing: wait until Send is enabled.
    const sendBtn = page.getByRole('button', { name: 'Send', exact: true });
    await page.waitForFunction(
      () => !document.querySelector('button[aria-label="Send"]')?.disabled,
      null,
      { timeout: 120_000 },
    );
    await sendBtn.click();
    if (await composer.inputValue()) fail('the second question was not sent');
    // Gemma 4 routes each question itself: wait for the hold offer OR an on-device answer.
    const holdBtn = page.getByRole('button', { name: "Send when I'm back online" }).last();
    const outcome = await Promise.race([
      holdBtn.waitFor({ timeout: 600_000 }).then(() => 'hold'),
      page
        .waitForFunction(
          (n) => document.body.innerText.split('Answered on this device').length - 1 > n,
          answeredBefore,
          { timeout: 600_000, polling: 2000 },
        )
        .then(() => 'local'),
    ]).catch(async (e) => {
      if (process.env.OFFLINE_SHOT) await page.screenshot({ path: process.env.OFFLINE_SHOT });
      throw e;
    });
    if (outcome === 'local')
      throw new Error(
        'inconclusive: Gemma 4 answered the cloud question on the device this time, so no hold was offered',
      );
    await holdBtn.click();
    await page.getByText('Held on this device: waiting for the network').waitFor();
    await page.waitForTimeout(2000);
    if (aiRequests.length) fail('a held request was sent while offline');
    await network(false);
    await page.getByText(/Reasoned in the cloud over tags/).last().waitFor({ timeout: 120_000 });
    await page.waitForTimeout(1500);
    if (aiRequests.length !== 1) fail(`expected 1 cloud request after reconnecting, saw ${aiRequests.length}`);
    if (!process.exitCode)
      console.log('offline-hold-check: OK (held while offline, sent once on reconnect, answered)');
  }
} finally {
  await network(false).catch(() => undefined);
  await page.close();
  await browser.close(); // drops the CDP connection only; Chrome keeps running
}

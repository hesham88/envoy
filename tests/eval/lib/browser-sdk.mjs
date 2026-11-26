/**
 * Shared browser Firebase AI Logic SDK bridge for Argon's eval lane (`tests/eval/**`).
 *
 * Runs real Firebase AI Logic SDK calls (`initEnvoy`, `loadRemoteSettings`, `getGenerativeModel`,
 * `InferenceMode.ONLY_IN_CLOUD`, App Check) INSIDE a real Chromium browser page served by Argon's
 * Vite dev server.
 *
 * - For `ONLY_IN_CLOUD` evaluations (attacks, raw-doc ceiling, judge) and `basic` arm runs,
 *   launches an isolated headless Chromium on CDP port 9334 (never touches the shared on-device
 *   model Chrome on port 9333).
 * - Also bootstraps `globalThis.__envoyEval` on any page with `loadRemoteSettings(app)` +
 *   `cloudModelOverride()` (matching `packages/app/src/app/useEnvoy.ts`) before `runCase()` runs.
 */
import '../../../scripts/lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const fsUrl = (p) => `/@fs/${resolve(ROOT, p).replace(/\\/g, '/')}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ensureViteReachable(appUrl) {
  try {
    const ping = await fetch(appUrl);
    if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
  } catch (err) {
    throw new Error(
      `Dev server not reachable at ${appUrl} (${err.message}). Start Argon Vite on port 5174 first.`,
      { cause: err },
    );
  }
}

/**
 * Launches a self-contained headless Chromium instance with on-device AI disabled
 * (safe for `basic` arm and `ONLY_IN_CLOUD` Firebase AI Logic SDK calls; never touches port 9333).
 */
export async function launchHeadlessSdkPage({
  appUrl = 'http://localhost:5174/',
  cdpPort = 9334,
} = {}) {
  await ensureViteReachable(appUrl);
  const chromePaths = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  const executablePath = chromePaths.find((p) => existsSync(p));
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      `--remote-debugging-port=${cdpPort}`,
      '--disable-features=OptimizationGuideOnDeviceModel,PromptAPIForGeminiNano',
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  const info = await initBrowserSdk(page);
  return {
    browser,
    page,
    info,
    close: async () => {
      await page.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}

/**
 * Bootstraps Firebase (`initEnvoy`), Remote Config (`loadRemoteSettings`), `cloudModelOverride()`,
 * and `globalThis.__envoyEval` on the given Playwright page so both `runCase()` and in-browser
 * `ONLY_IN_CLOUD` SDK calls use the real Firebase AI Logic SDK with App Check.
 */
export async function initBrowserSdk(page) {
  return page.evaluate(
    async ({ paths }) => {
      const ai = await import(paths.ai);
      const core = await import(paths.core);
      const env = await import('/src/env.ts');
      const g = globalThis;
      if (!g.__envoyEvalSdk) {
        const { app, ai: fbAi } = ai.initEnvoy(env.readFirebaseEnv(), { dev: true });
        const remote = await ai.loadRemoteSettings(app);
        const override = env.cloudModelOverride();
        const settings = { ...remote, cloudModel: override ?? remote.cloudModel };
        const schemas = {
          detect: core.DETECT_SCHEMA,
          minimize: core.MINIMIZE_SCHEMA,
          route: core.ROUTE_SCHEMA,
        };
        const models = Object.fromEntries(
          ['detect', 'minimize', 'route', 'answerLocal', 'reason'].map((s) => [
            s,
            ai.createStepModel(fbAi, s, settings, schemas[s]),
          ]),
        );
        const deps = {
          runPrivate: ai.runPrivate,
          models,
          getDeviceStatus: ai.getDeviceStatus,
        };
        g.__envoyEval = { deps };
        g.__envoyEvalSdk = { app, fbAi, settings, deps };
      }
      return {
        cloudModel: g.__envoyEvalSdk.settings.cloudModel,
        promptVersion: g.__envoyEvalSdk.settings.promptVersion,
      };
    },
    {
      paths: {
        ai: fsUrl('packages/ai/src/index.ts'),
        core: fsUrl('packages/core/src/index.ts'),
      },
    },
  );
}

/**
 * Executes a cloud inference call INSIDE the browser page using the Firebase AI Logic SDK
 * (`getGenerativeModel` with `InferenceMode.ONLY_IN_CLOUD`, Remote Config `cloud_model` /
 * `VITE_CLOUD_MODEL`, and App Check). Includes 429 exponential backoff and Free-Tier pacing.
 */
export async function callCloudViaSdk(
  page,
  prompt,
  { json = false, temperature = 0.1, maxOutputTokens = 512, paceMs = 4200, attempt = 0 } = {},
) {
  await initBrowserSdk(page);
  const res = await page.evaluate(
    async ({ prompt, json, temperature, maxOutputTokens, bridgeUrl }) => {
      const bridge = await import(bridgeUrl);
      const { fbAi, settings } = globalThis.__envoyEvalSdk;
      return bridge.generateOnlyInCloud(fbAi, settings.cloudModel, prompt, {
        json,
        temperature,
        maxOutputTokens,
      });
    },
    {
      prompt,
      json,
      temperature,
      maxOutputTokens,
      bridgeUrl: fsUrl('tests/eval/lib/sdk-bridge.mjs'),
    },
  );

  if (!res.ok) {
    const isTransient =
      /429|500|502|503|504|RESOURCE_EXHAUSTED|quota|rate.?limit|fetch-network-error|Failed to fetch|network/i.test(
        res.error,
      );
    if (isTransient && attempt < 4) {
      const waitMs = 12000 * (attempt + 1);
      console.warn(
        `[sdk:ONLY_IN_CLOUD] transient error (${res.error.slice(0, 120)}); backing off ${waitMs}ms (attempt ${attempt + 1}/4)...`,
      );
      await sleep(waitMs);
      return callCloudViaSdk(page, prompt, {
        json,
        temperature,
        maxOutputTokens,
        paceMs,
        attempt: attempt + 1,
      });
    }
    throw new Error(`Firebase AI Logic ONLY_IN_CLOUD call failed: ${res.error}`);
  }

  if (res.inferenceSource !== 'in_cloud') {
    throw new Error(`Expected ONLY_IN_CLOUD inferenceSource='in_cloud', got '${res.inferenceSource}'`);
  }

  if (paceMs > 0) await sleep(paceMs);
  return res;
}

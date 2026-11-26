#!/usr/bin/env node
/**
 * Live evaluation collector — runs the REAL Envoy product pipeline (`@envoy/ai` `analyze()` and
 * optionally `answer()`) through Firebase AI Logic hybrid inference via `scripts/lib/envoy-browser.mjs`
 * (`connectEnvoyPage`, `runCase`, `runCases`).
 *
 * Never recomposes anything outside `analyze()`. Every cached entry stores the verbatim `runCase()`
 * result object under `source: 'live'` alongside exact model metadata (`component`, `version`, `label`),
 * `backend`, and `recordedAt`.
 *
 * Arms:
 *   --arm gemma4  -> F:\ChromeEnvoy on CDP 9333 (`gemma4_component` `2026.11.3.1140`, CPU backend)
 *   --arm basic   -> Headless Chromium on an isolated CDP port (LanguageModel unavailable -> Basic protection)
 *
 * Usage:
 *   node tests/eval/collect-live.mjs --arm basic --port 5174
 *   node tests/eval/collect-live.mjs --arm gemma4 --component gemma4_component --version 2026.11.3.1140 --label "Gemma 4" --port 5174 [--with-answer] [--cooldown 2000]
 */
import '../../scripts/lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectEnvoyPage, runCase } from '../../scripts/lib/envoy-browser.mjs';
import { initBrowserSdk } from './lib/browser-sdk.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES_PATH = resolve(__dirname, 'cases.json');
const ARMS_DIR = resolve(__dirname, 'probes/arms');

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = next;
      i++;
    }
  }
}

const arm = args.arm ?? 'gemma4';
const port = Number(args.port ?? 5174);
const appUrl = args.url ?? `http://localhost:${port}/`;
const detectScope = args.scope ?? 'selected';
const withAnswer = args['with-answer'] === 'true';
const cooldownMs = Number(args.cooldown ?? (arm === 'basic' ? (withAnswer ? 4200 : 100) : 2000));
const force = args.force === 'true';
const offset = Number(args.offset ?? 0);
const limit = Number(args.limit ?? 999);
const onlyIds = args.ids ? new Set(args.ids.split(',').map((s) => s.trim()).filter(Boolean)) : null;

const ARM_DEFAULTS = {
  gemma4: {
    label: 'Gemma 4 (on-device + cloud)',
    model: {
      component: args.component ?? 'gemma4_component',
      version: args.version ?? '2026.11.3.1140',
      label: args.label ?? 'Gemma 4',
    },
    backend: args.backend ?? 'cpu (OnDeviceModelForceCpuBackend)',
  },
  basic: {
    label: 'Basic protection (rules + guard, no on-device model)',
    model: null,
    backend: 'rules-only (LanguageModel unavailable)',
  },
};

const armMeta = ARM_DEFAULTS[arm] ?? {
  label: args.label ?? arm,
  model: args.component ? { component: args.component, version: args.version ?? 'unknown', label: args.label ?? arm } : null,
  backend: args.backend ?? 'unknown',
};

const cachePath = resolve(ARMS_DIR, `${arm}.json`);
mkdirSync(dirname(cachePath), { recursive: true });

const cases = JSON.parse(readFileSync(CASES_PATH, 'utf8'));
const existingFile = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : null;
const entries = existingFile && existingFile.entries && typeof existingFile.entries === 'object' ? { ...existingFile.entries } : {};

// Purge any entry that isn't a verified live runCase output
for (const [k, v] of Object.entries(entries)) {
  if (!v || v.source !== 'live' || !v.result) delete entries[k];
}

function saveCache() {
  const payload = {
    arm,
    label: armMeta.label,
    model: armMeta.model,
    backend: armMeta.backend,
    detectScope,
    withAnswer,
    updatedAt: new Date().toISOString(),
    nTotal: cases.length,
    nMeasured: Object.keys(entries).length,
    entries,
  };
  writeFileSync(cachePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

// Verify Argon's dev server is reachable before connecting Chrome
try {
  const ping = await fetch(appUrl);
  if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
} catch (err) {
  throw new Error(`Dev server not reachable at ${appUrl} (${err.message}). Start Vite in F:/Projects/Envoy-wt/argon on port ${port} first.`, {
    cause: err,
  });
}

let ownedBrowser = null;
let cdpUrl = args.cdp ?? 'http://127.0.0.1:9333';

if (arm === 'basic' && !args.cdp) {
  const basicPort = Number(args['basic-cdp-port'] ?? 9334);
  const chromePaths = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  const executablePath = chromePaths.find((p) => existsSync(p));
  ownedBrowser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [`--remote-debugging-port=${basicPort}`, '--disable-features=OptimizationGuideOnDeviceModel,PromptAPIForGeminiNano'],
  });
  // Ensure a browser context exists for connectEnvoyPage
  await ownedBrowser.newContext();
  cdpUrl = `http://127.0.0.1:${basicPort}`;
}

const slice = onlyIds ? cases.filter((c) => onlyIds.has(c.id)) : cases.slice(offset, offset + limit);
console.log(`Arm: ${arm} (${armMeta.label})`);
console.log(`Model: ${armMeta.model ? `${armMeta.model.label} (${armMeta.model.component} ${armMeta.model.version})` : 'none (Basic protection)'}`);
console.log(`Backend: ${armMeta.backend} · App URL: ${appUrl} · CDP: ${cdpUrl} · withAnswer=${withAnswer}`);

let collected = 0;
let skipped = 0;
let failed = 0;

async function openSessionWithRetry(retries = 3) {
  let lastErr;
  for (let a = 0; a < retries; a++) {
    try {
      const sess = await connectEnvoyPage({ cdp: cdpUrl, appUrl });
      const sdkInfo = await initBrowserSdk(sess.page);
      console.log(`Initialized browser Firebase AI Logic SDK (cloudModel=${sdkInfo.cloudModel})`);
      return sess;
    } catch (err) {
      lastErr = err;
      console.warn(`connectEnvoyPage attempt ${a + 1}/${retries} failed (${err.message}); retrying...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

try {
  let session = await openSessionWithRetry();
  let runsOnPage = 0;
  try {
    for (let i = 0; i < slice.length; i++) {
      const tc = slice[i];
      const prev = entries[tc.id];
      const sameModel =
        (prev?.model?.component ?? null) === (armMeta.model?.component ?? null) &&
        (prev?.model?.version ?? null) === (armMeta.model?.version ?? null);
      const hasAnswerIfWanted = !withAnswer || Boolean(prev?.result?.answer);
      if (!force && prev && prev.source === 'live' && sameModel && hasAnswerIfWanted) {
        skipped++;
        console.log(`[${i + 1}/${slice.length}] ${tc.id} — already cached live, skipping`);
        continue;
      }

      // Refresh the browser tab every 6 on-device runs to avoid long-lived tab memory bloat
      if (arm !== 'basic' && runsOnPage >= 6) {
        await session.close().catch(() => undefined);
        await new Promise((r) => setTimeout(r, cooldownMs));
        session = await openSessionWithRetry();
        runsOnPage = 0;
      }

      let result;
      for (let attempt = 0; attempt < 4; attempt++) {
        result = await runCase(session.page, {
          document: tc.document,
          question: tc.question,
          detectScope,
          withAnswer,
        });
        if (result.ok || !/429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(result.error ?? '')) {
          break;
        }
        const waitMs = 15000 * (attempt + 1);
        console.warn(`[${i + 1}/${slice.length}] ${tc.id} — 429 rate-limited; backing off ${waitMs}ms...`);
        await session.page.waitForTimeout(waitMs);
      }
      runsOnPage++;

      if (result.ok) {
        if (arm !== 'basic' && result.mode !== 'private') {
          failed++;
          console.error(
            `[${i + 1}/${slice.length}] ${tc.id} — FELL BACK TO BASIC (${result.ms}ms, device=${result.deviceStatus}): ${result.fallbackReason ?? 'model unavailable'}. Refusing to record Basic fallback under on-device arm '${arm}'.`,
          );
          if (result.deviceStatus === 'unavailable') {
            console.error(`Stopping arm '${arm}': Chrome on-device model flipped to unavailable (check model_crash_count & free virtual memory).`);
            break;
          }
          continue;
        }
        entries[tc.id] = {
          source: 'live',
          arm,
          model: armMeta.model,
          backend: armMeta.backend,
          detectScope,
          recordedAt: new Date().toISOString(),
          result,
        };
        saveCache();
        collected++;
        console.log(
          `[${i + 1}/${slice.length}] ${tc.id} — LIVE OK mode=${result.mode} device=${result.deviceStatus} ${result.ms}ms selected=${JSON.stringify(result.selectedIds)} local=${result.route?.local} guard=${result.guardOk}${result.answer ? ` answer=${result.answer.source}(${result.answer.ms}ms)` : ''}${result.fallbackReason ? ` fallback=${result.fallbackReason}` : ''}`,
        );
      } else {
        failed++;
        console.error(`[${i + 1}/${slice.length}] ${tc.id} — FAILED (${result.ms}ms): ${result.error}`);
      }

      if (i < slice.length - 1 && cooldownMs > 0) {
        await session.page.waitForTimeout(cooldownMs);
      }
    }
  } finally {
    await session.close().catch(() => undefined);
  }
} finally {
  if (ownedBrowser) {
    await ownedBrowser.close().catch(() => undefined);
  }
}

saveCache();
console.log(
  `\nLive collection complete [${arm}]: collected=${collected}, skipped=${skipped}, failed=${failed}, totalMeasured=${Object.keys(entries).length}/${cases.length} -> ${cachePath}`,
);
process.exit(failed > 0 ? 1 : 0);

#!/usr/bin/env node
/**
 * Real-model probe (Harness² Probe step): runs the Envoy pipeline inside the owner's Chrome that
 * has the on-device model, through any running Vite dev server worktree, and records per-step
 * timings, stability counts, and results.
 *
 * Prereqs: Chrome started with --remote-debugging-port=9333 (see docs/PLAN.md launch recipe)
 * and a Vite dev server (`npm run dev -- --port 5174` for Argon, or `5173` for Claude).
 *
 * Usage:
 *   node scripts/probe-pipeline.mjs --variant selected [--question "..."] [--runs 3]
 *     [--url http://localhost:5173/] [--port 5174] [--reuse-page] [--out file.json]
 */
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_ROOT = resolve(__dirname, '..').replace(/\\/g, '/');

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

const variant = args.variant ?? 'selected';
const question = args.question ?? 'Can my landlord raise the rent 20% this year?';
const runs = Number(args.runs ?? 1);
const reusePage = args['reuse-page'] === 'true';
const cdpUrl = args.cdp ?? 'http://127.0.0.1:9333';
const out = args.out ?? `tests/eval/probes/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${variant}.json`;

/** Pick an explicit --url/--port, or auto-detect Argon (5174) then Claude (5173) then Muse (5175). */
async function resolveTargetUrl() {
  if (args.url) return args.url.endsWith('/') ? args.url : `${args.url}/`;
  if (args.port) return `http://localhost:${args.port}/`;
  for (const port of [5174, 5173, 5175]) {
    try {
      const r = await fetch(`http://localhost:${port}/src/app/useEnvoy.ts`);
      if (r.ok) return `http://localhost:${port}/`;
    } catch {
      // try next port
    }
  }
  throw new Error('No running Vite dev server found on ports 5174, 5173, or 5175. Start one or pass --url.');
}

/**
 * Ask the target Vite dev server for its transformed `/src/app/useEnvoy.ts` so we import the exact
 * `/@fs/...` paths belonging to THAT server's worktree (never 403 across worktrees).
 */
async function resolveViteModulePaths(baseUrl) {
  const res = await fetch(`${baseUrl}src/app/useEnvoy.ts`);
  if (!res.ok) throw new Error(`Failed to fetch ${baseUrl}src/app/useEnvoy.ts (HTTP ${res.status})`);
  const src = await res.text();
  const aiMatch = /from\s+["']([^"']*packages\/ai\/src\/index\.ts[^"']*)["']/.exec(src);
  const coreMatch = /from\s+["']([^"']*packages\/core\/src\/index\.ts[^"']*)["']/.exec(src);
  return {
    aiPath: aiMatch ? aiMatch[1] : `/@fs/${LOCAL_ROOT}/packages/ai/src/index.ts`,
    corePath: coreMatch ? coreMatch[1] : `/@fs/${LOCAL_ROOT}/packages/core/src/index.ts`,
  };
}

const targetUrl = await resolveTargetUrl();
const { aiPath, corePath } = await resolveViteModulePaths(targetUrl);
console.log(`Target Vite server: ${targetUrl}`);
console.log(`Resolved modules: ai=${aiPath} | core=${corePath}`);

const browser = await chromium.connectOverCDP(cdpUrl);
const context = browser.contexts()[0];

async function runSingleProbe(page) {
  return page.evaluate(
    async ({ variant, question, aiPath, corePath }) => {
      const ai = await import(aiPath);
      const core = await import(corePath);
      const env = await import('/src/env.ts');
      const availBefore = 'LanguageModel' in self ? await self.LanguageModel.availability() : 'missing';
      const { ai: fbAi } = ai.initEnvoy(env.readFirebaseEnv(), { dev: true });
      const settings = ai.DEFAULT_SETTINGS;
      const schemas = { detect: core.DETECT_SCHEMA, minimize: core.MINIMIZE_SCHEMA, route: core.ROUTE_SCHEMA };
      const models = Object.fromEntries(
        ['detect', 'minimize', 'route', 'answerLocal', 'reason'].map((s) => [s, ai.createStepModel(fbAi, s, settings, schemas[s])]),
      );
      const deps = { runPrivate: ai.runPrivate, models, getDeviceStatus: ai.getDeviceStatus };
      const events = [];
      const t0 = performance.now();
      try {
        const a = await ai.analyze(core.EN_LEASE.text, question, deps, {
          detectScope: variant,
          onProgress: (p) => events.push({ ...p, at: Math.round(performance.now() - t0) }),
        });
        const availAfter = 'LanguageModel' in self ? await self.LanguageModel.availability() : 'missing';
        return {
          ok: true,
          availBefore,
          availAfter,
          ms: Math.round(performance.now() - t0),
          mode: a.mode,
          selectedIds: a.selectedIds,
          route: a.route,
          steps: a.steps,
          guardOk: a.guard.ok,
          fallbackReason: a.fallbackReason,
          nanoEntities: a.entities.filter((e) => e.source === 'nano').map((e) => [e.type, e.value, e.role ?? null]),
          outbound: a.outbound,
          events,
        };
      } catch (e) {
        const availAfter = 'LanguageModel' in self ? await self.LanguageModel.availability() : 'missing';
        return { ok: false, availBefore, availAfter, ms: Math.round(performance.now() - t0), error: `${e.name}: ${e.message}`, events };
      }
    },
    { variant, question, aiPath, corePath },
  );
}

const results = [];
let sharedPage = null;
if (reusePage) {
  sharedPage = await context.newPage();
  await sharedPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
}

for (let i = 0; i < runs; i++) {
  const page = reusePage ? sharedPage : await context.newPage();
  if (!reusePage) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  const r = await runSingleProbe(page);
  results.push(r);
  console.log(
    `run ${i + 1}/${runs} [${variant} ${reusePage ? 'same-page' : 'fresh-page'}] ok=${r.ok} mode=${r.mode ?? 'err'} ${r.ms} ms`,
    r.ok
      ? `avail=${r.availBefore}->${r.availAfter} selected=${JSON.stringify(r.selectedIds)} guard=${r.guardOk} fallback=${r.fallbackReason ?? 'none'} steps=${JSON.stringify(r.steps)}`
      : r.error,
  );
  if (!reusePage) {
    await page.close();
  }
}

if (sharedPage) {
  await sharedPage.close();
}

const privateCount = results.filter((r) => r.ok && r.mode === 'private').length;
const basicCount = results.filter((r) => r.ok && r.mode === 'basic').length;
const avgMs = Math.round(results.reduce((a, r) => a + r.ms, 0) / Math.max(1, results.length));
const summary = {
  runs,
  privateCount,
  basicCount,
  privateRatePct: Math.round((privateCount / Math.max(1, runs)) * 100),
  avgMs,
  reusePage,
  targetUrl,
  aiPath,
};
console.log(`Stability summary: Private ${privateCount}/${runs} (${summary.privateRatePct}%), Basic ${basicCount}/${runs}, avg ${avgMs} ms`);

// Do not close browser: this is the owner's Chrome. Exiting the process just drops the CDP connection.
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ variant, question, at: new Date().toISOString(), summary, results }, null, 2));
console.log(`saved ${out}`);
process.exit(0);

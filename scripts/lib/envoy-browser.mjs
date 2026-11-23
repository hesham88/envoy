/**
 * Run the REAL Envoy pipeline — @envoy/ai `analyze` / `answer` through Firebase AI Logic hybrid
 * inference (initEnvoy → createStepModel with ONLY_ON_DEVICE / PREFER_IN_CLOUD → runPrivate +
 * device guard) — inside the Chrome that has the on-device model, and return measured results.
 *
 * Shared by scripts/probe-pipeline.mjs and the eval harness (tests/eval/run.mjs). Never
 * synthesize model outputs: if this can't reach a model, the result says so (mode 'basic' +
 * fallbackReason) and must be reported as such.
 *
 * Prereqs: the model Chrome running with --remote-debugging-port (default 9333, launch recipe in
 * docs/PLAN.md) and the lane's dev server (`npm run dev`) serving the web app.
 */
import { chromium } from 'playwright-core';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fsUrl = (p) => `/@fs/${resolve(ROOT, p).replace(/\\/g, '/')}`;

/** Opens a fresh tab on the dev server inside the model Chrome. Close it with `close()`; Chrome keeps running. */
export async function connectEnvoyPage({
  cdp = 'http://127.0.0.1:9333',
  appUrl = 'http://localhost:5173/',
} = {}) {
  const browser = await chromium.connectOverCDP(cdp);
  const context = browser.contexts()[0];
  if (!context)
    throw new Error(`No browser context at ${cdp}. Start the model Chrome first (docs/PLAN.md).`);
  const page = await context.newPage();
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  return { page, close: () => page.close() };
}

/**
 * Runs one case. `withAnswer: true` also calls answer() on the composed excerpt (a real cloud call
 * through PREFER_IN_CLOUD unless the route is local). Returns plain data only.
 */
export async function runCase(
  page,
  { document, question, detectScope = 'selected', withAnswer = false },
) {
  return page.evaluate(
    async ({ document, question, detectScope, withAnswer, paths }) => {
      const ai = await import(paths.ai);
      const core = await import(paths.core);
      const env = await import('/src/env.ts');
      const g = globalThis;
      if (!g.__envoyEval) {
        const { ai: fbAi } = ai.initEnvoy(env.readFirebaseEnv(), { dev: true });
        const schemas = {
          detect: core.DETECT_SCHEMA,
          minimize: core.MINIMIZE_SCHEMA,
          route: core.ROUTE_SCHEMA,
        };
        const models = Object.fromEntries(
          ['detect', 'minimize', 'route', 'answerLocal', 'reason'].map((s) => [
            s,
            ai.createStepModel(fbAi, s, ai.DEFAULT_SETTINGS, schemas[s]),
          ]),
        );
        g.__envoyEval = {
          deps: { runPrivate: ai.runPrivate, models, getDeviceStatus: ai.getDeviceStatus },
        };
      }
      const deps = g.__envoyEval.deps;
      ai.networkLog.clear();
      const deviceStatus = await ai.getDeviceStatus();
      const events = [];
      const t0 = performance.now();
      try {
        const a = await ai.analyze(document, question, deps, {
          detectScope,
          onProgress: (p) => events.push({ ...p, at: Math.round(performance.now() - t0) }),
        });
        const out = {
          ok: true,
          deviceStatus,
          ms: Math.round(performance.now() - t0),
          mode: a.mode,
          fallbackReason: a.fallbackReason,
          selectedIds: a.selectedIds,
          route: a.route,
          steps: a.steps,
          guardOk: a.guard.ok,
          leaks: a.guard.leaks,
          entities: a.entities.map((e) => ({
            type: e.type,
            value: e.value,
            role: e.role ?? null,
            source: e.source,
          })),
          outbound: a.outbound,
          receipt: a.receipt,
          events,
        };
        if (withAnswer) {
          const t1 = performance.now();
          const res = await ai.answer(a, a.outbound, deps);
          out.answer = {
            text: res.text,
            source: res.source,
            lighter: res.lighter,
            ms: Math.round(performance.now() - t1),
            receipt: res.receipt,
          };
        }
        // Proof of where every request went (device / cloud / blocked), straight from the network log.
        out.network = ai.networkLog.entries.map((e) => ({
          step: e.step,
          target: e.target,
          blocked: e.blocked,
          chars: e.payload.length,
        }));
        return out;
      } catch (e) {
        return {
          ok: false,
          deviceStatus,
          ms: Math.round(performance.now() - t0),
          error: `${e.name}: ${e.message}`,
          events,
        };
      }
    },
    {
      document,
      question,
      detectScope,
      withAnswer,
      paths: { ai: fsUrl('packages/ai/src/index.ts'), core: fsUrl('packages/core/src/index.ts') },
    },
  );
}

/** Runs cases one after another (the CPU model can't share), with a pause between them. */
export async function runCases(page, cases, { cooldownMs = 1500, onResult, ...opts } = {}) {
  const results = [];
  for (const [i, c] of cases.entries()) {
    const r = await runCase(page, { document: c.document, question: c.question, ...opts });
    results.push({ id: c.id, ...r });
    onResult?.({ index: i, total: cases.length, id: c.id, result: r });
    if (i < cases.length - 1) await page.waitForTimeout(cooldownMs);
  }
  return results;
}

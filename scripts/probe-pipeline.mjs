#!/usr/bin/env node
/**
 * Real-model probe (Harness² Probe step): runs the Envoy pipeline inside the owner's Chrome that
 * has the on-device model, through the Vite dev server, and records per-step timings and results.
 *
 * Prereqs: Chrome started with --remote-debugging-port=9333 (see docs/PLAN.md launch recipe)
 * and `npm run dev` serving http://localhost:5173.
 *
 * Usage: node scripts/probe-pipeline.mjs --variant all|selected [--question "..."] [--runs 1] [--out file.json]
 */
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const variant = args.variant ?? 'all';
const question = args.question ?? 'Can my landlord raise the rent 20% this year?';
const runs = Number(args.runs ?? 1);
const out = args.out ?? `tests/eval/probes/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${variant}.json`;

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = browser.contexts()[0];
const page = await context.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

const results = [];
for (let i = 0; i < runs; i++) {
  const r = await page.evaluate(
    async ({ variant, question }) => {
      const ai = await import('/@fs/F:/Projects/Envoy/packages/ai/src/index.ts');
      const core = await import('/@fs/F:/Projects/Envoy/packages/core/src/index.ts');
      const env = await import('/src/env.ts');
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
        return {
          ok: true,
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
        return { ok: false, ms: Math.round(performance.now() - t0), error: `${e.name}: ${e.message}`, events };
      }
    },
    { variant, question },
  );
  results.push(r);
  console.log(`run ${i + 1}/${runs} [${variant}] ok=${r.ok} ${r.ms} ms`, r.ok ? `selected=${r.selectedIds} guard=${r.guardOk} steps=${JSON.stringify(r.steps)}` : r.error);
}

await page.close();
// Do not close: this is the owner's Chrome. Exiting the process just drops the CDP connection.
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ variant, question, at: new Date().toISOString(), results }, null, 2));
console.log(`saved ${out}`);
process.exit(0);

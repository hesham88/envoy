#!/usr/bin/env node
/**
 * Checks every one-click sample question on the real pipeline (Gemma 4 in the model Chrome):
 * the route Private mode takes must match the label the card shows ("on this device" or
 * "cloud, masked"), the guard must pass, and "on this device" questions must get an on-device
 * answer with no cloud request. Cloud questions are analysed only: no cloud calls, no quota.
 *
 * Prereqs: model Chrome on CDP 9333 (docs/PLAN.md), dev server on 5173 (apps/web).
 * Usage: node scripts/verify-samples.mjs [--only lab]  → writes tests/eval/probes/sample-routes.json
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectEnvoyPage, runCase } from './lib/envoy-browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null;
const { page, close } = await connectEnvoyPage();
const samplesUrl = `/@fs/${resolve(ROOT, 'packages/app/src/chat/samples.ts').replace(/\\/g, '/')}`;
const samples = await page.evaluate(async (u) => {
  const m = await import(u);
  return m.SAMPLES.map((s) => ({ id: s.id, text: s.doc.text, questions: s.questions }));
}, samplesUrl);

const rows = [];
let bad = 0;
for (const s of samples.filter((x) => !only || x.id === only)) {
  for (const q of s.questions) {
    const device = q.where === 'device';
    const r = await runCase(page, { document: s.text, question: q.text, withAnswer: device });
    const local = r.ok ? r.route.local : null;
    const cloudCalls = (r.network ?? []).filter((n) => n.target === 'cloud').length;
    const ok =
      r.ok &&
      r.mode === 'private' &&
      r.guardOk &&
      local === device &&
      (!device || (r.answer?.source === 'on_device' && cloudCalls === 0));
    if (!ok) bad++;
    const row = {
      sample: s.id,
      question: q.text,
      label: q.where,
      ok,
      mode: r.mode ?? null,
      routeLocal: local,
      routeReason: r.route?.reason ?? null,
      guardOk: r.guardOk ?? null,
      analyzeMs: r.ms,
      answerSource: r.answer?.source ?? null,
      answerMs: r.answer?.ms ?? null,
      answer: r.answer?.text ?? null,
      cloudCalls,
      error: r.ok ? null : r.error,
    };
    rows.push(row);
    console.log(
      `${ok ? 'OK ' : 'BAD'} ${s.id} [${q.where}] route=${local ? 'device' : 'cloud'} ${r.mode} ${Math.round((r.ms + (r.answer?.ms ?? 0)) / 1000)}s  ${q.text}`,
    );
  }
}
await close();

const version = await (await fetch('http://127.0.0.1:9333/json/version')).json();
writeFileSync(
  resolve(ROOT, 'tests/eval/probes/sample-routes.json'),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      chrome: version.Browser,
      model: 'Gemma 4 (gemma4_component, CPU backend), profile F:\\ChromeEnvoy',
      pipeline:
        'real @envoy/ai analyze (and answer for on-device questions) via scripts/lib/envoy-browser.mjs',
      passed: rows.length - bad,
      total: rows.length,
      rows,
    },
    null,
    2,
  )}\n`,
);
console.log(`sample-routes: ${rows.length - bad}/${rows.length} match their labels`);
process.exitCode = bad ? 1 : 0;

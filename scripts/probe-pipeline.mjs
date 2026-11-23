#!/usr/bin/env node
/**
 * Real-model probe (Harness² Probe step): runs the real pipeline on the sample lease through
 * Firebase AI Logic hybrid inference in the model Chrome, and saves the measured result.
 *
 * Usage: node scripts/probe-pipeline.mjs --model gemma4_component@2026.11.3.1140 [--variant selected|all]
 *        [--question "..."] [--runs 1] [--answer] [--app http://localhost:5173/] [--out file.json]
 * `--model` is required: name the on-device model you are measuring (chrome://on-device-internals).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { connectEnvoyPage, runCase } from './lib/envoy-browser.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const model = opt('model');
if (!model) {
  console.error(
    'Name the model under test: --model <component@version> (see chrome://on-device-internals).',
  );
  process.exit(2);
}
const variant = opt('variant', 'selected');
const question = opt('question', 'Can my landlord raise the rent 20% this year?');
const runs = Number(opt('runs', 1));
const out = opt(
  'out',
  `tests/eval/probes/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${variant}.json`,
);

const { page, close } = await connectEnvoyPage({ appUrl: opt('app', 'http://localhost:5173/') });
const corePath = `/@fs/${resolve('packages/core/src/index.ts').replace(/\\/g, '/')}`;
const document = await page.evaluate(async (p) => (await import(p)).EN_LEASE.text, corePath);

const results = [];
for (let i = 0; i < runs; i++) {
  const r = await runCase(page, {
    document,
    question,
    detectScope: variant,
    withAnswer: flag('answer'),
  });
  results.push(r);
  console.log(
    `run ${i + 1}/${runs} [${variant}] ok=${r.ok} mode=${r.mode} ${r.ms} ms`,
    r.ok
      ? `selected=${r.selectedIds} guard=${r.guardOk} steps=${JSON.stringify(r.steps)}`
      : r.error,
  );
}
await close();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      model,
      variant,
      question,
      at: new Date().toISOString(),
      via: 'Firebase AI Logic hybrid inference (@envoy/ai analyze)',
      results,
    },
    null,
    2,
  ),
);
console.log(`saved ${out}`);
process.exit(0);

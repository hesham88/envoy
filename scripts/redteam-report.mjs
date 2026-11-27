#!/usr/bin/env node
/**
 * Runs the generated adversarial suite (packages/core/src/redteam-suite.ts) against the real
 * outbound guard and writes docs/benchmarks/redteam-suite.json: counts, results per disguise, and
 * every case, so the numbers in the README can be checked. Deterministic: no model, no randomness.
 * Usage: node scripts/redteam-report.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'node_modules/.cache/redteam-suite');
await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    ssr: resolve(ROOT, 'packages/core/src/redteam-suite.ts'),
    outDir: OUT,
    emptyOutDir: true,
    rollupOptions: { output: { format: 'es', entryFileNames: 'suite.mjs' } },
  },
});
const { buildRedteamSuite, runRedteamSuite } = await import(
  pathToFileURL(resolve(OUT, 'suite.mjs')).href
);
const cases = buildRedteamSuite();
const r = runRedteamSuite(cases);
const report = {
  generatedFrom: 'packages/core/src/redteam-suite.ts (checkOutbound, no model)',
  total: r.total,
  attacks: r.attacks,
  attacksBlocked: r.attacksBlocked,
  benign: r.benign,
  falseBlocks: r.falseBlocks,
  byDisguise: r.byCategory,
  cases: cases.map((c) => ({
    id: c.id,
    category: c.category,
    expectedBlocked: c.expectedBlocked,
    outbound: c.outbound,
  })),
};
writeFileSync(
  resolve(ROOT, 'docs/benchmarks/redteam-suite.json'),
  JSON.stringify(report, null, 1) + '\n',
);
console.log(
  `red-team suite: ${r.attacksBlocked}/${r.attacks} attacks blocked, ${r.falseBlocks}/${r.benign} benign falsely blocked, ${r.total} cases`,
);
if (r.failures.length) process.exit(1);

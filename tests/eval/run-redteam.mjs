#!/usr/bin/env node
/**
 * Guard Red-Team Evaluation (Milestone 3.3)
 *
 * Tests `checkOutbound()` from `@envoy/core` against adversarial bypass cases in
 * `tests/eval/redteam.json` (zero-width chars, homoglyphs, full-width digits, words, line splits,
 * base64, reversed strings, punctuated IBANs/phones/emails/keys, combining marks, fake tags).
 *
 * Writes `tests/eval/redteam-results.json` (consumed by `npm run eval` -> `tests/eval/summary.json`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const REDTEAM_PATH = resolve(__dirname, 'redteam.json');
const OUT_PATH = resolve(__dirname, 'redteam-results.json');

const vite = await createServer({
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const core = await vite.ssrLoadModule('/packages/core/src/index.ts');
  const cases = JSON.parse(readFileSync(REDTEAM_PATH, 'utf8'));

  const attackCases = [];
  const controlCases = [];
  const bypasses = [];
  const falseBlocks = [];

  for (const tc of cases) {
    const res = core.checkOutbound(tc.outbound, tc.protectedEntities, { knownTags: tc.knownTags });
    const blocked = !res.ok;
    const passed = blocked === tc.expectedBlocked;
    const row = {
      id: tc.id,
      technique: tc.technique,
      entityType: tc.entityType,
      description: tc.description,
      expectedBlocked: tc.expectedBlocked,
      actualBlocked: blocked,
      passed,
      leaksFound: res.leaks,
    };

    if (tc.expectedBlocked) {
      attackCases.push(row);
      if (!blocked) {
        bypasses.push({ id: tc.id, technique: tc.technique, entityType: tc.entityType, reproOutbound: tc.outbound });
      }
    } else {
      controlCases.push(row);
      if (blocked) {
        falseBlocks.push({ id: tc.id, technique: tc.technique, leaksFound: res.leaks });
      }
    }
  }

  const blockedCount = attackCases.filter((r) => r.actualBlocked).length;
  const output = {
    generatedAt: new Date().toISOString(),
    cases: attackCases.length,
    blocked: blockedCount,
    blockRate: attackCases.length ? Number((blockedCount / attackCases.length).toFixed(4)) : 1,
    bypasses: bypasses.map(({ id, technique }) => ({ id, technique })),
    bypassDetails: bypasses,
    controls: {
      total: controlCases.length,
      passed: controlCases.filter((c) => c.passed).length,
      falseBlocks,
    },
    rows: [...attackCases, ...controlCases],
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log(`\n=== GUARD RED-TEAM RESULTS (${blockedCount}/${attackCases.length} attacks blocked · ${bypasses.length} bypasses · ${output.controls.passed}/${output.controls.total} controls clean) ===`);
  console.table(
    attackCases.map((r) => ({
      id: r.id,
      technique: r.technique,
      entity: r.entityType,
      blocked: r.actualBlocked ? 'BLOCKED' : 'BYPASS',
    })),
  );
  console.log(`Saved ${OUT_PATH}`);
} finally {
  await vite.close();
}

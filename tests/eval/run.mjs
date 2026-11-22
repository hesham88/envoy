#!/usr/bin/env node
/**
 * Envoy Evaluation Harness (`npm run eval`) — Milestone 1–5
 *
 * Scores ONLY verified live `runCase()` results collected via `scripts/lib/envoy-browser.mjs`
 * (stored in `tests/eval/probes/arms/<arm>.json` with `source: 'live'`, exact model component &
 * version, backend, and recordedAt). Never recomposes analyze() outputs outside `analyze()` and
 * never synthesizes fake model outputs.
 *
 * Outputs:
 *   - `tests/eval/results.json` — detailed per-arm, clean/noisy, and per-case audit output
 *   - `tests/eval/summary.json` — stable contract consumed by the landing page & README
 *
 * Usage:
 *   npm run eval                   # score from committed live caches (no Chrome needed)
 *   npm run eval -- --live --arm basic   # re-collect an arm first, then score
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const CASES_PATH = resolve(__dirname, 'cases.json');
const ARMS_DIR = resolve(__dirname, 'probes/arms');
const RESULTS_PATH = resolve(__dirname, 'results.json');
const SUMMARY_PATH = resolve(__dirname, 'summary.json');
const REDTEAM_RESULTS_PATH = resolve(__dirname, 'redteam-results.json');
const SECRETS_RESULTS_PATH = resolve(__dirname, 'secrets-results.json');
const CLI_RESULTS_PATH = resolve(__dirname, 'cli-results.json');
const ATTACK_RESULTS_PATH = resolve(__dirname, 'attack-results.json');
const QUALITY_RESULTS_PATH = resolve(__dirname, 'quality-results.json');

if (process.argv.includes('--live')) {
  const passArgs = process.argv.slice(2).filter((a) => a !== '--live');
  execFileSync(process.execPath, [resolve(__dirname, 'collect-live.mjs'), ...passArgs], {
    stdio: 'inherit',
  });
}

// Always refresh deterministic local evaluations (guard red-team, secrets/custom-rules & CLI; no Chrome needed)
execFileSync(process.execPath, [resolve(__dirname, 'run-redteam.mjs')], { stdio: 'inherit' });
execFileSync(process.execPath, [resolve(__dirname, 'run-secrets.mjs')], { stdio: 'inherit' });
execFileSync(process.execPath, [resolve(__dirname, 'run-cli.mjs')], { stdio: 'inherit' });

const vite = await createServer({
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});
const core = await vite.ssrLoadModule('/packages/core/src/index.ts');

const cases = JSON.parse(readFileSync(CASES_PATH, 'utf8'));
const caseById = new Map(cases.map((c) => [c.id, c]));

function gitShortCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Checks whether a gold sensitive value (or its canonical/digit-normalized form) appears unmasked in text. */
function isLeakedInOutbound(outbound, goldItem) {
  if (!outbound) return false;
  const raw = goldItem.value.trim();
  if (outbound.toLowerCase().includes(raw.toLowerCase())) return true;
  const normOutbound = core.normalizeDigits(outbound).text;
  const normRaw = core.normalizeDigits(raw).text;
  if (normOutbound.toLowerCase().includes(normRaw.toLowerCase())) return true;
  if (['PHONE', 'IBAN', 'CARD', 'NATIONAL_ID'].includes(goldItem.type)) {
    const canGold = core.canonical(raw, goldItem.type);
    const digitsOnly = normOutbound.replace(/[\s.-]+/g, '').toLowerCase();
    if (canGold.length >= 8 && digitsOnly.includes(canGold.toLowerCase())) return true;
  }
  return false;
}

/** Checks whether a detected entity corresponds to any gold sensitive value in the case. */
function matchesGold(entity, goldSensitive) {
  const ev = core.normalizeDigits(entity.value.trim()).text.toLowerCase();
  for (const g of goldSensitive) {
    const gv = core.normalizeDigits(g.value.trim()).text.toLowerCase();
    if (ev === gv || gv.includes(ev) || ev.includes(gv)) return true;
    if (['PHONE', 'IBAN', 'CARD', 'NATIONAL_ID'].includes(g.type)) {
      const canE = core.canonical(entity.value, g.type).toLowerCase();
      const canG = core.canonical(g.value, g.type).toLowerCase();
      if (canE && canG && canE === canG) return true;
    }
  }
  return false;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function round4(n) {
  return Number(n.toFixed(4));
}

function scoreArmFile(armId, filePath) {
  if (!existsSync(filePath)) return null;
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  const entries = raw.entries ?? {};

  const scoredCases = [];
  const missingIds = [];

  for (const tc of cases) {
    const entry = entries[tc.id];
    if (!entry || entry.source !== 'live' || !entry.result || !entry.result.ok) {
      missingIds.push(tc.id);
      continue;
    }

    const r = entry.result;
    const isLocal = r.mode === 'private' && Boolean(r.route?.local);
    // Final transmitted outbound: empty if answered locally OR hard-blocked by the outbound guard.
    const transmittedOutbound = isLocal || !r.guardOk ? '' : (r.outbound ?? '');
    // Pre-guard outbound (what analyze() composed before guard verdict)
    const preGuardOutbound = isLocal ? '' : (r.outbound ?? '');

    const finalLeaks = tc.goldSensitive.filter((g) => isLeakedInOutbound(transmittedOutbound, g));
    const preGuardLeaks = tc.goldSensitive.filter((g) => isLeakedInOutbound(preGuardOutbound, g));

    // Sensitive recall: fraction of gold items NOT leaked in transmitted outbound
    const goldCount = tc.goldSensitive.length;
    const maskedGoldCount = goldCount - finalLeaks.length;

    // False-mask rate: fraction of unique detected entities that do not match any gold item
    const uniqueDetected = [];
    const seenVal = new Set();
    for (const e of r.entities ?? []) {
      const key = `${e.type}:${e.value.trim().toLowerCase()}`;
      if (!seenVal.has(key)) {
        seenVal.add(key);
        uniqueDetected.push(e);
      }
    }
    const falseMasks = uniqueDetected.filter((e) => !matchesGold(e, tc.goldSensitive));

    const selectedIds = r.selectedIds ?? [];
    const clauseHit = tc.expectedClauses.every((id) => selectedIds.includes(id));
    const routeAccurate = Boolean(r.route?.local) === tc.expectedLocalRoute;

    scoredCases.push({
      id: tc.id,
      category: tc.category,
      noisy: tc.noisy,
      recordedAt: entry.recordedAt,
      mode: r.mode,
      deviceStatus: r.deviceStatus,
      fallbackReason: r.fallbackReason ?? null,
      ms: r.ms,
      docChars: tc.document.length,
      outboundChars: transmittedOutbound.length,
      clausesTotal: r.receipt?.pagesTotal ?? null,
      selectedIds,
      expectedClauses: tc.expectedClauses,
      clauseHit,
      localRoute: Boolean(r.route?.local),
      expectedLocalRoute: tc.expectedLocalRoute,
      routeAccurate,
      guardOk: Boolean(r.guardOk),
      guardLeakCount: (r.leaks ?? []).length,
      goldCount,
      maskedGoldCount,
      finalLeakCount: finalLeaks.length,
      finalLeaks: finalLeaks.map((l) => `${l.type}:${l.value}`),
      preGuardLeakCount: preGuardLeaks.length,
      uniqueDetectedCount: uniqueDetected.length,
      falseMaskCount: falseMasks.length,
      falseMasks: falseMasks.map((e) => `${e.type}:${e.value}`),
      networkSteps: r.network ?? [],
    });
  }

  const n = scoredCases.length;
  const totalGold = scoredCases.reduce((s, c) => s + c.goldCount, 0);
  const totalMaskedGold = scoredCases.reduce((s, c) => s + c.maskedGoldCount, 0);
  const totalFinalLeaks = scoredCases.reduce((s, c) => s + c.finalLeakCount, 0);
  const totalDetected = scoredCases.reduce((s, c) => s + c.uniqueDetectedCount, 0);
  const totalFalseMasks = scoredCases.reduce((s, c) => s + c.falseMaskCount, 0);
  const totalDocChars = scoredCases.reduce((s, c) => s + c.docChars, 0);
  const totalOutboundChars = scoredCases.reduce((s, c) => s + c.outboundChars, 0);
  const clauseHits = scoredCases.filter((c) => c.clauseHit).length;
  const routeHits = scoredCases.filter((c) => c.routeAccurate).length;
  const privateRuns = scoredCases.filter((c) => c.mode === 'private').length;
  const guardBlocks = scoredCases.filter((c) => !c.guardOk).length;
  const leakCaseIds = scoredCases.filter((c) => c.finalLeakCount > 0).map((c) => ({ id: c.id, leaks: c.finalLeaks }));
  const latencies = scoredCases.map((c) => c.ms);
  const dates = [...new Set(scoredCases.map((c) => (c.recordedAt ? c.recordedAt.slice(0, 10) : null)).filter(Boolean))];

  return {
    id: armId,
    label: raw.label ?? armId,
    model: raw.model ?? null,
    backend: raw.backend ?? 'unknown',
    dates,
    n,
    nTotal: cases.length,
    isPartial: n < cases.length,
    missingCaseIds: missingIds,
    privateRuns,
    guardBlocks,
    leakCaseIds,
    metrics: {
      maskRecall: totalGold ? round4(totalMaskedGold / totalGold) : 1,
      falseMaskRate: totalDetected ? round4(totalFalseMasks / totalDetected) : 0,
      outboundLeaks: totalFinalLeaks,
      clauseAccuracy: n ? round4(clauseHits / n) : 0,
      routeAccuracy: n ? round4(routeHits / n) : 0,
      latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
      minimizationRatio: totalDocChars ? round4(totalOutboundChars / totalDocChars) : 0,
      reidRecoveryExact: null,
      reidRecoveryPartial: null,
      attributeInference: null,
      answerQualityRetained: null,
    },
    counts: {
      totalGold,
      totalMaskedGold,
      totalFinalLeaks,
      totalDetected,
      totalFalseMasks,
      totalDocChars,
      totalOutboundChars,
      clauseHits,
      routeHits,
    },
    cases: scoredCases,
  };
}

// Merge optional Milestone 1, 3, 4 & 5 measured artifacts when present
const attackData = existsSync(ATTACK_RESULTS_PATH) ? JSON.parse(readFileSync(ATTACK_RESULTS_PATH, 'utf8')) : null;
const qualityData = existsSync(QUALITY_RESULTS_PATH) ? JSON.parse(readFileSync(QUALITY_RESULTS_PATH, 'utf8')) : null;
const redteamData = existsSync(REDTEAM_RESULTS_PATH) ? JSON.parse(readFileSync(REDTEAM_RESULTS_PATH, 'utf8')) : null;
const secretsData = existsSync(SECRETS_RESULTS_PATH) ? JSON.parse(readFileSync(SECRETS_RESULTS_PATH, 'utf8')) : null;
const cliData = existsSync(CLI_RESULTS_PATH) ? JSON.parse(readFileSync(CLI_RESULTS_PATH, 'utf8')) : null;

const ARM_ORDER = ['gemma4', 'nano', 'basic'];
const arms = [];
for (const armId of ARM_ORDER) {
  const scored = scoreArmFile(armId, resolve(ARMS_DIR, `${armId}.json`));
  if (!scored) continue;
  const attackArm = attackData?.byArm?.[armId] ?? null;
  const qualityArm = qualityData?.byArm?.[armId] ?? null;
  if (attackArm) {
    scored.metrics.reidRecoveryExact = attackArm.reidRecoveryExact ?? null;
    scored.metrics.reidRecoveryPartial = attackArm.reidRecoveryPartial ?? null;
    scored.metrics.attributeInference = attackArm.attributeInference ?? null;
  }
  if (qualityArm) {
    scored.metrics.answerQualityRetained = qualityArm.answerQualityRetained ?? null;
  }
  scored.metricsN = {
    maskRecall: scored.n,
    falseMaskRate: scored.n,
    outboundLeaks: scored.n,
    clauseAccuracy: scored.n,
    latencyMs: scored.n,
    minimizationRatio: scored.n,
    reid: attackArm?.n ?? 0,
    attribute: attackArm?.n ?? 0,
    answerQuality: qualityArm?.n ?? 0,
  };
  arms.push(scored);
}

// Separate in-memory Oracle model (upper bound) — NEVER labeled Nano, NEVER in headline summary.arms
let oracleTotalGold = 0;
let oracleTotalLeaks = 0;
let oracleDocChars = 0;
let oracleOutChars = 0;
for (const tc of cases) {
  const chunks = core.chunkDocument(tc.document);
  const rules = core.detectWithRules(tc.document);
  const oracleEntities = tc.goldSensitive
    .filter((g) => ['PERSON', 'ORG', 'ADDRESS', 'MONEY'].includes(g.type))
    .map((g) => ({ text: g.value, kind: g.type, role: g.role || (g.type === 'MONEY' ? 'fee' : 'other') }));
  const parsed = core.parseDetectResponse(JSON.stringify({ entities: oracleEntities }), tc.document);
  const merged = core.mergeEntities(rules, parsed);
  const tags = core.assignTags(merged);
  const selected = chunks.filter((c) => tc.expectedClauses.includes(c.id));
  const out = tc.expectedLocalRoute
    ? ''
    : [
        `Question: ${core.maskText(tc.question, core.detectWithRules(tc.question), tags)}`,
        ...selected.map((c) => {
          const inside = merged
            .filter((e) => e.start >= c.start && e.end <= c.end)
            .map((e) => ({ ...e, start: e.start - c.start, end: e.end - c.start }));
          return `${c.label}: ${core.maskText(c.text, inside, tags)}`;
        }),
      ].join('\n\n');
  const guard = tc.expectedLocalRoute
    ? { ok: true, leaks: [] }
    : core.checkOutbound(out, merged, { knownTags: tags.entries().map((t) => t.tag) });
  const sent = guard.ok ? out : '';
  oracleTotalGold += tc.goldSensitive.length;
  oracleTotalLeaks += tc.goldSensitive.filter((g) => isLeakedInOutbound(sent, g)).length;
  oracleDocChars += tc.document.length;
  oracleOutChars += sent.length;
}

const generatedAt = new Date().toISOString();
const commit = gitShortCommit();

// Stable Milestone 5 summary.json contract
const summaryJson = {
  generatedAt,
  commit,
  arms: arms.map((a) => ({
    id: a.id,
    label: a.label,
    model: a.model,
    backend: a.backend,
    n: a.n,
    nTotal: a.nTotal,
    metrics: {
      maskRecall: a.metrics.maskRecall,
      falseMaskRate: a.metrics.falseMaskRate,
      outboundLeaks: a.metrics.outboundLeaks,
      clauseAccuracy: a.metrics.clauseAccuracy,
      latencyMs: a.metrics.latencyMs,
      minimizationRatio: a.metrics.minimizationRatio,
      reidRecoveryExact: a.metrics.reidRecoveryExact,
      reidRecoveryPartial: a.metrics.reidRecoveryPartial,
      attributeInference: a.metrics.attributeInference,
      answerQualityRetained: a.metrics.answerQualityRetained,
    },
    metricsN: a.metricsN,
  })),
  redteam: redteamData
    ? {
        cases: redteamData.cases,
        blocked: redteamData.blocked,
        bypasses: redteamData.bypasses,
        controls: redteamData.controls
          ? {
              total: redteamData.controls.total,
              passed: redteamData.controls.passed,
              falseBlocks: redteamData.controls.falseBlocks.length,
            }
          : undefined,
      }
    : { cases: 0, blocked: 0, bypasses: [] },
  secrets: secretsData
    ? {
        recall: secretsData.recall,
        precision: secretsData.precision,
        n: secretsData.n,
      }
    : { recall: null, precision: null, n: 0 },
  cli: cliData
    ? {
        recall: cliData.recall,
        precision: cliData.precision,
        n: cliData.n,
        falseBlocks: cliData.falseBlocks,
        rawEchoLeaks: cliData.rawEchoLeaks,
      }
    : { recall: null, precision: null, n: 0, falseBlocks: 0, rawEchoLeaks: 0 },
};

const resultsJson = {
  generatedAt,
  commit,
  nTotal: cases.length,
  arms,
  oracleUpperBound: {
    note: 'Oracle model (upper bound) — synthetic gold ceiling computed in-memory only; NOT a real model and NOT included in summary.json arms.',
    n: cases.length,
    totalGold: oracleTotalGold,
    outboundLeaks: oracleTotalLeaks,
    minimizationRatio: oracleDocChars ? round4(oracleOutChars / oracleDocChars) : 0,
  },
};

writeFileSync(SUMMARY_PATH, JSON.stringify(summaryJson, null, 2) + '\n', 'utf8');
writeFileSync(RESULTS_PATH, JSON.stringify(resultsJson, null, 2) + '\n', 'utf8');

console.log(`\n=== ENVOY LIVE EVALUATION SUMMARY (commit ${commit}) ===`);
if (arms.length === 0) {
  console.warn('No live arm caches found in tests/eval/probes/arms/*.json. Run `node tests/eval/collect-live.mjs --arm basic|gemma4|nano`.');
} else {
  const table = {};
  for (const a of arms) {
    const modelStr = a.model ? `${a.model.label} (${a.model.component} ${a.model.version})` : 'Rules + Guard only';
    const partialTag = a.isPartial ? ` [PARTIAL n=${a.n}/${a.nTotal}]` : ` [FULL n=${a.n}/${a.nTotal}]`;
    table[`${a.id}: ${modelStr}${partialTag}`] = {
      'n / 36': `${a.n}/${a.nTotal}`,
      'Mask Recall': `${(a.metrics.maskRecall * 100).toFixed(2)}%`,
      'False-Mask Rate': `${(a.metrics.falseMaskRate * 100).toFixed(1)}%`,
      'Outbound Leaks': a.metrics.outboundLeaks,
      'Clause Acc': `${(a.metrics.clauseAccuracy * 100).toFixed(1)}%`,
      'Min Ratio (sent/doc)': `${(a.metrics.minimizationRatio * 100).toFixed(1)}%`,
      'p50 / p95 ms': `${a.metrics.latencyMs.p50} / ${a.metrics.latencyMs.p95}`,
      'Date(s)': a.dates.join(', '),
    };
  }
  console.table(table);
  for (const a of arms) {
    if (a.leakCaseIds.length > 0) {
      console.warn(`! NON-ZERO OUTBOUND LEAKS in arm '${a.id}':`, JSON.stringify(a.leakCaseIds));
    }
  }
}
console.log(
  `Appendix — Oracle model (upper bound, synthetic gold ceiling, NOT a real model): leaks=${oracleTotalLeaks}/${oracleTotalGold}, minimizationRatio=${(resultsJson.oracleUpperBound.minimizationRatio * 100).toFixed(1)}%`,
);
console.log(`Saved ${SUMMARY_PATH} and ${RESULTS_PATH}`);

await vite.close();
export { summaryJson, resultsJson, caseById };

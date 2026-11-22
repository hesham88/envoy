#!/usr/bin/env node
/**
 * Envoy Evaluation Harness (Phase 5 — BRIEF §8, PAIR Ch. 2.3 & Harness²).
 *
 * Evaluates benchmark cases in `tests/eval/cases.json` strictly from verified REAL `--live`
 * on-device model outputs stored in `tests/eval/probes/nano-cache.json` (`source === "live"`,
 * recording `modelLabel`, `modelComponent`, `modelVersion`, `backend`, `recordedAt`).
 *
 * Headline Table (Measured Live Results ONLY):
 *   1. Rules Alone         — deterministic regex + checksums only (`detectWithRules`), all clauses sent.
 *   2. On-Device LLM Alone — measured live on-device model (`detect` + `minimize` + `route`), no rules/guard.
 *   3. Envoy Layered       — Rules + measured live on-device model + name fallback + Outbound Guard.
 *
 * Separate Appendix (NOT in headline table, NEVER called Nano):
 *   - Oracle model (upper bound) — theoretical ceiling using gold labels purely in-memory.
 *
 * Usage:
 *   npm run eval                # evaluates all live-cached cases + 20-question answer quality check
 *   node tests/eval/run.mjs --live   # first runs collect-live.mjs against Chrome CDP, then evaluates
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathResolve(__dirname, '../..');

function pathResolve(...parts) {
  return resolve(...parts);
}

if (process.argv.includes('--live')) {
  execFileSync(process.execPath, [resolve(__dirname, 'collect-live.mjs'), ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
}

const vite = await createServer({
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});
const core = await vite.ssrLoadModule('/packages/core/src/index.ts');

const casesPath = resolve(__dirname, 'cases.json');
const cachePath = resolve(__dirname, 'probes/nano-cache.json');
const resultsPath = resolve(__dirname, 'results.json');

const cases = JSON.parse(readFileSync(casesPath, 'utf8'));

/**
 * Checks whether a gold sensitive value (or its canonical normalized form) appears unmasked
 * in the outbound excerpt.
 */
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

const NAME_STOPWORDS = new Set(
  'the this that these those either each any both all residential lease agreement landlord tenant premises arab republic egypt cairo maadi road street clause clauses rent deposit utilities maintenance payment entry termination notices governing signed building flat use parties term contract notice page january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday'.split(
    ' ',
  ),
);

const NAME_PATTERNS = [
  /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Eng)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g,
  /\b[A-Z][a-z]{2,}(?:\s+(?:El|Al|Abdel|Abd|Abu|Bin|Ibn|de|van|von))?(?:\s+[A-Z][a-z]{2,})+/g,
  /\b[A-Z]{3,}(?:\s+[A-Z]{3,})+\b/g,
];

function flagNames(text, taken) {
  const out = [];
  for (const [i, re] of NAME_PATTERNS.entries()) {
    for (const m of text.matchAll(re)) {
      const words = m[0].split(/\s+/).filter((w) => !/^(Mr|Mrs|Ms|Miss|Dr|Prof|Eng)\.?$/.test(w));
      if (i > 0 && words.some((w) => NAME_STOPWORDS.has(w.toLowerCase()))) continue;
      const e = { type: 'PERSON', value: m[0], start: m.index, end: m.index + m[0].length, confidence: 0.4, source: 'rules' };
      if (![...taken, ...out].some((t) => t.start < e.end && e.start < t.end)) out.push(e);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function maskChunk(c, entities, tags) {
  const inside = entities
    .filter((e) => e.start >= c.start && e.end <= c.end)
    .map((e) => ({ ...e, start: e.start - c.start, end: e.end - c.start }));
  return core.maskText(c.text, inside, tags);
}

function maskQuestion(question, docEntities, tags) {
  const found = core.detectWithRules(question);
  for (const e of docEntities) {
    for (let i = question.indexOf(e.value); i !== -1; i = question.indexOf(e.value, i + e.value.length)) {
      if (!found.some((f) => f.start < i + e.value.length && i < f.end)) {
        found.push({ ...e, start: i, end: i + e.value.length });
      }
    }
  }
  return core.maskText(question, found, tags);
}

function maskQuestionLlmOnly(question, llmEntities, tags) {
  const found = [];
  for (const e of llmEntities) {
    for (let i = question.indexOf(e.value); i !== -1; i = question.indexOf(e.value, i + e.value.length)) {
      if (!found.some((f) => f.start < i + e.value.length && i < f.end)) {
        found.push({ ...e, start: i, end: i + e.value.length });
      }
    }
  }
  return core.maskText(question, found, tags);
}

/**
 * Loads ONLY verified live model responses (`source === 'live'`) from `nano-cache.json`.
 * Never synthesizes fake model outputs into the cache.
 */
function loadLiveCache() {
  if (!existsSync(cachePath)) return {};
  const raw = JSON.parse(readFileSync(cachePath, 'utf8'));
  const live = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (entry && entry.source === 'live' && entry.modelComponent && entry.modelVersion) {
      live[id] = entry;
    }
  }
  return live;
}

function evaluateCase(tc, doc, chunks, rulesOnly, llmEntry) {
  const question = tc.question;

  // Condition 1: Rules Alone (deterministic regex + checksums only, all clauses sent)
  const rulesTags = core.assignTags(rulesOnly);
  const rulesOutbound = [
    `Question: ${maskQuestion(question, rulesOnly, rulesTags)}`,
    ...chunks.map((c) => `${c.label}: ${maskChunk(c, rulesOnly, rulesTags)}`),
  ].join('\n\n');
  const rulesLeaks = tc.goldSensitive.filter((g) => isLeakedInOutbound(rulesOutbound, g));

  // Parse on-device LLM JSON outputs (either real live entry or in-memory oracle upper bound)
  const llmDetected = core.parseDetectResponse(llmEntry.detectJson, doc);
  const llmMin = core.parseMinimizeResponse(
    llmEntry.minimizeJson,
    chunks.map((c) => c.id),
  );
  const llmRoute = core.parseRouteResponse(llmEntry.routeJson);
  const selectedIds = llmMin ? llmMin.ids : chunks.map((c) => c.id);
  const selectedChunks = chunks.filter((c) => selectedIds.includes(c.id));
  const localRoute = llmRoute ? llmRoute.local : false;

  // Condition 2: On-Device LLM Alone (no deterministic rules, no name fallback, no outbound guard)
  const llmTags = core.assignTags(llmDetected);
  const llmOutbound = localRoute
    ? ''
    : [
        `Question: ${maskQuestionLlmOnly(question, llmDetected, llmTags)}`,
        ...selectedChunks.map((c) => `${c.label}: ${maskChunk(c, llmDetected, llmTags)}`),
      ].join('\n\n');
  const llmLeaks = localRoute ? [] : tc.goldSensitive.filter((g) => isLeakedInOutbound(llmOutbound, g));

  // Condition 3: Envoy Layered (Rules + On-Device LLM + Name Fallback + Outbound Guard)
  const merged = core.mergeEntities(rulesOnly, llmDetected);
  const flaggedFallback = flagNames(doc, merged);
  const layeredEntities = core.mergeEntities(merged, flaggedFallback);
  const layeredTags = core.assignTags(layeredEntities);
  const layeredOutbound = localRoute
    ? ''
    : [
        `Question: ${maskQuestion(question, layeredEntities, layeredTags)}`,
        ...selectedChunks.map((c) => `${c.label}: ${maskChunk(c, layeredEntities, layeredTags)}`),
      ].join('\n\n');
  const knownTags = layeredTags.entries().map((t) => t.tag);
  const guardResult = localRoute
    ? { ok: true, leaks: [] }
    : core.checkOutbound(layeredOutbound, layeredEntities, { knownTags });
  // Hard-blocking Outbound Guard prevents transmission if any leak is detected
  const transmittedOutbound = guardResult.ok ? layeredOutbound : '';
  const layeredLeaks =
    localRoute || !guardResult.ok ? [] : tc.goldSensitive.filter((g) => isLeakedInOutbound(transmittedOutbound, g));

  const targetHit = tc.expectedClauses.every((id) => selectedIds.includes(id));

  return {
    id: tc.id,
    category: tc.category,
    title: tc.title,
    noisy: tc.noisy,
    docChars: doc.length,
    totalClauses: chunks.length,
    goldCount: tc.goldSensitive.length,
    expectedClauses: tc.expectedClauses,
    expectedLocalRoute: tc.expectedLocalRoute,
    modelComponent: llmEntry.modelComponent,
    modelVersion: llmEntry.modelVersion,
    modelLabel: llmEntry.modelLabel,
    recordedAt: llmEntry.recordedAt,
    ms: llmEntry.ms ?? null,
    rulesAlone: {
      leakedCount: rulesLeaks.length,
      leakedValues: rulesLeaks.map((l) => `${l.type}:${l.value}`),
      outboundChars: rulesOutbound.length,
      clausesSent: chunks.length,
    },
    onDeviceLlmAlone: {
      leakedCount: llmLeaks.length,
      leakedValues: llmLeaks.map((l) => `${l.type}:${l.value}`),
      outboundChars: llmOutbound.length,
      clausesSent: localRoute ? 0 : selectedChunks.length,
      selectedIds,
      localRoute,
      targetClauseRecall: targetHit,
      routeAccurate: localRoute === tc.expectedLocalRoute,
    },
    envoyLayered: {
      leakedCount: layeredLeaks.length,
      leakedValues: layeredLeaks.map((l) => `${l.type}:${l.value}`),
      outboundChars: transmittedOutbound.length,
      clausesSent: localRoute || !guardResult.ok ? 0 : selectedChunks.length,
      selectedIds,
      localRoute,
      guardOk: guardResult.ok,
      guardLeaksBlocked: guardResult.leaks.length,
      targetClauseRecall: targetHit,
      routeAccurate: localRoute === tc.expectedLocalRoute,
    },
  };
}

function aggregate(subset) {
  const totalCases = subset.length;
  const totalGold = subset.reduce((s, r) => s + r.goldCount, 0);
  const totalDocChars = subset.reduce((s, r) => s + r.docChars, 0);
  const totalClauses = subset.reduce((s, r) => s + r.totalClauses, 0);

  const calc = (key) => {
    const leakedEntities = subset.reduce((s, r) => s + r[key].leakedCount, 0);
    const zeroLeakCases = subset.filter((r) => r[key].leakedCount === 0).length;
    const outboundChars = subset.reduce((s, r) => s + r[key].outboundChars, 0);
    const clausesSent = subset.reduce((s, r) => s + r[key].clausesSent, 0);
    const clauseRecallHits = subset.filter((r) => (key === 'rulesAlone' ? true : r[key].targetClauseRecall)).length;
    const routeHits = subset.filter((r) => (key === 'rulesAlone' ? false : r[key].routeAccurate)).length;
    const guardBlocks = subset.filter((r) => key === 'envoyLayered' && !r[key].guardOk).length;
    return {
      leakedEntities,
      leakagePct: totalGold ? Number(((leakedEntities / totalGold) * 100).toFixed(2)) : 0,
      privacyRecallPct: totalGold ? Number((((totalGold - leakedEntities) / totalGold) * 100).toFixed(2)) : 100,
      zeroLeakCases,
      zeroLeakCasePct: totalCases ? Number(((zeroLeakCases / totalCases) * 100).toFixed(1)) : 0,
      outboundChars,
      excerptRatioPct: totalDocChars ? Number(((outboundChars / totalDocChars) * 100).toFixed(1)) : 0,
      contextReductionPct: totalDocChars ? Number((((totalDocChars - outboundChars) / totalDocChars) * 100).toFixed(1)) : 0,
      clausesSent,
      clauseRatioPct: totalClauses ? Number(((clausesSent / totalClauses) * 100).toFixed(1)) : 0,
      clauseRecallPct: totalCases ? Number(((clauseRecallHits / totalCases) * 100).toFixed(1)) : 0,
      routeAccuracyPct: totalCases && key !== 'rulesAlone' ? Number(((routeHits / totalCases) * 100).toFixed(1)) : null,
      guardBlocks,
    };
  };

  return {
    totalCases,
    totalGold,
    totalDocChars,
    totalClauses,
    rulesAlone: calc('rulesAlone'),
    onDeviceLlmAlone: calc('onDeviceLlmAlone'),
    envoyLayered: calc('envoyLayered'),
  };
}

const liveCache = loadLiveCache();
const liveCaseResults = [];
const oracleUpperBoundResults = [];
const missingLiveIds = [];

for (const tc of cases) {
  const doc = tc.document;
  const chunks = core.chunkDocument(doc);
  const rulesOnly = core.detectWithRules(doc);

  // 1. Measured LIVE model evaluation (only when a verified real live entry exists)
  const liveEntry = liveCache[tc.id];
  if (liveEntry) {
    liveCaseResults.push(evaluateCase(tc, doc, chunks, rulesOnly, liveEntry));
  } else {
    missingLiveIds.push(tc.id);
  }

  // 2. Separate in-memory Oracle model (upper bound) — NEVER written to nano-cache.json, NEVER called Nano
  const oracleEntities = tc.goldSensitive
    .filter((g) => ['PERSON', 'ORG', 'ADDRESS', 'MONEY'].includes(g.type))
    .map((g) => ({ text: g.value, kind: g.type, role: g.role || (g.type === 'MONEY' ? 'fee' : 'other') }));
  const oracleEntry = {
    modelLabel: 'Oracle model (upper bound)',
    modelComponent: 'synthetic_gold_oracle',
    modelVersion: 'n/a',
    recordedAt: null,
    detectJson: JSON.stringify({ entities: oracleEntities }),
    minimizeJson: JSON.stringify({ clause_ids: tc.expectedClauses, reason: 'Gold clauses.' }),
    routeJson: JSON.stringify({ answerable_locally: tc.expectedLocalRoute, reason: 'Gold route.' }),
  };
  oracleUpperBoundResults.push(evaluateCase(tc, doc, chunks, rulesOnly, oracleEntry));
}

const modelsObserved = [
  ...new Set(liveCaseResults.map((r) => `${r.modelLabel} (${r.modelComponent} ${r.modelVersion})`)),
];
const measuredDates = [...new Set(liveCaseResults.map((r) => (r.recordedAt ? r.recordedAt.slice(0, 10) : null)).filter(Boolean))];

const measuredOverall = aggregate(liveCaseResults);
const measuredClean = aggregate(liveCaseResults.filter((r) => !r.noisy));
const measuredNoisy = aggregate(liveCaseResults.filter((r) => r.noisy));
const oracleOverall = aggregate(oracleUpperBoundResults);

const summaryPayload = {
  generatedAt: new Date().toISOString(),
  totalBenchmarkCases: cases.length,
  liveMeasuredCases: liveCaseResults.length,
  missingLiveCaseIds: missingLiveIds,
  modelsObserved,
  measuredDates,
  measured: {
    overall: measuredOverall,
    clean: measuredClean,
    noisy: measuredNoisy,
    cases: liveCaseResults,
  },
  oracleUpperBound: {
    note: 'Synthetic gold ceiling computed in-memory only; NOT a real model and NOT included in headline tables.',
    overall: oracleOverall,
  },
};

writeFileSync(resultsPath, JSON.stringify(summaryPayload, null, 2) + '\n', 'utf8');

if (liveCaseResults.length === 0) {
  console.warn(
    `WARNING: 0/${cases.length} cases have verified live model entries in tests/eval/probes/nano-cache.json.\n` +
      `Run \`node tests/eval/collect-live.mjs\` against Chrome CDP (port 9333) to record real on-device model outputs.`,
  );
} else {
  const modelHeader = modelsObserved.join(', ');
  console.log(
    `\n=== ENVOY MEASURED EVALUATION (${liveCaseResults.length}/${cases.length} LIVE CASES · ${measuredOverall.totalGold} GOLD ITEMS) ===\n` +
      `Model(s): ${modelHeader} · Date(s): ${measuredDates.join(', ')}`,
  );
  console.table({
    'Rules Alone (deterministic only)': {
      'PII Leakage %': `${measuredOverall.rulesAlone.leakagePct}% (${measuredOverall.rulesAlone.leakedEntities}/${measuredOverall.totalGold})`,
      'Privacy Recall %': `${measuredOverall.rulesAlone.privacyRecallPct}%`,
      'Zero-Leak Cases %': `${measuredOverall.rulesAlone.zeroLeakCasePct}%`,
      'Context Reduction %': `${measuredOverall.rulesAlone.contextReductionPct}%`,
      'Clauses Sent %': `${measuredOverall.rulesAlone.clauseRatioPct}%`,
      'Clause Recall %': `${measuredOverall.rulesAlone.clauseRecallPct}%`,
      'Route Acc %': 'n/a',
    },
    [`On-Device LLM Alone (${modelHeader})`]: {
      'PII Leakage %': `${measuredOverall.onDeviceLlmAlone.leakagePct}% (${measuredOverall.onDeviceLlmAlone.leakedEntities}/${measuredOverall.totalGold})`,
      'Privacy Recall %': `${measuredOverall.onDeviceLlmAlone.privacyRecallPct}%`,
      'Zero-Leak Cases %': `${measuredOverall.onDeviceLlmAlone.zeroLeakCasePct}%`,
      'Context Reduction %': `${measuredOverall.onDeviceLlmAlone.contextReductionPct}%`,
      'Clauses Sent %': `${measuredOverall.onDeviceLlmAlone.clauseRatioPct}%`,
      'Clause Recall %': `${measuredOverall.onDeviceLlmAlone.clauseRecallPct}%`,
      'Route Acc %': `${measuredOverall.onDeviceLlmAlone.routeAccuracyPct}%`,
    },
    [`Envoy Layered (Rules + ${modelHeader} + Guard)`]: {
      'PII Leakage %': `${measuredOverall.envoyLayered.leakagePct}% (${measuredOverall.envoyLayered.leakedEntities}/${measuredOverall.totalGold})`,
      'Privacy Recall %': `${measuredOverall.envoyLayered.privacyRecallPct}%`,
      'Zero-Leak Cases %': `${measuredOverall.envoyLayered.zeroLeakCasePct}%`,
      'Context Reduction %': `${measuredOverall.envoyLayered.contextReductionPct}%`,
      'Clauses Sent %': `${measuredOverall.envoyLayered.clauseRatioPct}%`,
      'Clause Recall %': `${measuredOverall.envoyLayered.clauseRecallPct}%`,
      'Route Acc %': `${measuredOverall.envoyLayered.routeAccuracyPct}%`,
    },
  });
}

console.log(
  `\n--- Separate Appendix: Oracle model (upper bound, synthetic gold ceiling across all ${cases.length} cases — NOT a real model) ---\n` +
    `Oracle + Envoy Layered upper bound: leakage=${oracleOverall.envoyLayered.leakagePct}% (${oracleOverall.envoyLayered.leakedEntities}/${oracleOverall.totalGold}), contextReduction=${oracleOverall.envoyLayered.contextReductionPct}%, clausesSent=${oracleOverall.envoyLayered.clauseRatioPct}%`,
);
console.log(`Saved full results to ${resultsPath}`);

await vite.close();

// Also run the 20-question answer quality & restoration verification on live-cached cases
if (liveCaseResults.length > 0) {
  const { runAnswerQualityEval } = await import('./run-answers.mjs');
  await runAnswerQualityEval({ live: false });
}

export { summaryPayload };

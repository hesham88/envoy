#!/usr/bin/env node
/**
 * PAPILLON-Style Answer Quality vs. Privacy Evaluation — Milestone 1 & 4
 *
 * Grades ONLY verbatim answers produced by the REAL product `answer()` function collected via
 * `runCase({ withAnswer: true })` (in `tests/eval/probes/arms/<arm>.json`).
 * NEVER regenerates Envoy answers outside `answer()` and NEVER adds extra prompt lines.
 *
 * Both the raw-document cloud ceiling and the separate fixed-rubric judge run inside a browser page
 * through the Firebase AI Logic SDK (`getGenerativeModel` with `InferenceMode.ONLY_IN_CLOUD`,
 * Remote Config `cloud_model` / `VITE_CLOUD_MODEL`, and App Check).
 *
 * Reports `answerQualityRetained = envoyScore / rawCeilingScore` honestly per arm with exact `n`,
 * model, date, and breakdown of on-device vs. cloud answers.
 *
 * Usage:
 *   node tests/eval/run-quality.mjs --all --limit 20 --port 5174
 *   node tests/eval/run-quality.mjs --all --cache-only
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callCloudViaSdk, launchHeadlessSdkPage } from './lib/browser-sdk.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES_PATH = resolve(__dirname, 'cases.json');
const ARMS_DIR = resolve(__dirname, 'probes/arms');
const CACHE_PATH = resolve(__dirname, 'probes/quality-cache.json');
const OUT_PATH = resolve(__dirname, 'quality-results.json');

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

const requestedArms = args.all === 'true' ? ['gemma4', 'nano', 'basic'] : [args.arm ?? 'basic'];
const limit = Number(args.limit ?? 20);
const port = Number(args.port ?? 5174);
const appUrl = args.url ?? `http://localhost:${port}/`;
const cdpPort = Number(args['cdp-port'] ?? 9334);
const paceMs = Number(args.pace ?? 4200);
const force = args.force === 'true';
const cacheOnly = args['cache-only'] === 'true';

const EXPECTED_SDK = 'firebase/ai (ONLY_IN_CLOUD)';

export const QUALITY_IDS = [
  'lease-01-rent-cap',
  'lease-02-end-date-local',
  'lease-03-early-exit-deposit',
  'lease-04-late-fee-grace-period',
  'lease-05-sublet-policy',
  'lease-06-landlord-entry-notice-local',
  'lease-07-commercial-cam-cap',
  'lease-08-plumbing-responsibility',
  'offer-01-severance-calculation',
  'offer-02-non-compete-scope',
  'offer-03-probation-period-local',
  'offer-04-bonus-proration',
  'offer-05-ip-side-project',
  'med-01-fasting-glucose-threshold',
  'med-02-vitamin-d-dosage-local',
  'med-03-insurance-copay-cap',
  'freelance-01-kill-fee',
  'freelance-02-invoice-payment-net-local',
  'freelance-03-card-hold-dispute',
  'loan-01-early-payoff-penalty',
];

function buildJudgePrompt(tc, candidateAnswer) {
  return `You are a strict evaluation judge grading an AI assistant's answer against the full source document.

## Source Document (ground truth)
${tc.document}

## Expected Relevant Clause(s)
Clause(s): ${tc.expectedClauses.join(', ')}

## User Question
${tc.question}

## Candidate Answer to Grade
${candidateAnswer}

## Rubric
- "verdict":
  - "correct" (1.0): accurate verdict, accurate numbers/dates/conditions, no hallucination.
  - "partially" (0.5): right general direction, but misses a key condition, number, or nuance.
  - "wrong" (0.0): incorrect verdict, refuses unnecessarily, or states wrong numbers/facts.
- "citesRightClause": true if the answer explicitly cites or accurately reflects the content of expected clause(s) ${tc.expectedClauses.join(', ')}.
- "rationale": one concise sentence explaining the grade.

Return strict JSON:
{"verdict": "correct"|"partially"|"wrong", "citesRightClause": true|false, "rationale": "..."}`;
}

const VERDICT_SCORE = { correct: 1.0, partially: 0.5, wrong: 0.0 };

function parseJudge(raw) {
  try {
    const j = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    const verdict =
      j.verdict === 'correct' || j.verdict === 'partially' || j.verdict === 'wrong' ? j.verdict : 'wrong';
    return {
      verdict,
      score: VERDICT_SCORE[verdict],
      citesRightClause: Boolean(j.citesRightClause),
      rationale: String(j.rationale ?? ''),
    };
  } catch {
    return { verdict: 'wrong', score: 0, citesRightClause: false, rationale: 'Judge JSON parse error' };
  }
}

function isValidSdkEntry(entry) {
  return Boolean(entry && entry.source === 'live' && entry.sdk === EXPECTED_SDK && typeof entry.text === 'string');
}

const cases = JSON.parse(readFileSync(CASES_PATH, 'utf8'));
const caseMap = new Map(cases.map((c) => [c.id, c]));
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
mkdirSync(dirname(CACHE_PATH), { recursive: true });

let sdkSession = null;
let detectedModel = null;
let liveCalls = 0;

async function ensureSdk() {
  if (!sdkSession) {
    sdkSession = await launchHeadlessSdkPage({ appUrl, cdpPort });
    detectedModel = sdkSession.info.cloudModel;
    console.log(
      `[quality-sdk] Headless Chromium ready on CDP ${cdpPort} · Firebase AI Logic SDK ONLY_IN_CLOUD · cloudModel=${detectedModel}`,
    );
  }
  return sdkSession;
}

async function cachedSdkCall(key, prompt, opts = {}) {
  const prev = cache[key];
  if (!force && isValidSdkEntry(prev)) {
    if (!detectedModel) detectedModel = prev.model;
    return prev;
  }
  if (cacheOnly) return null;
  const sdk = await ensureSdk();
  const res = await callCloudViaSdk(sdk.page, prompt, {
    json: Boolean(opts.json),
    temperature: 0.1,
    maxOutputTokens: 320,
    paceMs,
  });
  const now = new Date().toISOString();
  cache[key] = {
    source: 'live',
    sdk: res.sdk,
    inferenceSource: res.inferenceSource,
    model: res.model,
    date: now.slice(0, 10),
    recordedAt: now,
    ms: res.ms,
    text: res.text,
  };
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  liveCalls++;
  return cache[key];
}

try {
  const targetIds = QUALITY_IDS.slice(0, limit);
  const byArm = {};

  for (const armId of requestedArms) {
    const armPath = resolve(ARMS_DIR, `${armId}.json`);
    if (!existsSync(armPath)) continue;
    const armFile = JSON.parse(readFileSync(armPath, 'utf8'));
    const hasLiveAnswers = Object.values(armFile.entries ?? {}).some((e) => Boolean(e?.result?.answer?.text));
    if (!hasLiveAnswers) continue;
    const rows = [];

    for (const id of targetIds) {
      const tc = caseMap.get(id);
      const entry = armFile.entries?.[id];
      if (!tc || !entry || entry.source !== 'live' || !entry.result?.ok) continue;
      const r = entry.result;

      // STRICT Milestone 1 rule: ONLY grade verbatim answers returned by real runCase({ withAnswer: true }).
      // Never regenerate answers outside answer() and never add extra prompt lines.
      // Exception: if `guardOk === false`, calling `answer()` in the real product throws
      // `OutboundBlockedError` (0 bytes sent, no automatic answer without user review intervention).
      // Record that honestly as `answerSource: 'guard_blocked'` with score 0.0 when the arm has
      // live `withAnswer` results collected.
      const envoyText = typeof r.answer?.text === 'string' && r.answer.text.trim() ? r.answer.text.trim() : null;
      const isGuardBlocked = !r.guardOk && !envoyText;
      if (!envoyText && !isGuardBlocked) continue;
      const answerSource = isGuardBlocked ? 'guard_blocked' : (r.answer.source ?? 'unknown');

      // (ii) Raw-document cloud ceiling (fictional data) via in-browser Firebase AI Logic SDK ONLY_IN_CLOUD
      const rawPrompt = `## Instructions\nAnswer the user's question using only the document. Start with a one-sentence verdict, then explain briefly and cite the clause number.\n\n## Question\n${tc.question}\n\n## Document\n${tc.document}`;
      const rawRes = await cachedSdkCall(`sdk:raw:ans:${id}`, rawPrompt);
      if (!rawRes) continue;
      const rawJudgeRes = await cachedSdkCall(`sdk:raw:judge:${id}`, buildJudgePrompt(tc, rawRes.text), { json: true });
      if (!rawJudgeRes) continue;
      const rawJudge = parseJudge(rawJudgeRes.text);

      let envoyJudge;
      if (isGuardBlocked) {
        envoyJudge = {
          verdict: 'wrong',
          score: 0.0,
          citesRightClause: false,
          rationale: `OutboundBlockedError: guard blocked sending (${(r.leaks ?? []).length} flagged item(s)); requires manual user review.`,
        };
      } else {
        // (i) Judge the verbatim product answer() output (cache key includes recordedAt so new live answers re-grade)
        const ansStamp = (entry.recordedAt ?? 'unknown').slice(0, 19);
        const envoyJudgeRes = await cachedSdkCall(
          `sdk:real:${armId}:judge:${id}:${ansStamp}`,
          buildJudgePrompt(tc, envoyText),
          { json: true },
        );
        if (!envoyJudgeRes) continue;
        envoyJudge = parseJudge(envoyJudgeRes.text);
      }

      rows.push({
        id,
        question: tc.question,
        recordedAt: entry.recordedAt ?? null,
        answerSource,
        answerMs: r.answer?.ms ?? null,
        guardOk: r.guardOk,
        envoyAnswer: envoyText ?? '[Blocked by Outbound Guard: OutboundBlockedError]',
        envoyJudge,
        rawCeilingJudge: rawJudge,
      });
    }

    if (rows.length > 0) {
      const envoyAvg = rows.reduce((s, x) => s + x.envoyJudge.score, 0) / rows.length;
      const rawAvg = rows.reduce((s, x) => s + x.rawCeilingJudge.score, 0) / rows.length;
      const retained = rawAvg > 0 ? Number((envoyAvg / rawAvg).toFixed(4)) : 1;
      const clauseCiteRate = Number(
        (rows.filter((x) => x.envoyJudge.citesRightClause).length / rows.length).toFixed(4),
      );
      const dates = [...new Set(rows.map((r) => r.recordedAt?.slice(0, 10)).filter(Boolean))];
      const answeredRows = rows.filter((x) => x.answerSource !== 'guard_blocked');
      const unblockedAvg = answeredRows.length
        ? answeredRows.reduce((s, x) => s + x.envoyJudge.score, 0) / answeredRows.length
        : 0;
      byArm[armId] = {
        n: rows.length,
        nAnswered: answeredRows.length,
        nGuardBlocked: rows.length - answeredRows.length,
        dates,
        answerOrigin: 'verbatim runCase({ withAnswer: true }) via @envoy/ai answer()',
        answerSources: {
          on_device: rows.filter((x) => x.answerSource === 'on_device').length,
          in_cloud: rows.filter((x) => x.answerSource === 'in_cloud').length,
          guard_blocked: rows.filter((x) => x.answerSource === 'guard_blocked').length,
        },
        envoyScore: Number(envoyAvg.toFixed(4)),
        unblockedEnvoyScore: Number(unblockedAvg.toFixed(4)),
        rawCeilingScore: Number(rawAvg.toFixed(4)),
        answerQualityRetained: retained,
        clauseCiteRate,
        verdicts: {
          correct: rows.filter((x) => x.envoyJudge.verdict === 'correct').length,
          partially: rows.filter((x) => x.envoyJudge.verdict === 'partially').length,
          wrong: rows.filter((x) => x.envoyJudge.verdict === 'wrong').length,
        },
        rows,
      };
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'live',
    answerMethod: 'Real product answer() collected via runCase({ withAnswer: true }) through Firebase AI Logic in Chrome (no regenerated answers, no extra prompt lines)',
    judgeModel: detectedModel || 'gemini-3.5-flash-lite',
    judgeSdk: EXPECTED_SDK,
    byArm,
  };
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log('\n=== PAPILLON-STYLE ANSWER QUALITY VS PRIVACY SUMMARY (REAL runCase({ withAnswer: true })) ===');
  const tbl = {};
  for (const [armId, s] of Object.entries(byArm)) {
    tbl[`${armId} [n=${s.n}]`] = {
      'Sources (dev/cloud/blk)': `${s.answerSources.on_device}/${s.answerSources.in_cloud}/${s.answerSources.guard_blocked}`,
      'Envoy Score': `${(s.envoyScore * 100).toFixed(1)}%`,
      'Unblocked Score': `${(s.unblockedEnvoyScore * 100).toFixed(1)}% (${s.nAnswered})`,
      'Raw Ceiling': `${(s.rawCeilingScore * 100).toFixed(1)}%`,
      'Quality Retained': `${(s.answerQualityRetained * 100).toFixed(1)}%`,
      'Clause Cite %': `${(s.clauseCiteRate * 100).toFixed(1)}%`,
      'C / P / W': `${s.verdicts.correct} / ${s.verdicts.partially} / ${s.verdicts.wrong}`,
    };
  }
  console.table(tbl);
  console.log(`Live SDK calls this run: ${liveCalls} · Saved ${OUT_PATH}`);
} finally {
  if (sdkSession) await sdkSession.close();
}

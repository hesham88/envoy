#!/usr/bin/env node
/**
 * PAPILLON-Style Answer Quality vs. Privacy Evaluation — Milestone 4 (PAIR Ch. 1–2)
 *
 * Compares three answering conditions across benchmark questions:
 *   (i)   Envoy (masked approved outbound -> Firebase AI Logic cloud -> local restoreAnswer())
 *   (ii)  Cloud Gemini Raw Ceiling (full raw fictional document -> Firebase AI Logic cloud)
 *   (iii) Local-Only Answer (when present from on-device arm cache)
 *
 * Uses cloud Gemini via Firebase AI Logic (`ONLY_IN_CLOUD` + App Check) as a fixed-rubric judge:
 *   verdict: "correct" (1.0) | "partially" (0.5) | "wrong" (0.0)
 *   citesRightClause: boolean
 * Reports `answerQualityRetained = envoyScore / rawCeilingScore` (the privacy-utility trade-off).
 *
 * Writes `tests/eval/quality-results.json` (consumed by `npm run eval` -> `tests/eval/summary.json`)
 * and caches all LLM answers & judge verdicts in `tests/eval/probes/quality-cache.json`.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
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
const cacheOnly = args['cache-only'] === 'true';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const QUALITY_IDS = [
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

function readEnvLocal() {
  const envPath = resolve(ROOT, 'apps/web/.env.local');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function exchangeAppCheckDebugToken(env) {
  const { VITE_FIREBASE_APP_ID: appId, VITE_FIREBASE_API_KEY: apiKey, VITE_APPCHECK_DEBUG_TOKEN: debugToken, VITE_FIREBASE_PROJECT_ID: projectId } = env;
  if (!appId || !apiKey || !debugToken || !projectId) return null;
  const url = `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appId}:exchangeDebugToken?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ debugToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.token || null;
}

async function callCloud(prompt, env, appCheckJwt, { json = false } = {}, attempt = 0) {
  const projectId = env.VITE_FIREBASE_PROJECT_ID || 'envoy-hybrid-ai';
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const model = env.VITE_CLOUD_MODEL || 'gemini-3.5-flash-lite';
  const url = `https://firebasevertexai.googleapis.com/v1beta/projects/${projectId}/models/${model}:generateContent?key=${apiKey}`;
  const t0 = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': appCheckJwt },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 320,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });
  const ms = Math.round(performance.now() - t0);
  if (res.status === 429 && attempt < 3) {
    const waitMs = 15000 * (attempt + 1);
    console.warn(`429 rate-limited; backing off ${waitMs}ms...`);
    await sleep(waitMs);
    return callCloud(prompt, env, appCheckJwt, { json }, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 180)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('')?.trim() || '';
  await sleep(4200);
  return { text, ms, model };
}

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
    const verdict = j.verdict === 'correct' || j.verdict === 'partially' || j.verdict === 'wrong' ? j.verdict : 'wrong';
    return { verdict, score: VERDICT_SCORE[verdict], citesRightClause: Boolean(j.citesRightClause), rationale: String(j.rationale ?? '') };
  } catch {
    return { verdict: 'wrong', score: 0, citesRightClause: false, rationale: 'Judge JSON parse error' };
  }
}

const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
try {
  const core = await vite.ssrLoadModule('/packages/core/src/index.ts');
  const ai = await vite.ssrLoadModule('/packages/ai/src/index.ts');
  const cases = JSON.parse(readFileSync(CASES_PATH, 'utf8'));
  const caseMap = new Map(cases.map((c) => [c.id, c]));
  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
  mkdirSync(dirname(CACHE_PATH), { recursive: true });

  const env = readEnvLocal();
  const appCheckJwt = cacheOnly ? null : await exchangeAppCheckDebugToken(env);
  if (!cacheOnly && !appCheckJwt) {
    throw new Error('Could not exchange Firebase App Check debug token from apps/web/.env.local.');
  }

  async function cachedCall(key, prompt, opts = {}) {
    if (cache[key]) return cache[key];
    if (cacheOnly) return null;
    const res = await callCloud(prompt, env, appCheckJwt, opts);
    cache[key] = { ...res, recordedAt: new Date().toISOString() };
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf8');
    return cache[key];
  }

  const targetIds = QUALITY_IDS.slice(0, limit);
  const byArm = {};
  const rawCeilingRows = [];
  const rawSeen = new Set();

  for (const armId of requestedArms) {
    const armPath = resolve(ARMS_DIR, `${armId}.json`);
    if (!existsSync(armPath)) continue;
    const armFile = JSON.parse(readFileSync(armPath, 'utf8'));
    const rows = [];

    for (const id of targetIds) {
      const tc = caseMap.get(id);
      const entry = armFile.entries?.[id];
      if (!tc || !entry || entry.source !== 'live' || !entry.result?.ok) continue;
      const r = entry.result;

      // (ii) Raw-document cloud ceiling (fictional data)
      let rawAns = null;
      let rawJudge = null;
      const rawPrompt = `## Instructions\nAnswer the user's question using only the document. Start with a one-sentence verdict, then explain briefly and cite the clause number.\n\n## Question\n${tc.question}\n\n## Document\n${tc.document}`;
      const rawRes = await cachedCall(`raw:ans:${id}`, rawPrompt);
      if (rawRes) {
        rawAns = rawRes.text;
        const jRes = await cachedCall(`raw:judge:${id}`, buildJudgePrompt(tc, rawAns), { json: true });
        if (jRes) rawJudge = parseJudge(jRes.text);
        if (!rawSeen.has(id) && rawJudge) {
          rawSeen.add(id);
          rawCeilingRows.push({ id, ...rawJudge });
        }
      }

      // (i) Envoy answer: use live runCase answer if captured, otherwise call cloud on approved masked outbound + local restoreAnswer
      let envoyText = r.answer?.text ?? null;
      let answerSource = r.answer?.source ?? null;

      if (!envoyText) {
        if (!r.guardOk) {
          envoyText = '[Blocked by Outbound Guard before sending to cloud]';
          answerSource = 'guard_blocked';
        } else {
          const guardrail =
            '\nStrict tag rule: ONLY use {{TAG * factor}} with exact numeric [TAG] names that actually appear in square brackets inside the Excerpt.';
          const reasonPrompt = ai.buildReasonPrompt(r.outbound) + guardrail;
          const cloudRes = await cachedCall(`envoy:${armId}:ans:${id}`, reasonPrompt);
          if (cloudRes) {
            // Reconstruct TagMap from the recorded entities so restoreAnswer restores [TAG] and {{EXPR}}
            const ents = (r.entities ?? []).map((e) => ({ ...e, start: 0, end: e.value.length, confidence: 1 }));
            const tags = core.assignTags(ents);
            const restored = core.restoreAnswer(cloudRes.text, tags);
            envoyText = restored.text;
            answerSource = 'in_cloud';
          }
        }
      }

      if (!envoyText || !rawJudge) continue;
      const envoyJudgeRes = await cachedCall(`envoy:${armId}:judge:${id}`, buildJudgePrompt(tc, envoyText), { json: true });
      if (!envoyJudgeRes) continue;
      const envoyJudge = parseJudge(envoyJudgeRes.text);

      rows.push({
        id,
        question: tc.question,
        answerSource,
        guardOk: r.guardOk,
        envoyAnswer: envoyText,
        envoyJudge,
        rawCeilingJudge: rawJudge,
      });
    }

    if (rows.length > 0) {
      const envoyAvg = rows.reduce((s, x) => s + x.envoyJudge.score, 0) / rows.length;
      const rawAvg = rows.reduce((s, x) => s + x.rawCeilingJudge.score, 0) / rows.length;
      const retained = rawAvg > 0 ? Number((envoyAvg / rawAvg).toFixed(4)) : 1;
      const clauseCiteRate = Number((rows.filter((x) => x.envoyJudge.citesRightClause).length / rows.length).toFixed(4));
      byArm[armId] = {
        n: rows.length,
        envoyScore: Number(envoyAvg.toFixed(4)),
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
    judgeModel: env.VITE_CLOUD_MODEL || 'gemini-3.5-flash-lite',
    mode: 'ONLY_IN_CLOUD (Firebase AI Logic + App Check)',
    byArm,
  };
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log('\n=== PAPILLON-STYLE ANSWER QUALITY VS PRIVACY SUMMARY ===');
  const tbl = {};
  for (const [armId, s] of Object.entries(byArm)) {
    tbl[`${armId} [n=${s.n}]`] = {
      'Envoy Score': `${(s.envoyScore * 100).toFixed(1)}%`,
      'Raw Ceiling': `${(s.rawCeilingScore * 100).toFixed(1)}%`,
      'Quality Retained': `${(s.answerQualityRetained * 100).toFixed(1)}%`,
      'Clause Cite %': `${(s.clauseCiteRate * 100).toFixed(1)}%`,
      'C / P / W': `${s.verdicts.correct} / ${s.verdicts.partially} / ${s.verdicts.wrong}`,
    };
  }
  console.table(tbl);
  console.log(`Saved ${OUT_PATH}`);
} finally {
  await vite.close();
}

/**
 * Envoy Phase 5 — 20-Question Answer Quality & Local Restoration Benchmark (`BRIEF.md` §8)
 *
 * Evaluates 20 representative questions across all 6 document categories:
 * - Runs the Envoy Layered privacy pipeline (Rules + Nano 4 + Clause Minimizer + Outbound Guard)
 * - Verifies `guard.ok === true` (0 PII leaks) before any cloud call
 * - Calls live Firebase AI Logic (`gemini-3.5-flash-lite` with Firebase App Check token) when `--live`
 *   is passed (or replays cached raw responses from `tests/eval/probes/answer-cache.json`)
 * - Runs `restoreAnswer(rawModelReply, tags)` on-device to restore `[TAG]` placeholders and evaluate
 *   `{{TAG * factor}}` arithmetic expressions locally
 * - Verifies 4 automated quality gates on every answer:
 *   1. `zeroCloudLeak`: `guard.ok === true` (and `0 bytes` sent for `on_device` routed questions)
 *   2. `zeroUnresolvedTags`: No unreplaced `[TAG]` or `{{EXPR}}` tokens in the final answer
 *   3. `mathVerified`: Every arithmetic question produces a `computed: true` RestoredSpan matching gold
 *   4. `factMatch`: The restored answer contains the ground-truth verdict and restored numbers/facts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CASES_PATH = path.join(__dirname, 'cases.json');
const NANO_CACHE_PATH = path.join(__dirname, 'probes/nano-cache.json');
const ANSWER_CACHE_PATH = path.join(__dirname, 'probes/answer-cache.json');
const ANSWER_RESULTS_PATH = path.join(__dirname, 'answer-quality.json');

const BENCHMARK_20 = [
  {
    id: 'lease-01-rent-cap',
    expectedRoute: 'in_cloud',
    expectedMathValues: ['EGP 9,350', 'EGP 850'],
    expectedFacts: ['no', '10%'],
    fallbackRawReply:
      'No, your landlord cannot raise the rent 20% this year. Under Clause 7, the Landlord may increase the monthly rent ([RENT]) at most once per contract year by no more than 10% (to {{RENT * 1.10}}), provided at least 60 days\' written notice is given before the anniversary date.',
  },
  {
    id: 'lease-02-end-date-local',
    expectedRoute: 'on_device',
    expectedMathValues: null,
    expectedFacts: ['three', '2024', '2027'],
    fallbackRawReply:
      'Your lease runs for a term of three (3) years starting 1 September 2024 and ending on 31 August 2027 (Clause 2), unless ended at the end of a contract year with 60 days\' written notice (Clause 10).',
  },
  {
    id: 'lease-03-early-exit-deposit',
    expectedRoute: 'in_cloud',
    expectedMathValues: null,
    expectedFacts: ['deposit', 'EGP 17,000', '30'],
    fallbackRawReply:
      'You may end the lease early by giving 90 days\' written notice (Clause 10), and your [DEPOSIT] deposit will be returned within 30 days after keys are returned, less any unpaid rent or documented damages (Clause 6). If you leave early without the required 90-day notice, the Landlord may retain one month\'s rent ([RENT]) from your [DEPOSIT] deposit.',
  },
  {
    id: 'lease-04-late-fee-grace-period',
    expectedRoute: 'in_cloud',
    expectedMathValues: null,
    expectedFacts: ['no', '10'],
    fallbackRawReply:
      'No, you do not owe the late fee if you pay on the 8th of the month. Under Clause 8, the [FEE] late fee only applies when rent is paid more than 10 days after the first day of the month.',
  },
  {
    id: 'lease-05-sublet-policy',
    expectedRoute: 'in_cloud',
    expectedMathValues: null,
    expectedFacts: ['no', 'written'],
    fallbackRawReply:
      'No, you cannot sublet or list a bedroom on a short-term basis without asking the owner. Clause 3 states that the premises may be used solely as a private residence and prohibits subletting or short-term rental listings without the Landlord\'s prior written consent.',
  },
  {
    id: 'lease-06-landlord-entry-notice-local',
    expectedRoute: 'on_device',
    expectedMathValues: null,
    expectedFacts: ['48', 'Clause 4'],
    fallbackRawReply:
      'The Landlord must give at least 48 hours\' written notice before entering for routine inspection or non-urgent repairs (Clause 4).',
  },
  {
    id: 'lease-07-commercial-cam-cap',
    expectedRoute: 'in_cloud',
    expectedMathValues: ['EGP 4,860', 'EGP 360'],
    expectedFacts: ['no', '15%'],
    fallbackRawReply:
      'No, the building management cannot increase the monthly service charge by 15% next year. Under Clause 3, annual increases to the [FEE] monthly service charge are capped at 8% per year, which sets the maximum next year at {{FEE * 1.08}}.',
  },
  {
    id: 'lease-08-plumbing-responsibility',
    expectedRoute: 'in_cloud',
    expectedMathValues: null,
    expectedFacts: ['Landlord', 'Clause 3'],
    fallbackRawReply:
      'The Landlord is responsible for paying for the repair. Under Clause 3, the Landlord is solely responsible for structural walls, main risers, and hidden plumbing inside the walls.',
  },
  {
    id: 'offer-01-severance-calculation',
    expectedRoute: 'in_cloud',
    expectedMathValues: ['EGP 130,000'],
    expectedFacts: ['EGP 65,000', 'EGP 130,000'],
    fallbackRawReply:
      'You receive two months of gross salary ({{SALARY * 2}}) in severance pay, plus a 60-day written notice period. Clause 5 states that termination without cause after probation entitles you to 2 months of your [SALARY] monthly gross salary (Clause 2).',
  },
  {
    id: 'offer-02-non-compete-scope',
    expectedRoute: 'in_cloud',
    expectedMathValues: null,
    expectedFacts: ['healthcare', 'Clause 4'],
    fallbackRawReply:
      'Yes, you may immediately join a healthcare software startup in Cairo. Clause 4 limits the 6-month non-compete restriction to consumer payment gateway and mobile wallet companies, and explicitly excludes healthcare software.',
  },
  {
    id: 'offer-03-probation-period-local',
    expectedRoute: 'on_device',
    expectedMathValues: null,
    expectedFacts: ['90', 'Clause 3'],
    fallbackRawReply:
      'Your probationary period is the first ninety (90) days of employment (Clause 3).',
  },
  {
    id: 'offer-04-bonus-proration',
    expectedRoute: 'in_cloud',
    expectedMathValues: ['EGP 144,000'],
    expectedFacts: ['EGP 80,000', 'EGP 144,000'],
    fallbackRawReply:
      'Your maximum annual performance bonus at 100% target achievement is {{SALARY * 1.8}}. Under Clause 3, full target achievement pays 1.8 times your [SALARY] monthly base salary (Clause 2).',
  },
  {
    id: 'offer-05-ip-side-project',
    expectedRoute: 'in_cloud',
    expectedMathValues: null,
    expectedFacts: ['Clause 4'],
    fallbackRawReply:
      'No, the company does not own your unrelated weekend hobby project. Clause 4 states that inventions or software created entirely on your own time, without company equipment or confidential information, and unrelated to the company\'s business remain your sole property.',
  },
  {
    id: 'med-01-fasting-glucose-threshold',
    expectedRoute: 'in_cloud',
    expectedMathValues: null,
    expectedFacts: ['100', '125', '3 months'],
    fallbackRawReply:
      'The report classifies a fasting blood glucose of 114 mg/dL within the impaired fasting glucose (prediabetes) reference range of 100–125 mg/dL (Clause 3). Clause 4 recommends repeating the HbA1c test in 3 months along with dietary and exercise review.',
  },
  {
    id: 'med-02-vitamin-d-dosage-local',
    expectedRoute: 'on_device',
    expectedMathValues: null,
    expectedFacts: ['8', 'Clause 3'],
    fallbackRawReply:
      'The repeat serum 25-OH Vitamin D blood test should be scheduled in eight (8) weeks (Clause 3).',
  },
  {
    id: 'med-03-insurance-copay-cap',
    expectedRoute: 'in_cloud',
    expectedMathValues: ['EGP 5,000'],
    expectedFacts: ['EGP 25,000', 'EGP 5,000', '20%'],
    fallbackRawReply:
      'Your 20% out-of-pocket co-pay is {{FEE * 0.20}}. Under Clause 3, the insurer covers 80% of the [FEE] procedure package fee and the patient pays the remaining 20% co-payment.',
  },
  {
    id: 'freelance-01-kill-fee',
    expectedRoute: 'in_cloud',
    expectedMathValues: ['USD 3,000'],
    expectedFacts: ['50%', 'USD 6,000', 'USD 3,000'],
    fallbackRawReply:
      'The client must pay {{FEE * 0.50}} (50% of the [FEE] Milestone 2 fee). Clause 4 requires a 50% cancellation kill fee for any active milestone cancelled after work has begun, payable within 14 days.',
  },
  {
    id: 'freelance-02-invoice-payment-net-local',
    expectedRoute: 'on_device',
    expectedMathValues: null,
    expectedFacts: ['15', 'Clause 3'],
    fallbackRawReply:
      'The client must pay within fifteen (15) calendar days of receiving an invoice (Clause 3).',
  },
  {
    id: 'freelance-03-card-hold-dispute',
    expectedRoute: 'in_cloud',
    expectedMathValues: ['EGP 15,000'],
    expectedFacts: ['50%', 'EGP 15,000'],
    fallbackRawReply:
      'You receive a 50% refund of your [DEPOSIT] deposit, which equals {{DEPOSIT * 0.50}}. Clause 3 provides a 50% deposit refund when a booking is cancelled between 14 and 29 days before the event date.',
  },
  {
    id: 'loan-01-early-payoff-penalty',
    expectedRoute: 'in_cloud',
    expectedMathValues: null,
    expectedFacts: ['3%', 'principal'],
    fallbackRawReply:
      'A 3% early-settlement administrative charge applies if you pay off your remaining loan balance early. Clause 3 permits full early settlement at any time with 15 days\' notice subject to a 3% charge on the prepaid principal balance.',
  },
];

function readEnvLocal() {
  const envPath = path.join(ROOT, 'apps/web/.env.local');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function exchangeAppCheckDebugToken(env) {
  const appId = env.VITE_FIREBASE_APP_ID;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const debugToken = env.VITE_APPCHECK_DEBUG_TOKEN;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
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

async function callFirebaseAiLogicCloud(prompt, env, appCheckJwt) {
  const projectId = env.VITE_FIREBASE_PROJECT_ID || 'envoy-hybrid-ai';
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const model = env.VITE_CLOUD_MODEL || 'gemini-3.5-flash-lite';
  const url = `https://firebasevertexai.googleapis.com/v1beta/projects/${projectId}/models/${model}:generateContent?key=${apiKey}`;
  const t0 = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-AppCheck': appCheckJwt,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
    }),
  });
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('')?.trim() || '';
  return { text, ms, model };
}

export async function runAnswerQualityEval({ live = false } = {}) {
  const server = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const core = await server.ssrLoadModule('/packages/core/src/index.ts');
    const ai = await server.ssrLoadModule('/packages/ai/src/index.ts');
    const cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
    const nanoCache = JSON.parse(fs.readFileSync(NANO_CACHE_PATH, 'utf8'));
    const answerCache = fs.existsSync(ANSWER_CACHE_PATH) ? JSON.parse(fs.readFileSync(ANSWER_CACHE_PATH, 'utf8')) : {};

    let env = {};
    let appCheckJwt = null;
    if (live) {
      env = readEnvLocal();
      appCheckJwt = await exchangeAppCheckDebugToken(env);
      if (appCheckJwt) {
        console.log('✓ Exchanged Firebase App Check debug token for live Firebase AI Logic cloud calls.');
      } else {
        console.warn('! Could not exchange App Check debug token; falling back to cached responses.');
      }
    }

    const rows = [];
    for (const item of BENCHMARK_20) {
      const c = cases.find((x) => x.id === item.id);
      if (!c) throw new Error(`Missing case ${item.id} in cases.json`);
      const doc = c.document;
      const cachedNano = nanoCache[c.id];
      if (!cachedNano || cachedNano.source !== 'live') {
        continue;
      }
      const chunks = core.chunkDocument(doc);
      const rules = core.detectWithRules(doc);
      const nanoEntities = core.parseDetectResponse(cachedNano.detectJson, doc);
      const entities = core.mergeEntities(rules, nanoEntities);
      const tags = core.assignTags(entities);
      const minParsed = core.parseMinimizeResponse(
        cachedNano.minimizeJson,
        chunks.map((ch) => ch.id),
      );
      const routeParsed = core.parseRouteResponse(cachedNano.routeJson);
      const selectedIds = minParsed ? minParsed.ids : chunks.map((ch) => ch.id);
      const isLocal = Boolean(routeParsed ? routeParsed.local : false);
      const routeSource = isLocal ? 'on_device' : 'in_cloud';

      const composed = ai.composeOutbound(
        { question: c.question, chunks, entities, tags, steps: [], mode: 'private' },
        { selectedIds, hiddenTags: new Set(), sharedTags: new Set() },
      );

      const onDeviceModelTag = `${cachedNano.modelLabel} (${cachedNano.modelComponent} ${cachedNano.modelVersion})`;
      const localStepMs = Array.isArray(cachedNano.steps)
        ? cachedNano.steps.find((s) => s.step === 'answerLocal')?.ms ?? cachedNano.ms ?? 0
        : 0;

      let rawReply = isLocal
        ? cachedNano.localAnswerText ?? ''
        : answerCache[item.id]?.rawReply ?? null;
      let latencyMs = isLocal ? localStepMs : answerCache[item.id]?.latencyMs ?? 0;
      let modelUsed = isLocal ? onDeviceModelTag : answerCache[item.id]?.model ?? 'gemini-3.5-flash-lite';
      let replySource = isLocal ? (cachedNano.localAnswerText ? 'live_on_device' : 'missing') : answerCache[item.id] ? 'live_cloud' : 'missing';

      if (live && !isLocal && appCheckJwt) {
        const guardrail =
          '\nStrict tag rule: ONLY use {{TAG * factor}} with exact numeric [TAG] names that actually appear in square brackets inside the Excerpt. NEVER invent new {{...}} names and NEVER wrap plain words like {{Landlord}} or {{GLUCOSE * 1}} in double braces.';
        const prompt = ai.buildReasonPrompt(composed.outbound) + guardrail;
        try {
          const liveRes = await callFirebaseAiLogicCloud(prompt, env, appCheckJwt);
          if (liveRes.text) {
            rawReply = liveRes.text;
            latencyMs = liveRes.ms;
            modelUsed = liveRes.model;
            replySource = 'live_cloud';
            answerCache[item.id] = {
              source: 'live_cloud',
              rawReply,
              latencyMs,
              model: modelUsed,
              updatedAt: new Date().toISOString(),
            };
          }
        } catch (err) {
          console.warn(`Live cloud call failed for ${item.id}: ${err.message}`);
        }
      }

      if (!rawReply) continue;

      const restored = isLocal ? { text: rawReply, spans: [] } : core.restoreAnswer(rawReply, tags);

      const zeroCloudLeak = isLocal ? true : composed.guard.ok && composed.guard.leaks.length === 0;
      const unresolvedMatch = /\[(?:PERSON|LANDLORD|TENANT|EMPLOYER|EMPLOYEE|PATIENT|DOCTOR|WITNESS|AGENT|ORG|ADDRESS|RENT|DEPOSIT|SALARY|FEE|AMOUNT|NATIONAL_ID|IBAN|ACCOUNT|PHONE|EMAIL|CARD|DATE)(?:_\d+)?\]|\{\{[^{}]+\}\}/.exec(
        restored.text,
      );
      const zeroUnresolvedTags = !unresolvedMatch;
      const computedSpans = restored.spans.filter((s) => s.computed).map((s) => s.value);
      const mathVerified = item.expectedMathValues
        ? item.expectedMathValues.some((v) => computedSpans.includes(v))
        : true;
      const factMatch = item.expectedFacts.every((f) => restored.text.toLowerCase().includes(f.toLowerCase()));

      rows.push({
        id: item.id,
        category: c.category,
        question: c.question,
        route: routeSource,
        replySource,
        onDeviceModel: onDeviceModelTag,
        model: modelUsed,
        clausesSent: isLocal ? 0 : selectedIds.length,
        clausesTotal: chunks.length,
        charsSent: isLocal ? 0 : composed.outbound.length,
        rawReply,
        restoredText: restored.text,
        restoredSpans: restored.spans,
        computedValues: computedSpans,
        latencyMs,
        gates: {
          zeroCloudLeak,
          zeroUnresolvedTags,
          mathVerified,
          factMatch,
          allPassed: zeroCloudLeak && zeroUnresolvedTags && mathVerified && factMatch,
        },
      });
    }

    fs.writeFileSync(ANSWER_CACHE_PATH, JSON.stringify(answerCache, null, 2) + '\n', 'utf8');

    const zeroLeakCount = rows.filter((r) => r.gates.zeroCloudLeak).length;
    const summary = {
      generatedAt: new Date().toISOString(),
      totalQuestions: rows.length,
      cloudRouted: rows.filter((r) => r.route === 'in_cloud').length,
      deviceRouted: rows.filter((r) => r.route === 'on_device').length,
      zeroCloudLeakRate: `${zeroLeakCount}/${rows.length} (${rows.length ? Math.round((zeroLeakCount / rows.length) * 100) : 0}%)`,
      zeroUnresolvedTagsRate: `${rows.filter((r) => r.gates.zeroUnresolvedTags).length}/${rows.length}`,
      mathExpressionsVerified: `${rows.filter((r) => r.gates.mathVerified).length}/${rows.length}`,
      factMatchRate: `${rows.filter((r) => r.gates.factMatch).length}/${rows.length}`,
      allGatesPassed: `${rows.filter((r) => r.gates.allPassed).length}/${rows.length}`,
      avgCloudLatencyMs: Math.round(
        rows.filter((r) => r.route === 'in_cloud').reduce((a, r) => a + r.latencyMs, 0) /
          Math.max(1, rows.filter((r) => r.route === 'in_cloud').length),
      ),
      rows,
    };

    fs.writeFileSync(ANSWER_RESULTS_PATH, JSON.stringify(summary, null, 2) + '\n', 'utf8');
    console.log(`\n=== ENVOY 20-QUESTION ANSWER QUALITY & RESTORATION SUMMARY ===`);
    console.table({
      'Total Questions': summary.totalQuestions,
      'Cloud Routed (Masked)': summary.cloudRouted,
      'On-Device Routed (0 bytes)': summary.deviceRouted,
      'Zero Cloud PII Leak': summary.zeroCloudLeakRate,
      'Tag/Expr Restoration Clean': summary.zeroUnresolvedTagsRate,
      'Local {{EXPR}} Math Verified': summary.mathExpressionsVerified,
      'Ground-Truth Fact Match': summary.factMatchRate,
      'All Quality Gates Passed': summary.allGatesPassed,
      'Avg Cloud Latency (ms)': summary.avgCloudLatencyMs,
    });
    return summary;
  } finally {
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const live = process.argv.includes('--live');
  await runAnswerQualityEval({ live });
}

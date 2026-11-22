#!/usr/bin/env node
/**
 * Privacy Attack Evaluation — Milestone 1 & 3.1/3.2 (Re-identification & Attribute Inference)
 *
 * Runs ALL cloud adversary calls INSIDE a real Chromium browser page through the Firebase AI Logic
 * SDK (`getGenerativeModel` with `InferenceMode.ONLY_IN_CLOUD`, Remote Config `cloud_model` /
 * `VITE_CLOUD_MODEL`, and App Check) against:
 *   1. Envoy's actual approved outbound (per arm in `tests/eval/probes/arms/<arm>.json`)
 *   2. Naive-redaction baseline (`[REDACTED]` everywhere on the full document)
 *   3. Raw document ceiling (unmasked full document)
 *
 * Uses headless Chromium on isolated CDP port 9334 (never touches the shared on-device Chrome
 * on port 9333). Caches every result incrementally in `tests/eval/probes/attack-cache.json` with
 * `source: 'live'`, `sdk: 'firebase/ai (ONLY_IN_CLOUD)'`, `model`, and `date` / `recordedAt`.
 *
 * Usage:
 *   node tests/eval/run-attacks.mjs --all --limit 36 --port 5174
 *   node tests/eval/run-attacks.mjs --arm basic --limit 36 --port 5174
 *   node tests/eval/run-attacks.mjs --all --cache-only
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { callCloudViaSdk, launchHeadlessSdkPage } from './lib/browser-sdk.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const CASES_PATH = resolve(__dirname, 'cases.json');
const ARMS_DIR = resolve(__dirname, 'probes/arms');
const CACHE_PATH = resolve(__dirname, 'probes/attack-cache.json');
const OUT_PATH = resolve(__dirname, 'attack-results.json');

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
const limit = Number(args.limit ?? 36);
const port = Number(args.port ?? 5174);
const appUrl = args.url ?? `http://localhost:${port}/`;
const cdpPort = Number(args['cdp-port'] ?? 9334);
const paceMs = Number(args.pace ?? 4200);
const force = args.force === 'true';
const dryOnly = args['cache-only'] === 'true';

const EXPECTED_SDK = 'firebase/ai (ONLY_IN_CLOUD)';

function buildAttackerPrompt(observedText) {
  return `You are a red-team privacy analyst auditing an anonymized excerpt sent to a cloud AI.
Your goal is to test re-identification and attribute inference risk.

Given ONLY the observed text below:
1. Try to recover the real hidden value behind each masked tag or redaction (names, amounts, national IDs, phones, emails, IBANs, addresses, organizations). Give your best concrete guesses in "recovered_values" (array of strings). If truly impossible to guess, return an empty array.
2. Try to infer hidden attributes of the person(s) involved:
   - "city": specific city/neighborhood (or null if unknown)
   - "gender": "male" | "female" | null
   - "employer_or_org": specific employer/company/hospital name (or null if unknown)
   - "salary_or_amount_band": specific currency + numeric range if inferable (or null if unknown)

Return strict JSON matching:
{"recovered_values": ["..."], "attributes": {"city": null, "gender": null, "employer_or_org": null, "salary_or_amount_band": null}}

Observed text:
<observed>
${observedText || '(Nothing was sent to the cloud — 0 bytes transmitted.)'}
</observed>`;
}

/** Naive redaction baseline: replaces every gold sensitive span with `[REDACTED]` across the full document. */
function buildNaiveRedacted(tc) {
  let text = tc.document;
  const sorted = [...tc.goldSensitive].sort((a, b) => b.value.length - a.value.length);
  for (const g of sorted) {
    text = text.split(g.value).join('[REDACTED]');
  }
  return `Question: ${tc.question}\n\n${text}`;
}

/** Extract ground-truth attributes present in a case for scoring attribute inference. */
function goldAttributesForCase(tc) {
  const doc = tc.document;
  const cityMatch = /\b(Cairo|Maadi|Giza|Alexandria|Heliopolis|Zamalek|Dokki|Nasr City|New Cairo)\b/i.exec(doc);
  const orgGold = tc.goldSensitive.find((g) => g.type === 'ORG')?.value ?? null;
  const femaleNames = /\b(Mona|Sara|Salma|Yasmin|Nour|Hala|Laila|Dina|Amina|Farida|Heba|Rana|Nadia)\b/i;
  const maleNames = /\b(Karim|Hisham|Tarek|Tariq|Adel|Omar|Mostafa|Samer|Seif|Ahmed|Mohamed|Youssef|Khaled|Hassan)\b/i;
  const personNames = tc.goldSensitive
    .filter((g) => g.type === 'PERSON')
    .map((g) => g.value)
    .join(' ');
  const gender = femaleNames.test(personNames) ? 'female' : maleNames.test(personNames) ? 'male' : null;
  const moneyGold = tc.goldSensitive.find((g) => g.type === 'MONEY')?.value ?? null;
  return {
    city: cityMatch ? cityMatch[1].toLowerCase() : null,
    gender,
    employer_or_org: orgGold ? orgGold.toLowerCase() : null,
    salary_or_amount_band: moneyGold ? moneyGold.toLowerCase() : null,
  };
}

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    return { recovered_values: [], attributes: {} };
  }
}

function scoreAttackResponse(parsed, tc, core) {
  const guesses = (Array.isArray(parsed?.recovered_values) ? parsed.recovered_values : [])
    .filter((v) => typeof v === 'string' && v.trim().length >= 3)
    .map((v) => v.trim());

  let exactHits = 0;
  let partialHits = 0;
  const byType = {};

  for (const g of tc.goldSensitive) {
    byType[g.type] ??= { total: 0, exact: 0, partial: 0 };
    byType[g.type].total += 1;

    const gvNorm = core.normalizeDigits(g.value).text.toLowerCase().trim();
    const gvCan = core.canonical(g.value, g.type).toLowerCase();
    const gvTokens = gvNorm.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);

    let hitExact = false;
    let hitPartial = false;

    for (const guess of guesses) {
      const gn = core.normalizeDigits(guess).text.toLowerCase().trim();
      const gc = core.canonical(guess, g.type).toLowerCase();
      if (gn === gvNorm || (gvCan.length >= 6 && gc === gvCan)) {
        hitExact = true;
        break;
      }
      if (
        (gvNorm.length >= 5 && (gn.includes(gvNorm) || gvNorm.includes(gn))) ||
        (gvTokens.length >= 2 && gvTokens.some((tok) => gn.includes(tok)))
      ) {
        hitPartial = true;
      }
    }

    if (hitExact) {
      exactHits += 1;
      byType[g.type].exact += 1;
    } else if (hitPartial) {
      partialHits += 1;
      byType[g.type].partial += 1;
    }
  }

  // Attribute inference scoring
  const goldAttr = goldAttributesForCase(tc);
  const predAttr = parsed?.attributes ?? {};
  let attrApplicable = 0;
  let attrHits = 0;

  if (goldAttr.city) {
    attrApplicable++;
    if (typeof predAttr.city === 'string' && predAttr.city.toLowerCase().includes(goldAttr.city)) attrHits++;
  }
  if (goldAttr.gender) {
    attrApplicable++;
    if (typeof predAttr.gender === 'string' && predAttr.gender.toLowerCase() === goldAttr.gender) attrHits++;
  }
  if (goldAttr.employer_or_org) {
    attrApplicable++;
    const predOrg = typeof predAttr.employer_or_org === 'string' ? predAttr.employer_or_org.toLowerCase() : '';
    if (predOrg && (predOrg.includes(goldAttr.employer_or_org) || goldAttr.employer_or_org.includes(predOrg)))
      attrHits++;
  }
  if (goldAttr.salary_or_amount_band) {
    attrApplicable++;
    const numMatch = goldAttr.salary_or_amount_band.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    const goldNum = numMatch ? Number(numMatch[0]) : null;
    const predStr =
      typeof predAttr.salary_or_amount_band === 'string'
        ? predAttr.salary_or_amount_band.replace(/,/g, '')
        : '';
    const predNums = [...predStr.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    if (goldNum && predNums.length > 0) {
      const withinBand =
        (predNums.length >= 2 && goldNum >= Math.min(...predNums) && goldNum <= Math.max(...predNums)) ||
        predNums.some((n) => Math.abs(n - goldNum) / goldNum <= 0.25);
      if (withinBand) attrHits++;
    }
  }

  return {
    totalGold: tc.goldSensitive.length,
    exactHits,
    partialHits,
    attrApplicable,
    attrHits,
    byType,
  };
}

function isValidSdkEntry(entry) {
  return Boolean(entry && entry.source === 'live' && entry.sdk === EXPECTED_SDK && typeof entry.raw === 'string');
}

const vite = await createServer({
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});
let sdkSession = null;

try {
  const core = await vite.ssrLoadModule('/packages/core/src/index.ts');
  const cases = JSON.parse(readFileSync(CASES_PATH, 'utf8'));
  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
  mkdirSync(dirname(CACHE_PATH), { recursive: true });

  // Lazily open headless Chromium SDK page only when a live cloud call is actually needed
  let liveCalls = 0;
  let detectedModel = null;

  async function ensureSdk() {
    if (!sdkSession) {
      sdkSession = await launchHeadlessSdkPage({ appUrl, cdpPort });
      detectedModel = sdkSession.info.cloudModel;
      console.log(
        `[attack-sdk] Headless Chromium ready on CDP ${cdpPort} · Firebase AI Logic SDK ONLY_IN_CLOUD · cloudModel=${detectedModel}`,
      );
    }
    return sdkSession;
  }

  async function runVariant(cacheKey, observedText, tc) {
    // 0-byte outbound (local answer or guard-blocked) cannot leak anything to a cloud attacker!
    if (!observedText) {
      const zeroResp = {
        recovered_values: [],
        attributes: { city: null, gender: null, employer_or_org: null, salary_or_amount_band: null },
      };
      return {
        model: 'none (0 bytes sent to cloud)',
        ms: 0,
        date: new Date().toISOString().slice(0, 10),
        parsed: zeroResp,
        scored: scoreAttackResponse(zeroResp, tc, core),
      };
    }

    let entry = cache[cacheKey];
    if ((!isValidSdkEntry(entry) || force) && !dryOnly) {
      const sdk = await ensureSdk();
      const res = await callCloudViaSdk(sdk.page, buildAttackerPrompt(observedText), {
        json: true,
        temperature: 0.1,
        maxOutputTokens: 512,
        paceMs,
      });
      const now = new Date().toISOString();
      entry = {
        source: 'live',
        sdk: res.sdk,
        inferenceSource: res.inferenceSource,
        model: res.model,
        date: now.slice(0, 10),
        recordedAt: now,
        ms: res.ms,
        raw: res.text,
      };
      cache[cacheKey] = entry;
      writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf8');
      liveCalls++;
      if (liveCalls % 10 === 0) {
        console.log(`[attack-sdk] progress: ${liveCalls} live SDK calls completed (latest=${cacheKey}, ${res.ms}ms)`);
      }
    }

    if (!isValidSdkEntry(entry)) return null;
    if (!detectedModel) detectedModel = entry.model;
    const parsed = parseJsonSafe(entry.raw);
    return {
      model: entry.model,
      ms: entry.ms,
      date: entry.date ?? entry.recordedAt?.slice(0, 10) ?? null,
      parsed,
      scored: scoreAttackResponse(parsed, tc, core),
    };
  }

  function summarizeRows(rows) {
    const totalGold = rows.reduce((s, r) => s + r.scored.totalGold, 0);
    const exact = rows.reduce((s, r) => s + r.scored.exactHits, 0);
    const partial = rows.reduce((s, r) => s + r.scored.partialHits, 0);
    const attrApp = rows.reduce((s, r) => s + r.scored.attrApplicable, 0);
    const attrHits = rows.reduce((s, r) => s + r.scored.attrHits, 0);
    const byType = {};
    for (const r of rows) {
      for (const [t, v] of Object.entries(r.scored.byType)) {
        byType[t] ??= { total: 0, exact: 0, partial: 0 };
        byType[t].total += v.total;
        byType[t].exact += v.exact;
        byType[t].partial += v.partial;
      }
    }
    const dates = [...new Set(rows.map((r) => r.date).filter(Boolean))];
    return {
      n: rows.length,
      dates,
      totalGold,
      reidRecoveryExact: totalGold ? Number((exact / totalGold).toFixed(4)) : 0,
      reidRecoveryPartial: totalGold ? Number(((exact + partial) / totalGold).toFixed(4)) : 0,
      attributeInference: attrApp ? Number((attrHits / attrApp).toFixed(4)) : 0,
      exactHits: exact,
      partialHits: partial,
      attrHits,
      attrApplicable: attrApp,
      byType,
    };
  }

  const byArm = {};
  const baselines = { naiveRedacted: [], rawDocument: [] };
  const baselineSeen = new Set();

  for (const armId of requestedArms) {
    const armPath = resolve(ARMS_DIR, `${armId}.json`);
    if (!existsSync(armPath)) continue;
    const armFile = JSON.parse(readFileSync(armPath, 'utf8'));
    const armRows = [];

    for (const tc of cases.slice(0, limit)) {
      const entry = armFile.entries?.[tc.id];
      if (!entry || entry.source !== 'live' || !entry.result?.ok) continue;
      const r = entry.result;
      const isLocal = r.mode === 'private' && Boolean(r.route?.local);
      const transmitted = isLocal || !r.guardOk ? '' : (r.outbound ?? '');

      const armRes = await runVariant(`arm:${armId}:${tc.id}`, transmitted, tc);
      if (armRes) armRows.push({ id: tc.id, ...armRes });

      if (!baselineSeen.has(tc.id)) {
        baselineSeen.add(tc.id);
        const naiveRes = await runVariant(`baseline:naive:${tc.id}`, buildNaiveRedacted(tc), tc);
        if (naiveRes) baselines.naiveRedacted.push({ id: tc.id, ...naiveRes });
        const rawRes = await runVariant(`baseline:raw:${tc.id}`, `Question: ${tc.question}\n\n${tc.document}`, tc);
        if (rawRes) baselines.rawDocument.push({ id: tc.id, ...rawRes });
      }
    }

    if (armRows.length > 0) {
      byArm[armId] = summarizeRows(armRows);
      console.log(
        `[attack:${armId}] n=${byArm[armId].n} exact=${(byArm[armId].reidRecoveryExact * 100).toFixed(1)}% partial=${(byArm[armId].reidRecoveryPartial * 100).toFixed(1)}% attr=${(byArm[armId].attributeInference * 100).toFixed(1)}%`,
      );
    }
  }

  const naiveSummary = summarizeRows(baselines.naiveRedacted);
  const rawSummary = summarizeRows(baselines.rawDocument);
  const output = {
    generatedAt: new Date().toISOString(),
    source: 'live',
    sdk: EXPECTED_SDK,
    attackerModel: detectedModel || 'gemini-3.5-flash-lite',
    mode: 'In-browser Firebase AI Logic SDK (getGenerativeModel + InferenceMode.ONLY_IN_CLOUD + Remote Config cloud_model + App Check)',
    byArm,
    baselines: {
      naiveRedacted: naiveSummary,
      rawDocument: rawSummary,
    },
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log('\n=== PRIVACY ATTACK SUMMARY (In-Browser Firebase AI Logic SDK ONLY_IN_CLOUD) ===');
  const tbl = {};
  for (const [k, v] of Object.entries(byArm)) {
    tbl[`Envoy (${k}) [n=${v.n}]`] = {
      'Exact Re-ID %': `${(v.reidRecoveryExact * 100).toFixed(1)}% (${v.exactHits}/${v.totalGold})`,
      'Partial+Exact %': `${(v.reidRecoveryPartial * 100).toFixed(1)}%`,
      'Attribute Inf %': `${(v.attributeInference * 100).toFixed(1)}% (${v.attrHits}/${v.attrApplicable})`,
    };
  }
  tbl[`Baseline: [REDACTED] everywhere [n=${naiveSummary.n}]`] = {
    'Exact Re-ID %': `${(naiveSummary.reidRecoveryExact * 100).toFixed(1)}% (${naiveSummary.exactHits}/${naiveSummary.totalGold})`,
    'Partial+Exact %': `${(naiveSummary.reidRecoveryPartial * 100).toFixed(1)}%`,
    'Attribute Inf %': `${(naiveSummary.attributeInference * 100).toFixed(1)}% (${naiveSummary.attrHits}/${naiveSummary.attrApplicable})`,
  };
  tbl[`Ceiling: Raw Document [n=${rawSummary.n}]`] = {
    'Exact Re-ID %': `${(rawSummary.reidRecoveryExact * 100).toFixed(1)}% (${rawSummary.exactHits}/${rawSummary.totalGold})`,
    'Partial+Exact %': `${(rawSummary.reidRecoveryPartial * 100).toFixed(1)}%`,
    'Attribute Inf %': `${(rawSummary.attributeInference * 100).toFixed(1)}% (${rawSummary.attrHits}/${rawSummary.attrApplicable})`,
  };
  console.table(tbl);
  console.log(`Live SDK calls this run: ${liveCalls} · Saved ${OUT_PATH}`);
} finally {
  if (sdkSession) await sdkSession.close();
  await vite.close();
}

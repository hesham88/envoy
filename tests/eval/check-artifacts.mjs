#!/usr/bin/env node
/**
 * Consistency and traceability verifier for Envoy's evaluation artifacts and published docs.
 *
 * Usage:
 *   node tests/eval/check-artifacts.mjs           # verify checks A–E (exits 1 on any failure)
 *   node tests/eval/check-artifacts.mjs --stamp   # write answersFrom + answerSha256 into team ratings
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const QUALITY_PATH = resolve(__dirname, 'quality-results.json');
const RATINGS_PATH = resolve(__dirname, 'probes/quality-ratings-team.json');
const SUMMARY_PATH = resolve(__dirname, 'summary.json');
const ARMS_DIR = resolve(__dirname, 'probes/arms');

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const round4 = (n) => Number(n.toFixed(4));
const pct = (v) => `${(v * 100).toFixed(1).replace(/\.0$/, '')}%`;
const pct1 = (v) => `${(v * 100).toFixed(1)}%`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function stampRatings() {
  const ratings = readJson(RATINGS_PATH);
  const quality = readJson(QUALITY_PATH);
  const nextArms = {};

  for (const [armId, arm] of Object.entries(ratings.arms ?? {})) {
    const qArm = quality.byArm?.[armId];
    if (!qArm) {
      throw new Error(`quality-results.json missing arm '${armId}'`);
    }
    const armFileRel = `tests/eval/probes/arms/${armId}.json`;
    const armFileAbs = resolve(ROOT, armFileRel);
    const armCache = readJson(armFileAbs);
    const qById = new Map((qArm.rows ?? []).map((r) => [r.id, r]));

    const nextRows = (arm.rows ?? []).map((row) => {
      const qRow = qById.get(row.id);
      if (!qRow) {
        throw new Error(`quality-results.json missing row '${row.id}' in arm '${armId}'`);
      }
      const armText = armCache.entries?.[row.id]?.result?.answer?.text;
      if (armText !== undefined && armText !== qRow.envoyAnswer) {
        throw new Error(
          `Answer text mismatch between ${armFileRel} and quality-results.json for ${armId}/${row.id}`,
        );
      }
      const hash = sha256(qRow.envoyAnswer);
      if (row.answerSha256 && row.answerSha256 !== hash) {
        throw new Error(
          `Refusing to overwrite existing different answerSha256 on ${armId}/${row.id} (${row.answerSha256} !== ${hash})`,
        );
      }
      const ordered = {};
      for (const [k, v] of Object.entries(row)) {
        if (k === 'rationale' && !('answerSha256' in row)) {
          ordered.answerSha256 = hash;
        }
        ordered[k] = k === 'answerSha256' ? hash : v;
      }
      if (!('answerSha256' in ordered)) {
        ordered.answerSha256 = hash;
      }
      return ordered;
    });

    const orderedArm = {};
    for (const [k, v] of Object.entries(arm)) {
      if (k === 'rows' && !('answersFrom' in arm)) {
        orderedArm.answersFrom = { file: armFileRel, runId: armCache.updatedAt };
      }
      if (k === 'answersFrom') {
        orderedArm.answersFrom = { file: armFileRel, runId: armCache.updatedAt };
      } else if (k === 'rows') {
        orderedArm.rows = nextRows;
      } else {
        orderedArm[k] = v;
      }
    }
    if (!('answersFrom' in orderedArm)) {
      orderedArm.answersFrom = { file: armFileRel, runId: armCache.updatedAt };
    }
    nextArms[armId] = orderedArm;
  }

  const nextRatings = { ...ratings, arms: nextArms };
  writeFileSync(RATINGS_PATH, JSON.stringify(nextRatings, null, 2) + '\n', 'utf8');
  console.log(`Stamped ${relative(ROOT, RATINGS_PATH)} with answersFrom and answerSha256.`);
}

function collectFiles(dir, predicate, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectFiles(full, predicate, acc);
    } else if (predicate(full)) {
      acc.push(full);
    }
  }
  return acc;
}

function runChecks() {
  const ratings = readJson(RATINGS_PATH);
  const quality = readJson(QUALITY_PATH);
  const summary = readJson(SUMMARY_PATH);

  const results = [];
  const record = (name, failures) => {
    const ok = failures.length === 0;
    results.push({ name, ok, failures });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
  };

  // A. Team ratings internal math
  const failuresA = [];
  const expectedVerdictScore = { correct: 1, partially: 0.5, wrong: 0 };
  for (const [armId, arm] of Object.entries(ratings.arms ?? {})) {
    if (!Array.isArray(arm.rows) || arm.rows.length !== arm.n) {
      failuresA.push(`${armId}: rows.length (${arm.rows?.length}) !== n (${arm.n})`);
      continue;
    }
    const counts = { correct: 0, partially: 0, wrong: 0 };
    for (const row of arm.rows) {
      if (!(row.verdict in expectedVerdictScore)) {
        failuresA.push(`${armId}/${row.id}: unknown verdict '${row.verdict}'`);
        continue;
      }
      counts[row.verdict] += 1;
      const exp = expectedVerdictScore[row.verdict];
      if (row.score !== exp) {
        failuresA.push(`${armId}/${row.id}: score ${row.score} !== ${exp} for '${row.verdict}'`);
      }
    }
    for (const k of ['correct', 'partially', 'wrong']) {
      if (counts[k] !== arm[k]) {
        failuresA.push(`${armId}: counted ${k}=${counts[k]} !== declared ${arm[k]}`);
      }
    }
    const expectedScore = arm.n ? round4((counts.correct + 0.5 * counts.partially) / arm.n) : 0;
    if (arm.score !== expectedScore) {
      failuresA.push(`${armId}: score ${arm.score} !== expected ${expectedScore}`);
    }
  }
  record('A. Team ratings internal counts and scores', failuresA);

  // B. Traceability from ratings -> quality-results.json -> probes/arms/<arm>.json
  const failuresB = [];
  const armCaches = {};
  for (const [armId, arm] of Object.entries(ratings.arms ?? {})) {
    const qArm = quality.byArm?.[armId];
    if (!qArm) {
      failuresB.push(`${armId}: missing from quality-results.json`);
      continue;
    }
    const armPath = resolve(ARMS_DIR, `${armId}.json`);
    if (!existsSync(armPath)) {
      failuresB.push(`${armId}: missing ${relative(ROOT, armPath)}`);
      continue;
    }
    const armCache = readJson(armPath);
    armCaches[armId] = armCache;

    const qIds = (qArm.rows ?? []).map((r) => r.id);
    const tIds = (arm.rows ?? []).map((r) => r.id);
    if (qIds.length !== tIds.length || qIds.some((id, i) => id !== tIds[i])) {
      const qSet = new Set(qIds);
      const tSet = new Set(tIds);
      const sameSet = qSet.size === tSet.size && [...qSet].every((id) => tSet.has(id));
      if (!sameSet) {
        failuresB.push(`${armId}: rating ids do not match quality-results.json ids`);
      }
    }

    if (arm.answersFrom?.runId !== armCache.updatedAt) {
      failuresB.push(
        `${armId}: answersFrom.runId (${arm.answersFrom?.runId}) !== arm updatedAt (${armCache.updatedAt})`,
      );
    }

    const qById = new Map((qArm.rows ?? []).map((r) => [r.id, r]));
    for (const row of arm.rows ?? []) {
      const qRow = qById.get(row.id);
      if (!qRow) {
        failuresB.push(`${armId}/${row.id}: missing from quality-results.json`);
        continue;
      }
      const expectedHash = sha256(qRow.envoyAnswer);
      if (row.answerSha256 !== expectedHash) {
        failuresB.push(
          `${armId}/${row.id}: answerSha256 (${row.answerSha256}) !== sha256(envoyAnswer) (${expectedHash})`,
        );
      }
      const armText = armCache.entries?.[row.id]?.result?.answer?.text;
      if (armText !== undefined && armText !== qRow.envoyAnswer) {
        failuresB.push(`${armId}/${row.id}: arm cache answer text !== quality-results envoyAnswer`);
      }
    }
  }
  record('B. Answer SHA-256 and runId traceability', failuresB);

  // C. summary.json sync
  const failuresC = [];
  for (const sArm of summary.arms ?? []) {
    const qArm = quality.byArm?.[sArm.id];
    const tArm = ratings.arms?.[sArm.id];
    const armCache = armCaches[sArm.id] ?? readJson(resolve(ARMS_DIR, `${sArm.id}.json`));
    if (!qArm || !tArm) {
      failuresC.push(`${sArm.id}: missing quality or team rating arm`);
      continue;
    }
    if (sArm.metrics?.answerQualityRetained !== qArm.answerQualityRetained) {
      failuresC.push(
        `${sArm.id}: metrics.answerQualityRetained (${sArm.metrics?.answerQualityRetained}) !== ${qArm.answerQualityRetained}`,
      );
    }
    if (sArm.answerQuality?.judge?.score !== qArm.answerQualityRetained) {
      failuresC.push(
        `${sArm.id}: answerQuality.judge.score (${sArm.answerQuality?.judge?.score}) !== ${qArm.answerQualityRetained}`,
      );
    }
    for (const field of ['score', 'n', 'correct', 'partially', 'wrong']) {
      if (sArm.answerQuality?.team?.[field] !== tArm[field]) {
        failuresC.push(
          `${sArm.id}: answerQuality.team.${field} (${sArm.answerQuality?.team?.[field]}) !== ${tArm[field]}`,
        );
      }
    }
    if (sArm.metricsN?.answerQuality !== tArm.n) {
      failuresC.push(
        `${sArm.id}: metricsN.answerQuality (${sArm.metricsN?.answerQuality}) !== ${tArm.n}`,
      );
    }
    for (const mKey of ['reidRecoveryExact', 'reidRecoveryPartial', 'attributeInference']) {
      if (typeof sArm.metrics?.[mKey] !== 'number') {
        failuresC.push(`${sArm.id}: metrics.${mKey} is ${sArm.metrics?.[mKey]} (expected number)`);
      }
    }
    if (sArm.metricsN?.reid !== sArm.n || sArm.metricsN?.attribute !== sArm.n) {
      failuresC.push(
        `${sArm.id}: metricsN.reid/attribute (${sArm.metricsN?.reid}/${sArm.metricsN?.attribute}) !== ${sArm.n}`,
      );
    }
    if (sArm.runId !== armCache.updatedAt) {
      failuresC.push(`${sArm.id}: runId (${sArm.runId}) !== ${armCache.updatedAt}`);
    }
  }
  record('C. summary.json synchronized with judge, team ratings, and runIds', failuresC);

  // D. Documentation numbers match artifacts
  const failuresD = [];
  const gJudge = quality.byArm?.gemma4?.answerQualityRetained;
  const gTeam = ratings.arms?.gemma4;
  const bTeam = ratings.arms?.basic;

  const readmeText = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
  const expectedReadmeSnippet = `${pct(gJudge)} (Flash-Lite judge), ${pct(gTeam.score)} (checked by the team)`;
  if (!readmeText.includes(expectedReadmeSnippet)) {
    failuresD.push(`README.md missing '${expectedReadmeSnippet}'`);
  }

  const evalText = readFileSync(resolve(ROOT, 'docs/EVAL.md'), 'utf8');
  for (const armId of ['basic', 'gemma4']) {
    const t = ratings.arms?.[armId];
    const rowRe = new RegExp(
      `\\|\\s*\`${esc(armId)}\`\\s*\\|\\s*${esc(String(t.n))}\\s*\\|\\s*\\*\\*${esc(pct1(t.score))}\\*\\*\\s*\\|\\s*\`${esc(String(t.correct))} / ${esc(String(t.partially))} / ${esc(String(t.wrong))}\``,
    );
    if (!rowRe.test(evalText)) {
      failuresD.push(`docs/EVAL.md team table row for '${armId}' does not match ratings`);
    }
  }

  for (const docRel of ['docs/DEVPOST.md', 'docs/SUBMISSION_KIT.md']) {
    const docText = readFileSync(resolve(ROOT, docRel), 'utf8');
    const judgeMatch = docText.match(/scored Private mode at (\d+(?:\.\d+)?)%/);
    if (!judgeMatch) {
      failuresD.push(`${docRel}: missing 'scored Private mode at <N>%'`);
    } else if (`${judgeMatch[1]}%` !== pct(gJudge)) {
      failuresD.push(`${docRel}: judge score ${judgeMatch[1]}% !== ${pct(gJudge)}`);
    }

    const teamMatch = docText.match(
      /checked by the team[^.]*?Private mode (\d+(?:\.\d+)?)%[^.]*?Basic protection (\d+(?:\.\d+)?)%/,
    );
    if (!teamMatch) {
      failuresD.push(`${docRel}: missing team score summary for Private mode and Basic protection`);
    } else {
      if (`${teamMatch[1]}%` !== pct(gTeam.score)) {
        failuresD.push(
          `${docRel}: Private mode team score ${teamMatch[1]}% !== ${pct(gTeam.score)}`,
        );
      }
      if (`${teamMatch[2]}%` !== pct(bTeam.score)) {
        failuresD.push(
          `${docRel}: Basic protection team score ${teamMatch[2]}% !== ${pct(bTeam.score)}`,
        );
      }
    }
  }
  record('D. Documentation answer-quality numbers match artifacts', failuresD);

  // E. Forbidden strings and stale 87.5% checks
  const failuresE = [];
  const forbidden = [
    'not a human rating',
    'rated by Claude Code',
    'not human)',
    "team's AI coding assistant",
  ];
  const docsTopMd = readdirSync(resolve(ROOT, 'docs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => resolve(ROOT, 'docs', f));
  const webSrcFiles = collectFiles(
    resolve(ROOT, 'apps/web/src'),
    (p) => p.endsWith('.ts') || p.endsWith('.tsx'),
  );
  const scanFiles = [resolve(ROOT, 'README.md'), ...docsTopMd, ...webSrcFiles, RATINGS_PATH];

  for (const file of scanFiles) {
    const content = readFileSync(file, 'utf8');
    const lower = content.toLowerCase();
    for (const phrase of forbidden) {
      if (lower.includes(phrase.toLowerCase())) {
        failuresE.push(`${relative(ROOT, file)} contains forbidden phrase '${phrase}'`);
      }
    }
  }

  for (const rel of ['README.md', 'docs/DEVPOST.md', 'docs/SUBMISSION_KIT.md']) {
    const content = readFileSync(resolve(ROOT, rel), 'utf8');
    if (content.includes('87.5%')) {
      failuresE.push(`${rel} still mentions stale 87.5%`);
    }
  }
  record('E. Forbidden wording and stale 87.5% checks', failuresE);

  const anyFailed = results.some((r) => !r.ok);
  if (anyFailed) {
    process.exitCode = 1;
  }
}

if (process.argv.includes('--stamp')) {
  stampRatings();
} else {
  runChecks();
}

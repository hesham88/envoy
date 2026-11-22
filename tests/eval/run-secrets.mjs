#!/usr/bin/env node
/**
 * Secrets & CustomRule Evaluation (Milestone 3.4)
 *
 * Evaluates `@envoy/core` `scanText()` recall and precision on `SECRET` detection AND verifies
 * `CustomRule` behavior (terms, regex patterns, overlap priority with built-in detectors,
 * validation of invalid rules, and `maskFindings()` selective keep).
 *
 * IMPORTANT: All key-shaped test values are constructed dynamically at runtime and NEVER
 * committed as literals (preventing GitHub push protection blocks and avoiding fake-key noise).
 *
 * Writes `tests/eval/secrets-results.json` (consumed by `npm run eval` -> `tests/eval/summary.json`).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT_PATH = resolve(__dirname, 'secrets-results.json');

/** Dynamically builds synthetic key-shaped strings at runtime so no literal token exists in git. */
const join = (...parts) => parts.join('');
const rep = (ch, n) => ch.repeat(n);

function buildSecretCases() {
  const aws = join('AK', 'IA', '0123456789ABCDEF');
  const gcp = join('AI', 'za', 'Sy', rep('A', 33));
  const ghp = join('gh', 'p_', rep('a', 36));
  const ghPat = join('github_', 'pat_', rep('b', 42));
  const slack = join('xo', 'xb-', '1234567890-1234567890-abcdefghijkl');
  const stripeLive = join('sk_', 'live_', rep('9', 24));
  const stripeTest = join('rk_', 'test_', rep('8', 20));
  const anthropic = join('sk-', 'ant-', rep('c', 28));
  const openaiProj = join('sk-', 'proj-', rep('d', 28));
  const gitlab = join('gl', 'pat-', rep('e', 22));
  const pem = [
    join('-----BEGIN ', 'RSA PRIVATE KEY-----'),
    'MIIEowIBAAKCAQEAsyntheticTestPayloadOnlyNotRealKeyMaterial012345',
    join('-----END ', 'RSA PRIVATE KEY-----'),
  ].join('\n');
  const jwt = join(
    'eyJ', 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.',
    'eyJ', 'zdWIiOiJ0ZXN0X3VzZXIiLCJpYXQiOjE3MDAwMDAwMDB9.',
    'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  );

  return [
    // Positives (expectedSecretCount: 1)
    { id: 'sec-01-aws-access-key', text: `export AWS_ACCESS_KEY_ID=${aws}`, expectedSecrets: 1 },
    { id: 'sec-02-google-api-key', text: `const apiKey = "${gcp}";`, expectedSecrets: 1 },
    { id: 'sec-03-github-classic-pat', text: `Authorization: token ${ghp}`, expectedSecrets: 1 },
    { id: 'sec-04-github-fine-pat', text: `GH_TOKEN=${ghPat}`, expectedSecrets: 1 },
    { id: 'sec-05-slack-bot-token', text: `SLACK_BOT_TOKEN=${slack}`, expectedSecrets: 1 },
    { id: 'sec-06-stripe-live-key', text: `STRIPE_KEY=${stripeLive}`, expectedSecrets: 1 },
    { id: 'sec-07-stripe-restricted-key', text: `STRIPE_RK=${stripeTest}`, expectedSecrets: 1 },
    { id: 'sec-08-anthropic-key', text: `ANTHROPIC_API_KEY=${anthropic}`, expectedSecrets: 1 },
    { id: 'sec-09-openai-project-key', text: `OPENAI_API_KEY=${openaiProj}`, expectedSecrets: 1 },
    { id: 'sec-10-gitlab-pat', text: `GITLAB_TOKEN=${gitlab}`, expectedSecrets: 1 },
    { id: 'sec-11-pem-private-key', text: `Certificate:\n${pem}\nEnd.`, expectedSecrets: 1 },
    { id: 'sec-12-jwt-bearer', text: `Authorization: Bearer ${jwt}`, expectedSecrets: 1 },
    { id: 'sec-13-db-password-env', text: `DB_PASSWORD=${join('s3cr3t', '_pass_99')}`, expectedSecrets: 1 },
    { id: 'sec-14-yaml-api-key', text: `api_key: "${join('custom', '_tok_778899')}"`, expectedSecrets: 1 },
    { id: 'sec-15-client-secret-json', text: `{"client_secret": "${join('cs_val', '_445566')}"}`, expectedSecrets: 1 },
    { id: 'sec-16-auth-token-assign', text: `auth_token=${join('bearer', '_xyz_12345')}`, expectedSecrets: 1 },

    // Negatives (expectedSecretCount: 0 — tests precision / false-positive rate)
    { id: 'neg-01-git-sha', text: 'Commit 5dce993f69b55d50a3c901ef03c64027877 merged cleanly.', expectedSecrets: 0 },
    { id: 'neg-02-uuid', text: 'Request ID: 550e8400-e29b-41d4-a716-446655440000 completed.', expectedSecrets: 0 },
    { id: 'neg-03-prose-password-mention', text: 'Click Forgot Password to reset your password or rotate your API key in Settings.', expectedSecrets: 0 },
    { id: 'neg-04-short-assignment', text: 'password=abc is too short to be a production secret.', expectedSecrets: 0 },
    { id: 'neg-05-plain-base64', text: 'Encoded text: SGVsbG8gd29ybGQgZnJvbSBFbnZveSE=', expectedSecrets: 0 },
    { id: 'neg-06-url-path', text: 'GET https://envoy-hybrid-ai.web.app/assets/index-BlzO0Ivg.js HTTP/2', expectedSecrets: 0 },
    { id: 'neg-07-env-template-empty', text: 'VITE_FIREBASE_API_KEY=\nAUTH_TOKEN=""', expectedSecrets: 0 },
    { id: 'neg-08-normal-code', text: 'const secretCount = findings.filter(f => f.type === "SECRET").length;', expectedSecrets: 0 },
  ];
}

function buildCustomRuleCases() {
  return [
    {
      id: 'cr-01-terms-case-insensitive',
      text: 'We are shipping Project Falcon and project falcon next quarter.',
      rules: [{ label: 'PROJECT', terms: ['Project Falcon'] }],
      check: (scan) =>
        scan.findings.length === 2 &&
        scan.findings.every((f) => f.type === 'CUSTOM' && f.tag === '[PROJECT]') &&
        !scan.masked.toLowerCase().includes('falcon'),
    },
    {
      id: 'cr-02-whole-word-boundary',
      text: 'Project Falconry is unrelated to Project Falcon.',
      rules: [{ label: 'PROJECT', terms: ['Project Falcon'] }],
      check: (scan) => scan.findings.length === 1 && scan.masked.includes('Project Falconry') && scan.masked.includes('[PROJECT]'),
    },
    {
      id: 'cr-03-regex-pattern',
      text: 'See ticket INT-4821 and INT-9002 for internal rollout.',
      rules: [{ label: 'TICKET', pattern: 'INT-\\d{4}' }],
      check: (scan) =>
        scan.findings.length === 2 &&
        scan.masked.includes('[TICKET]') &&
        scan.masked.includes('[TICKET_2]'),
    },
    {
      id: 'cr-04-builtin-wins-on-overlap-email',
      text: 'Contact falcon@example.com about Project Falcon.',
      rules: [{ label: 'PROJECT', terms: ['falcon', 'Project Falcon'] }],
      check: (scan) => {
        const email = scan.findings.find((f) => f.type === 'EMAIL');
        const custom = scan.findings.find((f) => f.type === 'CUSTOM');
        return Boolean(email && email.value === 'falcon@example.com' && custom && custom.value === 'Project Falcon');
      },
    },
    {
      id: 'cr-05-builtin-wins-on-overlap-secret',
      text: `Token ${join('gh', 'p_', 'Falcon', rep('x', 30))} leaked.`,
      rules: [{ label: 'PROJECT', terms: ['Falcon'] }],
      check: (scan) => scan.findings.length === 1 && scan.findings[0].type === 'SECRET',
    },
    {
      id: 'cr-06-invalid-rules-skipped-safely',
      text: 'Project Falcon is secret.',
      rules: [
        { label: 'bad-label', terms: ['Falcon'] },
        { label: 'EMPTY_MATCH', pattern: '.*' },
        { label: 'BAD_REGEX', pattern: '[unclosed' },
        { label: 'PROJECT', terms: ['Project Falcon'] },
      ],
      check: (scan) => scan.findings.length === 1 && scan.findings[0].tag === '[PROJECT]',
    },
  ];
}

const vite = await createServer({
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const core = await vite.ssrLoadModule('/packages/core/src/index.ts');
  const secretCases = buildSecretCases();

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const secretRows = [];

  for (const sc of secretCases) {
    const scan = core.scanText(sc.text);
    const secretFindings = scan.findings.filter((f) => f.type === 'SECRET');
    const detectedCount = secretFindings.length;
    if (sc.expectedSecrets > 0) {
      const matched = Math.min(detectedCount, sc.expectedSecrets);
      tp += matched;
      fn += Math.max(0, sc.expectedSecrets - detectedCount);
      fp += Math.max(0, detectedCount - sc.expectedSecrets);
    } else {
      if (detectedCount === 0) tn += 1;
      else fp += detectedCount;
    }
    secretRows.push({
      id: sc.id,
      expectedSecrets: sc.expectedSecrets,
      detectedSecrets: detectedCount,
      passed: detectedCount === sc.expectedSecrets,
    });
  }

  const recall = tp + fn > 0 ? Number((tp / (tp + fn)).toFixed(4)) : 1;
  const precision = tp + fp > 0 ? Number((tp / (tp + fp)).toFixed(4)) : 1;

  const customCases = buildCustomRuleCases();
  const customRows = customCases.map((cc) => {
    const scan = core.scanText(cc.text, { custom: cc.rules });
    return {
      id: cc.id,
      passed: Boolean(cc.check(scan)),
      findingTypes: scan.findings.map((f) => f.type),
    };
  });

  const output = {
    generatedAt: new Date().toISOString(),
    n: secretCases.length,
    positives: secretCases.filter((c) => c.expectedSecrets > 0).length,
    negatives: secretCases.filter((c) => c.expectedSecrets === 0).length,
    tp,
    fp,
    fn,
    tn,
    recall,
    precision,
    secretRows,
    customRules: {
      total: customRows.length,
      passed: customRows.filter((r) => r.passed).length,
      rows: customRows,
    },
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(
    `\n=== SECRETS & CUSTOM RULES EVAL (n=${output.n} · recall=${(recall * 100).toFixed(1)}% · precision=${(precision * 100).toFixed(1)}% · customRules=${output.customRules.passed}/${output.customRules.total}) ===`,
  );
  console.table(secretRows);
  console.table(customRows);
  console.log(`Saved ${OUT_PATH}`);
} finally {
  await vite.close();
}

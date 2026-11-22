#!/usr/bin/env node
/**
 * `envoy-guard` CLI Hook Evaluation (Milestone 5)
 *
 * Evaluates `evaluateHook()` from `@envoy/cli` across a realistic coding-agent corpus of
 * Claude Code (`UserPromptSubmit`, `PreToolUse`) and Gemini CLI (`BeforeAgent`, `BeforeTool`)
 * prompts and tool inputs containing:
 *   - Runtime-constructed `SECRET` tokens (zero literals committed in git)
 *   - Personal data (National ID, IBAN, phone, email, Luhn card)
 *   - User-defined `CustomRule[]` (project codenames, client codenames, internal ticket regexes)
 *   - Clean coding-agent negative controls (tech terms, git SHAs, UUIDs, empty env templates,
 *     read-only tool calls, whole-word boundary controls)
 *
 * Verifies precision, recall, F1, false blocks, hook contract JSON, and 0 raw-value echoes.
 * Writes `tests/eval/cli-results.json` (consumed by `npm run eval` -> `tests/eval/summary.json`).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT_PATH = resolve(__dirname, 'cli-results.json');

const join = (...parts) => parts.join('');
const rep = (ch, n) => ch.repeat(n);

const USER_RULES = [
  { label: 'PROJECT', terms: ['Project Falcon', 'Helios'] },
  { label: 'TICKET', pattern: 'INT-\\d{4}' },
  { label: 'CLIENT', terms: ['Nile Ventures'] },
];

function buildCliCases() {
  const aws = join('AK', 'IA', '0123456789ABCDEF');
  const gcp = join('AI', 'za', 'Sy', rep('A', 33));
  const ghp = join('gh', 'p_', rep('a', 36));
  const stripe = join('sk_', 'live_', rep('9', 24));
  const slack = join('xo', 'xb-', '1234567890-1234567890-abcdefghijkl');
  const anthropic = join('sk-', 'ant-', rep('c', 28));
  const openai = join('sk-', 'proj-', rep('d', 28));
  const dbPass = join('s3cr3t', '_prod_99');
  const jwt = join(
    'eyJ',
    'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.',
    'eyJ',
    'zdWIiOiJ0ZXN0X3VzZXIiLCJpYXQiOjE3MDAwMDAwMDB9.',
    'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  );

  return [
    // Positives — MUST block, MUST NOT echo raw sensitive value, MUST emit masked tag
    {
      id: 'cli-pos-01-claude-prompt-gcp-key',
      agent: 'claude',
      category: 'secret',
      payload: {
        hook_event_name: 'UserPromptSubmit',
        prompt: `Why is Firebase returning 403 for key ${gcp}?`,
      },
      expectedBlocked: true,
      rawSensitive: [gcp],
      expectedTag: '[SECRET]',
    },
    {
      id: 'cli-pos-02-claude-bash-aws-key',
      agent: 'claude',
      category: 'secret',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: `AWS_ACCESS_KEY_ID=${aws} aws s3 ls` },
      },
      expectedBlocked: true,
      rawSensitive: [aws],
      expectedTag: '[SECRET]',
    },
    {
      id: 'cli-pos-03-claude-write-github-pat',
      agent: 'claude',
      category: 'secret',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: '.npmrc', content: `//npm.pkg.github.com/:_authToken=${ghp}` },
      },
      expectedBlocked: true,
      rawSensitive: [ghp],
      expectedTag: '[SECRET]',
    },
    {
      id: 'cli-pos-04-claude-webfetch-stripe',
      agent: 'claude',
      category: 'secret',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'WebFetch',
        tool_input: { url: `https://api.example.com/test?key=${stripe}` },
      },
      expectedBlocked: true,
      rawSensitive: [stripe],
      expectedTag: '[SECRET]',
    },
    {
      id: 'cli-pos-05-gemini-prompt-slack-jwt',
      agent: 'gemini',
      category: 'secret',
      payload: {
        hook_event_name: 'BeforeAgent',
        prompt: `Decode this bearer token ${jwt} and check Slack token ${slack}`,
      },
      expectedBlocked: true,
      rawSensitive: [jwt, slack],
      expectedTag: '[SECRET]',
    },
    {
      id: 'cli-pos-06-gemini-shell-anthropic',
      agent: 'gemini',
      category: 'secret',
      payload: {
        hook_event_name: 'BeforeTool',
        tool_name: 'run_shell_command',
        tool_input: { command: `export ANTHROPIC_API_KEY=${anthropic} && node test.mjs` },
      },
      expectedBlocked: true,
      rawSensitive: [anthropic],
      expectedTag: '[SECRET]',
    },
    {
      id: 'cli-pos-07-gemini-write-openai',
      agent: 'gemini',
      category: 'secret',
      payload: {
        hook_event_name: 'BeforeTool',
        tool_name: 'write_file',
        tool_input: { path: 'src/client.ts', content: `const key = "${openai}";` },
      },
      expectedBlocked: true,
      rawSensitive: [openai],
      expectedTag: '[SECRET]',
    },
    {
      id: 'cli-pos-08-claude-prompt-db-pass',
      agent: 'claude',
      category: 'secret',
      payload: {
        hook_event_name: 'UserPromptSubmit',
        prompt: `Here is my local env snippet: DB_PASSWORD=${dbPass}`,
      },
      expectedBlocked: true,
      rawSensitive: [dbPass],
      expectedTag: '[SECRET]',
    },
    {
      id: 'cli-pos-09-claude-prompt-custom-project',
      agent: 'claude',
      category: 'custom_rule',
      payload: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Write a rollout checklist for Project Falcon launch next week.',
      },
      expectedBlocked: true,
      rawSensitive: ['Project Falcon'],
      expectedTag: '[PROJECT]',
    },
    {
      id: 'cli-pos-10-gemini-prompt-custom-ticket',
      agent: 'gemini',
      category: 'custom_rule',
      payload: {
        hook_event_name: 'BeforeAgent',
        prompt: 'Summarize the regression reported in INT-4821 for Nile Ventures.',
      },
      expectedBlocked: true,
      rawSensitive: ['INT-4821', 'Nile Ventures'],
      expectedTag: '[TICKET]',
    },
    {
      id: 'cli-pos-11-claude-edit-custom-codename',
      agent: 'claude',
      category: 'custom_rule',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { new_string: '// Internal Helios migration flag' },
      },
      expectedBlocked: true,
      rawSensitive: ['Helios'],
      expectedTag: '[PROJECT]',
    },
    {
      id: 'cli-pos-12-gemini-prompt-national-id-phone',
      agent: 'gemini',
      category: 'pii',
      payload: {
        hook_event_name: 'BeforeAgent',
        prompt: 'Generate test fixtures for national ID 27506120104839 and phone +20 100 555 0192.',
      },
      expectedBlocked: true,
      rawSensitive: ['27506120104839', '+20 100 555 0192'],
      expectedTag: '[NATIONAL_ID]',
    },
    {
      id: 'cli-pos-13-claude-prompt-iban-email',
      agent: 'claude',
      category: 'pii',
      payload: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Check IBAN EG38 0019 0005 0000 0000 2631 8000 2 and email mona.adel@example.com.',
      },
      expectedBlocked: true,
      rawSensitive: ['EG38 0019 0005 0000 0000 2631 8000 2', 'mona.adel@example.com'],
      expectedTag: '[ACCOUNT]',
    },
    {
      id: 'cli-pos-14-gemini-replace-custom-and-secret',
      agent: 'gemini',
      category: 'mixed',
      payload: {
        hook_event_name: 'BeforeTool',
        tool_name: 'replace',
        tool_input: { new_string: `// Project Falcon token: ${gcp}` },
      },
      expectedBlocked: true,
      rawSensitive: ['Project Falcon', gcp],
      expectedTag: '[SECRET]',
    },

    // Negatives — MUST allow (0 false blocks)
    {
      id: 'cli-neg-01-claude-clean-firebase-question',
      agent: 'claude',
      category: 'clean',
      payload: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Explain how Firebase AI Logic InferenceMode.ONLY_ON_DEVICE works with Chrome LanguageModel.',
      },
      expectedBlocked: false,
    },
    {
      id: 'cli-neg-02-gemini-clean-vitest-prompt',
      agent: 'gemini',
      category: 'clean',
      payload: {
        hook_event_name: 'BeforeAgent',
        prompt: 'Compare Gemini Nano and Gemma 4 latency on CPU in the Vitest report.',
      },
      expectedBlocked: false,
    },
    {
      id: 'cli-neg-03-claude-clean-git-sha',
      agent: 'claude',
      category: 'clean',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git show 5dce993f69b55d50a3c901ef03c64027877 --stat' },
      },
      expectedBlocked: false,
    },
    {
      id: 'cli-neg-04-gemini-clean-uuid-log',
      agent: 'gemini',
      category: 'clean',
      payload: {
        hook_event_name: 'BeforeAgent',
        prompt: 'Inspect request ID 550e8400-e29b-41d4-a716-446655440000 in the latency trace.',
      },
      expectedBlocked: false,
    },
    {
      id: 'cli-neg-05-claude-clean-code-mentioning-secret',
      agent: 'claude',
      category: 'clean',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: {
          file_path: 'src/metrics.ts',
          content: 'export const secretCount = findings.filter((f) => f.type === "SECRET").length;',
        },
      },
      expectedBlocked: false,
    },
    {
      id: 'cli-neg-06-claude-clean-word-boundary-custom',
      agent: 'claude',
      category: 'clean_custom_boundary',
      payload: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Write a unit test for Project Falconry and Heliosphere astronomy terms.',
      },
      expectedBlocked: false,
    },
    {
      id: 'cli-neg-07-claude-ignored-read-tool',
      agent: 'claude',
      category: 'clean_readonly_tool',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: `/workspace/${gcp}` },
      },
      expectedBlocked: false,
    },
    {
      id: 'cli-neg-08-gemini-ignored-read-tool',
      agent: 'gemini',
      category: 'clean_readonly_tool',
      payload: {
        hook_event_name: 'BeforeTool',
        tool_name: 'read_file',
        tool_input: { path: `/workspace/${aws}` },
      },
      expectedBlocked: false,
    },
    {
      id: 'cli-neg-09-claude-clean-base64-hello',
      agent: 'claude',
      category: 'clean',
      payload: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Why does base64 SGVsbG8gd29ybGQgZnJvbSBFbnZveSE= decode with a trailing exclamation?',
      },
      expectedBlocked: false,
    },
    {
      id: 'cli-neg-10-gemini-clean-prose-password',
      agent: 'gemini',
      category: 'clean',
      payload: {
        hook_event_name: 'BeforeAgent',
        prompt: 'Remind users to rotate their API key and reset their password in Settings.',
      },
      expectedBlocked: false,
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
  const cli = await vite.ssrLoadModule('/packages/cli/src/index.ts');
  const cases = buildCliCases();

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let rawEchoLeaks = 0;
  let contractFailures = 0;
  const rows = [];

  for (const tc of cases) {
    const res = cli.evaluateHook(tc.payload, { customRules: USER_RULES });
    const serialized = JSON.stringify(res.stdoutJson);

    let rawEchoed = false;
    if (tc.expectedBlocked && tc.rawSensitive) {
      rawEchoed = tc.rawSensitive.some((s) => serialized.includes(s));
      if (rawEchoed) rawEchoLeaks++;
    }

    let contractOk = res.exitCode === 0 && res.agent === tc.agent;
    if (tc.expectedBlocked && res.blocked) {
      if (tc.agent === 'gemini') {
        contractOk = contractOk && res.stdoutJson.decision === 'deny' && typeof res.stdoutJson.reason === 'string';
      } else if (tc.payload.hook_event_name === 'UserPromptSubmit') {
        contractOk = contractOk && res.stdoutJson.decision === 'block' && typeof res.stdoutJson.reason === 'string';
      } else {
        contractOk =
          contractOk &&
          res.stdoutJson.hookSpecificOutput?.hookEventName === 'PreToolUse' &&
          res.stdoutJson.hookSpecificOutput?.permissionDecision === 'deny';
      }
      if (tc.expectedTag && !serialized.includes(tc.expectedTag)) {
        contractOk = false;
      }
    } else if (!tc.expectedBlocked && !res.blocked) {
      contractOk =
        contractOk &&
        (tc.agent === 'gemini'
          ? res.stdoutJson.decision === 'allow'
          : Object.keys(res.stdoutJson).length === 0);
    }
    if (!contractOk) contractFailures++;

    if (tc.expectedBlocked) {
      if (res.blocked) tp++;
      else fn++;
    } else {
      if (!res.blocked) tn++;
      else fp++;
    }

    rows.push({
      id: tc.id,
      agent: tc.agent,
      category: tc.category,
      expectedBlocked: tc.expectedBlocked,
      actualBlocked: res.blocked,
      rawEchoed,
      contractOk,
      passed: res.blocked === tc.expectedBlocked && !rawEchoed && contractOk,
    });
  }

  const recall = tp + fn > 0 ? Number((tp / (tp + fn)).toFixed(4)) : 1;
  const precision = tp + fp > 0 ? Number((tp / (tp + fp)).toFixed(4)) : 1;
  const f1 = precision + recall > 0 ? Number(((2 * precision * recall) / (precision + recall)).toFixed(4)) : 0;

  const output = {
    generatedAt: new Date().toISOString(),
    protectionLevel: 'Basic protection (rules-only; blocks rather than rewrites)',
    n: cases.length,
    positives: cases.filter((c) => c.expectedBlocked).length,
    negatives: cases.filter((c) => !c.expectedBlocked).length,
    tp,
    fp,
    fn,
    tn,
    recall,
    precision,
    f1,
    falseBlocks: fp,
    rawEchoLeaks,
    contractFailures,
    rows,
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(
    `\n=== ENVOY-GUARD CLI EVAL (n=${output.n} · recall=${(recall * 100).toFixed(1)}% · precision=${(precision * 100).toFixed(1)}% · falseBlocks=${fp} · rawEchoLeaks=${rawEchoLeaks} · contractFailures=${contractFailures}) ===`,
  );
  console.table(
    rows.map(({ id, agent, category, expectedBlocked, actualBlocked, contractOk, passed }) => ({
      id,
      agent,
      category,
      expected: expectedBlocked ? 'BLOCK' : 'ALLOW',
      actual: actualBlocked ? 'BLOCK' : 'ALLOW',
      contract: contractOk ? 'OK' : 'FAIL',
      pass: passed ? 'PASS' : 'FAIL',
    })),
  );
  console.log(`Saved ${OUT_PATH}`);
} finally {
  await vite.close();
}

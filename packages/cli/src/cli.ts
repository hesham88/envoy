import { scanText } from '@envoy/core';
import { evaluateHook, type HookPayload } from './hook';
import { formatInitCommand, type SupportedAgent } from './init';
import { loadUserRules } from './rules';

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks as Parameters<typeof Buffer.concat>[0]).toString('utf8');
}

function parseAgentFlag(argv: string[]): SupportedAgent | undefined {
  const idx = argv.indexOf('--agent');
  const val = idx !== -1 ? argv[idx + 1] : undefined;
  if (val === 'claude' || val === 'gemini') return val;
  return undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (cmd === 'init') {
    const out = formatInitCommand(argv[1]);
    if (out.stderr) process.stderr.write(out.stderr);
    if (out.stdout) process.stdout.write(out.stdout);
    if (out.exitCode !== 0) process.exit(out.exitCode);
    return;
  }

  if (cmd === 'scan') {
    const text = await readStdin();
    const rules = loadUserRules();
    const res = scanText(text, { custom: rules });
    process.stdout.write(
      JSON.stringify(
        {
          mode: 'basic',
          findings: res.findings.map(({ type, tag, role, start, end }) => ({ type, tag, ...(role ? { role } : {}), start, end })),
          masked: res.masked,
        },
        null,
        2,
      ) + '\n',
    );
    process.exit(res.findings.length > 0 ? 2 : 0);
  }

  if (cmd === '--help' || cmd === '-h') {
    process.stdout.write(
      [
        'envoy-guard — Envoy Basic protection (rules-only) hook for coding agents',
        '',
        'Commands:',
        '  envoy-guard [--agent claude|gemini]   Read hook JSON from stdin and emit hook JSON decision',
        '  envoy-guard init claude|gemini        Print settings.json hook snippet (never edits files)',
        '  envoy-guard scan                      Read plain text from stdin and print Basic protection scan JSON',
        '',
        'Custom rules: ~/.envoy/rules.json (CustomRule[]), or set ENVOY_RULES_PATH.',
      ].join('\n') + '\n',
    );
    return;
  }

  // Default: hook mode (stdin JSON -> stdout JSON; never write non-JSON to stdout)
  const raw = (await readStdin()).trim();
  const agent = parseAgentFlag(argv);
  if (!raw) {
    process.stdout.write(JSON.stringify(agent === 'gemini' ? { decision: 'allow' } : {}) + '\n');
    return;
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(raw) as HookPayload;
  } catch {
    process.stderr.write('envoy-guard: invalid hook JSON on stdin; allowing through.\n');
    process.stdout.write(JSON.stringify(agent === 'gemini' ? { decision: 'allow' } : {}) + '\n');
    return;
  }

  const customRules = loadUserRules();
  const decision = evaluateHook(payload, { ...(agent ? { agent } : {}), customRules });
  process.stdout.write(JSON.stringify(decision.stdoutJson) + '\n');
  process.exit(decision.exitCode);
}

void main();

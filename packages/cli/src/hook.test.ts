import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildInitSnippet, evaluateHook, loadUserRules } from './index';

const syntheticKey = () => ['AI', 'za', 'Sy', 'A'.repeat(33)].join('');

describe('envoy-guard — Claude Code hook contract', () => {
  it('blocks UserPromptSubmit with Basic protection reason and masked copy (without echoing raw secrets)', () => {
    const key = syntheticKey();
    const res = evaluateHook({
      hook_event_name: 'UserPromptSubmit',
      prompt: `Please debug my API key ${key} and email mona.adel@example.com`,
    });

    expect(res.agent).toBe('claude');
    expect(res.blocked).toBe(true);
    expect(res.exitCode).toBe(0);
    expect(res.findingsCount).toBe(2);
    expect(res.stdoutJson.decision).toBe('block');
    expect((res.stdoutJson.hookSpecificOutput as Record<string, unknown>).hookEventName).toBe('UserPromptSubmit');
    expect((res.stdoutJson.hookSpecificOutput as Record<string, unknown>).decision).toBe('block');
    const reason = String(res.stdoutJson.reason);
    expect(reason).toContain('Basic protection');
    expect(reason).toContain('[SECRET]');
    expect(reason).toContain('[EMAIL]');
    expect(reason).not.toContain(key);
    expect(reason).not.toContain('mona.adel@example.com');
  });

  it('allows clean UserPromptSubmit with empty JSON and exit 0', () => {
    const res = evaluateHook({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Explain how Firebase AI Logic InferenceMode works.',
    });
    expect(res.blocked).toBe(false);
    expect(res.exitCode).toBe(0);
    expect(res.stdoutJson).toEqual({});
  });

  it('denies PreToolUse on Bash/WebFetch/Write when secrets or PII appear in tool_input', () => {
    const key = syntheticKey();
    const res = evaluateHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: `curl -H "x-api-key: ${key}" https://example.com` },
    });
    expect(res.blocked).toBe(true);
    expect(res.exitCode).toBe(0);
    const out = res.stdoutJson.hookSpecificOutput as Record<string, unknown>;
    expect(out.hookEventName).toBe('PreToolUse');
    expect(out.permissionDecision).toBe('deny');
    expect(String(out.permissionDecisionReason)).not.toContain(key);
    expect(String(out.permissionDecisionReason)).toContain('[SECRET]');
  });

  it('ignores non-outbound tools on PreToolUse (e.g. Read)', () => {
    const key = syntheticKey();
    const res = evaluateHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: `/tmp/${key}` },
    });
    expect(res.blocked).toBe(false);
    expect(res.stdoutJson).toEqual({});
  });
});

describe('envoy-guard — Gemini CLI hook contract', () => {
  it('denies BeforeAgent with strict JSON decision=deny and masked copy', () => {
    const res = evaluateHook({
      hook_event_name: 'BeforeAgent',
      prompt: 'My national ID is 27506120104839 and phone is +20 100 555 0192.',
    });
    expect(res.agent).toBe('gemini');
    expect(res.blocked).toBe(true);
    expect(res.exitCode).toBe(0);
    expect(res.stdoutJson.decision).toBe('deny');
    expect(String(res.stdoutJson.reason)).toContain('[NATIONAL_ID]');
    expect(String(res.stdoutJson.reason)).toContain('[PHONE]');
    expect(String(res.stdoutJson.reason)).not.toContain('27506120104839');
  });

  it('allows clean BeforeAgent with decision=allow', () => {
    const res = evaluateHook({
      hook_event_name: 'BeforeAgent',
      prompt: 'Summarize the Vitest output.',
    });
    expect(res.blocked).toBe(false);
    expect(res.stdoutJson).toEqual({ decision: 'allow' });
  });

  it('denies BeforeTool on write_file when secret appears in content', () => {
    const key = syntheticKey();
    const res = evaluateHook({
      hook_event_name: 'BeforeTool',
      tool_name: 'write_file',
      tool_input: { path: 'config.ts', content: `export const KEY = "${key}";` },
    });
    expect(res.blocked).toBe(true);
    expect(res.stdoutJson.decision).toBe('deny');
    expect(String(res.stdoutJson.reason)).not.toContain(key);
  });
});

describe('envoy-guard — custom rules (~/.envoy/rules.json) and init snippets', () => {
  it('loads valid CustomRule[] from JSON file and masks matching terms', () => {
    const dir = mkdtempSync(join(tmpdir(), 'envoy-cli-'));
    try {
      const file = join(dir, 'rules.json');
      writeFileSync(
        file,
        JSON.stringify([
          { label: 'PROJECT', terms: ['Project Falcon'] },
          { label: 'bad-label', terms: ['ignored'] },
        ]),
        'utf8',
      );
      const rules = loadUserRules(file);
      expect(rules).toHaveLength(1);
      const res = evaluateHook(
        { hook_event_name: 'UserPromptSubmit', prompt: 'Deploy Project Falcon to staging' },
        { customRules: rules },
      );
      expect(res.blocked).toBe(true);
      expect(String(res.stdoutJson.reason)).toContain('[PROJECT]');
      expect(String(res.stdoutJson.reason)).not.toContain('Project Falcon');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints valid settings.json hook snippets for claude and gemini without editing files', () => {
    const claude = buildInitSnippet('claude');
    expect(claude.json.hooks).toHaveProperty('UserPromptSubmit');
    expect(claude.json.hooks).toHaveProperty('PreToolUse');
    expect(claude.note).toContain('cannot rewrite');

    const gemini = buildInitSnippet('gemini');
    expect(gemini.json.hooks).toHaveProperty('BeforeAgent');
    expect(gemini.json.hooks).toHaveProperty('BeforeTool');
  });
});

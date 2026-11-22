/**
 * Core hook processor for `envoy-guard` (Basic protection: deterministic rules + custom rules only;
 * Node has no Firebase AI Logic or Chrome on-device model).
 *
 * Verified hook contracts (2026-11-22):
 * - Claude Code (`UserPromptSubmit`, `PreToolUse`): reads stdin JSON, prints structured JSON to
 *   stdout and exits 0. Note: `UserPromptSubmit` can block or inject context, not rewrite prompts.
 * - Gemini CLI (`BeforeAgent`, `BeforeTool`): reads stdin JSON, prints strict JSON (`decision`:
 *   `"allow"` | `"deny"`, `reason`, `systemMessage`) to stdout and exits 0.
 */
import { scanText, type CustomRule, type Finding } from '@envoy/core';
import type { SupportedAgent } from './init';

export interface HookPayload {
  hook_event_name?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export interface HookDecision {
  agent: SupportedAgent;
  event: string;
  blocked: boolean;
  exitCode: number;
  findingsCount: number;
  stdoutJson: Record<string, unknown>;
}

const OUTBOUND_CLAUDE_TOOLS = new Set(['WebFetch', 'Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const OUTBOUND_GEMINI_TOOLS = new Set(['web_fetch', 'run_shell_command', 'write_file', 'replace']);

/** Collects all string values from a tool_input payload for scanning. */
export function extractToolStrings(input: unknown): string {
  const parts: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) {
      parts.push(v);
    } else if (Array.isArray(v)) {
      for (const item of v) visit(item);
    } else if (v && typeof v === 'object') {
      for (const val of Object.values(v as Record<string, unknown>)) visit(val);
    }
  };
  visit(input);
  return parts.join('\n');
}

function summarizeFindings(findings: readonly Finding[]): string {
  const counts = new Map<string, number>();
  for (const f of findings) {
    const label = f.type === 'CUSTOM' && f.role ? `CUSTOM(${f.role})` : f.type;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([k, n]) => `${n} ${k}`).join(', ');
}

function detectAgent(payload: HookPayload, hint?: SupportedAgent): SupportedAgent {
  if (hint) return hint;
  const ev = payload.hook_event_name ?? '';
  if (ev === 'BeforeAgent' || ev === 'BeforeTool') return 'gemini';
  return 'claude';
}

export function evaluateHook(
  payload: HookPayload,
  opts: { agent?: SupportedAgent; customRules?: readonly CustomRule[] } = {},
): HookDecision {
  const agent = detectAgent(payload, opts.agent);
  const event = payload.hook_event_name ?? (agent === 'gemini' ? 'BeforeAgent' : 'UserPromptSubmit');
  const custom = opts.customRules ?? [];

  // Determine the text to scan based on event type
  let textToScan = '';
  let isPromptEvent = false;

  if (event === 'UserPromptSubmit' || event === 'BeforeAgent') {
    isPromptEvent = true;
    textToScan = typeof payload.prompt === 'string' ? payload.prompt : '';
  } else if (event === 'PreToolUse' || event === 'BeforeTool') {
    const tool = payload.tool_name ?? '';
    const watched = agent === 'gemini' ? OUTBOUND_GEMINI_TOOLS : OUTBOUND_CLAUDE_TOOLS;
    // If a tool_name is present and not an outbound/write tool, allow without scanning
    if (tool && !watched.has(tool)) {
      return {
        agent,
        event,
        blocked: false,
        exitCode: 0,
        findingsCount: 0,
        stdoutJson: agent === 'gemini' ? { decision: 'allow' } : {},
      };
    }
    textToScan = extractToolStrings(payload.tool_input);
  }

  if (!textToScan) {
    return {
      agent,
      event,
      blocked: false,
      exitCode: 0,
      findingsCount: 0,
      stdoutJson: agent === 'gemini' ? { decision: 'allow' } : {},
    };
  }

  const scan = scanText(textToScan, { custom });
  if (scan.findings.length === 0) {
    return {
      agent,
      event,
      blocked: false,
      exitCode: 0,
      findingsCount: 0,
      stdoutJson: agent === 'gemini' ? { decision: 'allow' } : {},
    };
  }

  const summary = summarizeFindings(scan.findings);
  const targetDesc = isPromptEvent ? 'this prompt' : `${payload.tool_name ?? 'tool'} input`;
  const reason = [
    `Envoy Basic protection (rules-only) blocked ${targetDesc}: found ${summary}.`,
    'No raw values are echoed here. Paste or use this masked copy instead:',
    '',
    scan.masked,
  ].join('\n');

  if (agent === 'gemini') {
    return {
      agent,
      event,
      blocked: true,
      exitCode: 0,
      findingsCount: scan.findings.length,
      stdoutJson: {
        decision: 'deny',
        reason,
        systemMessage: `Envoy Basic protection blocked ${targetDesc} (${summary}).`,
      },
    };
  }

  // Claude Code hook contract
  if (isPromptEvent) {
    return {
      agent,
      event,
      blocked: true,
      exitCode: 0,
      findingsCount: scan.findings.length,
      stdoutJson: {
        decision: 'block',
        reason,
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          decision: 'block',
        },
      },
    };
  }

  return {
    agent,
    event,
    blocked: true,
    exitCode: 0,
    findingsCount: scan.findings.length,
    stdoutJson: {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    },
  };
}

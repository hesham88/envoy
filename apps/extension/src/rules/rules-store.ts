import { scanText, validateCustomRule, type CustomRule, type Finding } from '@envoy/core';

export const RULES_KEY = 'envoyRules';

/** Parses an import file: a JSON array of rules, or { rules: [...] } (envoy-guard CLI format). */
export function parseRulesJson(text: string): { rules: CustomRule[]; error: string | null } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { rules: [], error: 'That file is not valid JSON.' }; }
  const list = Array.isArray(data) ? data : (data as { rules?: unknown }).rules;
  if (!Array.isArray(list)) return { rules: [], error: 'Expected a JSON array of rules, or an object with a rules array.' };
  const rules: CustomRule[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) return { rules: [], error: 'Every rule must be an object.' };
    const r = item as CustomRule;
    const rule: CustomRule = { label: String(r.label ?? ''), ...(r.terms ? { terms: r.terms.map(String) } : {}), ...(r.pattern ? { pattern: String(r.pattern) } : {}) };
    const err = validateCustomRule(rule);
    if (err) return { rules: [], error: `Rule "${rule.label || '?'}": ${err}` };
    rules.push(rule);
  }
  return { rules, error: null };
}

export function testRules(rules: readonly CustomRule[], sample: string): Finding[] {
  if (!sample.trim() || rules.length === 0) return [];
  return scanText(sample, { custom: rules }).findings.filter((f) => f.role !== undefined || rules.some((r) => f.tag.startsWith(`[${r.label}`)));
}

export function rulesToJson(rules: readonly CustomRule[]): string {
  return JSON.stringify(rules, null, 2);
}

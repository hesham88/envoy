/**
 * Loads the user's custom Envoy rules from `~/.envoy/rules.json` (or `ENVOY_RULES_PATH`).
 * Always local; never sends rules anywhere; invalid or missing files return `[]`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { validateCustomRule, type CustomRule } from '@envoy/core';

export function defaultRulesPath(): string {
  return process.env.ENVOY_RULES_PATH || join(homedir(), '.envoy', 'rules.json');
}

export function loadUserRules(rulesPath = defaultRulesPath()): CustomRule[] {
  if (!existsSync(rulesPath)) return [];
  try {
    const raw: unknown = JSON.parse(readFileSync(rulesPath, 'utf8'));
    const list: unknown[] = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray((raw as { rules?: unknown }).rules)
        ? ((raw as { rules: unknown[] }).rules)
        : [];
    const valid: CustomRule[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const r = item as CustomRule;
      if (typeof r.label !== 'string') continue;
      if (validateCustomRule(r) === null) valid.push(r);
    }
    return valid;
  } catch {
    return [];
  }
}

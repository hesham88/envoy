import { describe, expect, it } from 'vitest';
import { parseRulesJson, rulesToJson, testRules } from './rules-store';
import { diffWords } from '../recorder/diff';

describe('rules import/export', () => {
  it('round-trips the envoy-guard JSON format', () => {
    const parsed = parseRulesJson(rulesToJson([{ label: 'PROJECT', terms: ['Falcon'] }]));
    expect(parsed.error).toBeNull();
    expect(parsed.rules).toEqual([{ label: 'PROJECT', terms: ['Falcon'] }]);
  });

  it('rejects invalid rules with a message', () => {
    expect(parseRulesJson('[{"label":"lower"}]').error).toBeTruthy();
    expect(parseRulesJson('not json').error).toBeTruthy();
  });

  it('tester masks custom terms and pattern matches', () => {
    const found = testRules(
      [{ label: 'PROJECT', terms: ['Falcon'] }, { label: 'INVOICE', pattern: 'INV-\\d{4}-\\d{3}' }],
      'Falcon review for INV-2026-441, mail a@b.com',
    );
    const values = found.map((f) => f.value);
    expect(values).toContain('Falcon');
    expect(values).toContain('INV-2026-441');
  });
});

describe('diffWords', () => {
  it('marks masked values as removed and tags as added', () => {
    const parts = diffWords('rent is EGP 8,500 today', 'rent is [AMOUNT] today');
    expect(parts.some((p) => p.kind === 'removed' && p.text.includes('8,500'))).toBe(true);
    expect(parts.some((p) => p.kind === 'added' && p.text.includes('[AMOUNT]'))).toBe(true);
  });
});

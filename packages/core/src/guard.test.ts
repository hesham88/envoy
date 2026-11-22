import { describe, expect, it } from 'vitest';
import { checkOutbound } from './guard';
import { detectWithRules } from './rules';
import { EN_LEASE } from './samples/en-lease';
import type { Entity } from './types';

const person = (value: string, role: string): Entity => ({
  type: 'PERSON',
  value,
  start: 0,
  end: value.length,
  confidence: 0.8,
  source: 'nano',
  role,
});
const PROTECTED: Entity[] = [
  ...detectWithRules(EN_LEASE.text),
  person('Karim Fathy', 'landlord'),
  person('Mona Adel', 'tenant'),
];

const CLEAN =
  "Question: Can [LANDLORD] raise the rent 20% this year?\n\nClause 7: The monthly rent is [RENT]. The Landlord may increase the rent once per contract year by no more than 10%, with at least 60 days' written notice to the Tenant.";

describe('checkOutbound', () => {
  it('passes a properly masked excerpt', () => {
    expect(checkOutbound(CLEAN, PROTECTED)).toEqual({ ok: true, leaks: [] });
  });

  it('passes percentages and tags', () => {
    expect(checkOutbound('[RENT] increased by 10%', PROTECTED).ok).toBe(true);
  });

  it('catches reformatted values: IBAN without spaces, phone in another format, lowercase name', () => {
    const cases: [string, Entity['type']][] = [
      ['Pay to EG380019000500000000263180002 please.', 'IBAN'],
      ['Call her on 0100 555 0192.', 'PHONE'],
      ['Ask karim fathy about it.', 'PERSON'],
    ];
    for (const [text, type] of cases) {
      const result = checkOutbound(text, PROTECTED);
      expect(result.ok, text).toBe(false);
      expect(
        result.leaks.map((l) => l.type),
        text,
      ).toContain(type);
    }
  });

  it('catches the raw private amount even without its currency', () => {
    expect(checkOutbound('The rent of 8,500 is too high.', PROTECTED).ok).toBe(false);
    expect(checkOutbound('The rent of 8500 is too high.', PROTECTED).ok).toBe(false);
  });

  it('catches new personal data the user typed into the excerpt', () => {
    const r = checkOutbound('Email me at someone.new@example.org', PROTECTED);
    expect(r.ok).toBe(false);
    expect(r.leaks[0]).toMatchObject({ type: 'EMAIL', value: 'someone.new@example.org' });
  });

  it('reports where each leak is, so the UI can highlight it', () => {
    const text = 'Tenant phone +20 100 555 0192.';
    const leak = checkOutbound(text, PROTECTED).leaks[0]!;
    expect(text.slice(leak.index, leak.index + leak.value.length)).toBe(leak.value);
  });

  it('does not flag numbers that merely share digits with a protected value', () => {
    expect(checkOutbound('Clause 7 allows 10% after 60 days.', PROTECTED).ok).toBe(true);
  });
});

describe('review fix C1: guard', () => {
  it('catches a protected phone retyped with dots or brackets', () => {
    for (const t of ['Call 0100.555.0192', 'Call (0100) 555 0192', 'Call 0100/555/0192']) {
      expect(checkOutbound(t, PROTECTED).ok, t).toBe(false);
    }
  });

  it('does not treat bracketed raw values as tags', () => {
    expect(checkOutbound('ID [29503140101234]', PROTECTED).ok).toBe(false);
    expect(checkOutbound('Tenant [MONA_ADEL]', PROTECTED, { knownTags: ['[RENT]'] }).ok).toBe(
      false,
    );
  });

  it('still lets real tags through when they are known', () => {
    expect(
      checkOutbound('[RENT] and [LANDLORD]', PROTECTED, { knownTags: ['[RENT]', '[LANDLORD]'] }).ok,
    ).toBe(true);
  });
});

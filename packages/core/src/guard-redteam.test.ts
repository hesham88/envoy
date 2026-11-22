import { describe, expect, it } from 'vitest';
import { checkOutbound, numberWordsToDigits, type Entity } from './index';
import { EN_LEASE } from './samples/en-lease';

// The eval lane's red-team set: every attack must be blocked, every clean control must pass.
// Read with Node at test time. @envoy/core has no Node typings on purpose (it's browser-safe),
// so the module names are built at runtime and typed by hand.
type Fs = { readFileSync(path: string, enc: string): string };
type Path = { resolve(...p: string[]): string; dirname(p: string): string };
type Url = { fileURLToPath(u: string): string };
const node = (m: string) => import(/* @vite-ignore */ `node:${m}`);
const fs = (await node('fs')) as Fs;
const path = (await node('path')) as Path;
const url = (await node('url')) as Url;
const raw = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(url.fileURLToPath(import.meta.url)),
      '../../../tests/eval/redteam.json',
    ),
    'utf8',
  ),
);
const cases: {
  id: string;
  protectedEntities: Entity[];
  knownTags: string[];
  outbound: string;
  expectedBlocked: boolean;
}[] = Array.isArray(raw) ? raw : raw.cases;

describe('guard red team (tests/eval/redteam.json)', () => {
  it.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const r = checkOutbound(c.outbound, c.protectedEntities, { knownTags: c.knownTags });
    expect(r.ok).toBe(!c.expectedBlocked);
  });
});

describe('number words', () => {
  it('folds spelled digits and spelled amounts', () => {
    expect(numberWordsToDigits('two seven five zero')).toBe('2750');
    expect(numberWordsToDigits('eight thousand five hundred')).toBe('8500');
    expect(numberWordsToDigits('one hundred and twenty-five')).toBe('125');
  });
});

describe('no false blocks on ordinary text', () => {
  const rent: Entity = {
    type: 'MONEY',
    value: 'EGP 8,500',
    start: 0,
    end: 9,
    confidence: 1,
    source: 'rules',
  };
  const nid: Entity = {
    type: 'NATIONAL_ID',
    value: '27506120104839',
    start: 0,
    end: 14,
    confidence: 1,
    source: 'rules',
  };
  const name: Entity = {
    type: 'PERSON',
    value: 'Karim Fathy',
    start: 0,
    end: 11,
    confidence: 0.9,
    source: 'nano',
  };

  it('prose with number words, line breaks and long words passes', () => {
    const text = [
      'The lease runs for three years, and the rent may rise once a year by no more than ten percent.',
      'Notice must be given sixty days before\nthe increase. Responsibilities and maintenance obligations stay with [LANDLORD].',
      'Question: can [LANDLORD] raise [RENT] by twenty percent this year?',
    ].join('\n');
    expect(checkOutbound(text, [rent, nid, name], { knownTags: ['[LANDLORD]', '[RENT]'] }).ok).toBe(
      true,
    );
  });

  it('the sample lease, masked as Envoy sends it, passes', () => {
    const masked = EN_LEASE.text
      .replace(/Karim Fathy|Mona Adel|Sara Nabil/g, '[PERSON]')
      .replace(/\b\d{14}\b/g, '[NATIONAL_ID]')
      .replace(/EGP [\d,]+|[\d,]+ EGP/g, '[AMOUNT]');
    const r = checkOutbound(masked, [rent, nid, name], {
      knownTags: ['[PERSON]', '[NATIONAL_ID]', '[AMOUNT]'],
    });
    expect(r.leaks.filter((l) => l.via)).toEqual([]); // nothing flagged by the new readings
  });

  it('readable base64 is blocked as unreadable even with nothing protected inside (fail closed)', () => {
    const r = checkOutbound('Context: SGVsbG8gd29ybGQsIHRoaXMgaXMgZmluZQ==', []);
    expect(r.ok).toBe(false);
    expect(r.leaks[0]).toMatchObject({ via: 'encoded', unreadable: true });
  });
});

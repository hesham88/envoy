import { describe, expect, it } from 'vitest';
import { chunkDocument } from '../chunk';
import { EN_LEASE } from './en-lease';
import { SUGGESTED_QUESTIONS } from './questions';

describe('EN_LEASE (fictional sample)', () => {
  const t = EN_LEASE.text;
  const chunks = chunkDocument(t);
  const clause = (n: number) => chunks.find((c) => c.label === `Clause ${n}`)!;

  it('contains every detail the demo relies on', () => {
    for (const v of [
      'Karim Fathy',
      'Mona Adel',
      '27506120104839',
      '29503140101234',
      '+20 100 555 0192',
      'mona.adel@example.com',
      '14 El-Nadi St, Flat 7, Maadi, Cairo',
      '1 September 2024',
      'EGP 8,500',
      'EG38 0019 0005 0000 0000 2631 8000 2',
    ]) {
      expect(t).toContain(v);
    }
  });

  it('has 12 numbered clauses over 6 pages', () => {
    expect(chunks.filter((c) => c.label.startsWith('Clause')).map((c) => c.label)).toEqual(
      Array.from({ length: 12 }, (_, i) => `Clause ${i + 1}`),
    );
    expect(Math.max(...chunks.map((c) => c.page))).toBe(6);
  });

  it('puts the rent amount and the 10% cap in Clause 7, and the bank details elsewhere', () => {
    expect(clause(7).text).toContain('The monthly rent is EGP 8,500.');
    expect(clause(7).text).toContain(
      "The Landlord may increase the rent once per contract year by no more than 10%, with at least 60 days' written notice to the Tenant.",
    );
    expect(clause(7).text).not.toContain('EG38');
    expect(clause(8).text).toContain('EG38 0019 0005 0000 0000 2631 8000 2');
  });

  it('sets a three-year term from 1 September 2024 in Clause 2', () => {
    expect(clause(2).text).toMatch(/three \(3\) years/);
    expect(clause(2).text).toContain('1 September 2024');
  });

  it('declares itself fictional', () => {
    expect(EN_LEASE.notice).toBe('All people, IDs and numbers are fictional.');
  });
});

describe('SUGGESTED_QUESTIONS', () => {
  it('offers the three demo questions', () => {
    expect(SUGGESTED_QUESTIONS).toEqual([
      'Can my landlord raise the rent 20% this year?',
      'When does my contract end?',
      'What happens to my deposit if I leave early?',
    ]);
  });
});

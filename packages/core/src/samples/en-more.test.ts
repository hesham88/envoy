import { describe, expect, it } from 'vitest';
import { scanText } from '../scan';
import { EN_FREELANCE, EN_LAB, EN_LOAN, EN_OFFER, type SampleDocument } from './en-more';

/** Every private value in each sample. Basic protection (rules only, no model) must find each one. */
const SENSITIVE: Array<[SampleDocument, string[]]> = [
  [
    EN_OFFER,
    [
      'Salma Mostafa',
      'Ramy Lotfy',
      '29605210104321',
      '+20 101 333 8899',
      'salma.mostafa@example.com',
      'EG38 0019 0005 0000 0000 2631 8000 2',
      'EGP 65,000',
    ],
  ],
  [
    EN_LAB,
    [
      'Adel Mansour',
      '26809120103456',
      '+20 100 901 2345',
      'adel.mansour@example.com',
      '4471-2093-88',
      'LB 5520918',
      '4410 2093 7712',
      '2026-118843',
      'EG38 0019 0005 0000 0000 2631 8000 2',
    ],
  ],
  [
    EN_FREELANCE,
    [
      'Mariam Rizk',
      'Bassem Fouad',
      '29311090106677',
      '+20 106 111 2233',
      'mariam.rizk@example.com',
      'EG38 0019 0005 0000 0000 2631 8000 2',
      'USD 6,000',
    ],
  ],
  [
    EN_LOAN,
    [
      'Samer Fawzy',
      '28103170102345',
      '+20 100 321 6549',
      'samer.fawzy@example.com',
      'EG38 0019 0005 0000 0000 2631 8000 2',
      '1010192316',
      'EGP 400,000',
    ],
  ],
];

describe('more samples', () => {
  it.each(SENSITIVE)('Basic protection finds every private value in "%s"', (doc, values) => {
    const found = scanText(doc.text).findings.map((f) => f.value);
    const missing = values.filter((v) => !found.some((f) => f.includes(v) || v.includes(f)));
    expect(missing, doc.title).toEqual([]);
  });

  it.each(SENSITIVE)('"%s" says it is fictional and is a reasonable size', (doc) => {
    expect(doc.notice).toBe('All people, IDs and numbers are fictional.');
    expect(doc.text.length).toBeGreaterThan(900);
    expect(doc.text.length).toBeLessThan(3200);
  });
});

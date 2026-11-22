import { describe, expect, it } from 'vitest';
import { detectWithRules, isEgyptianNationalId, isLuhn, isValidIban } from './rules';
import { EN_LEASE } from './samples/en-lease';
import type { EntityType } from './types';

const types = (text: string) => detectWithRules(text).map((e) => [e.type, e.value] as [EntityType, string]);
const count = (text: string, type: EntityType) => detectWithRules(text).filter((e) => e.type === type).length;

describe('validators', () => {
  it('checks IBANs with mod-97', () => {
    expect(isValidIban('EG380019000500000000263180002')).toBe(true);
    expect(isValidIban('EG38 0019 0005 0000 0000 2631 8000 2')).toBe(true);
    expect(isValidIban('GB82WEST12345698765432')).toBe(true);
    expect(isValidIban('EG380019000500000000263180003')).toBe(false);
    expect(isValidIban('EG38001900050000')).toBe(false);
  });

  it('checks card numbers with Luhn', () => {
    expect(isLuhn('4111111111111111')).toBe(true);
    expect(isLuhn('4111 1111 1111 1111')).toBe(true);
    expect(isLuhn('4111111111111112')).toBe(false);
  });

  it('checks Egyptian national ID structure (century, birth date, governorate)', () => {
    expect(isEgyptianNationalId('29503140101234')).toBe(true);
    expect(isEgyptianNationalId('27506120104839')).toBe(true);
    expect(isEgyptianNationalId('30101018812345')).toBe(true); // 2001-01-01, governorate 88
    expect(isEgyptianNationalId('29513140101234')).toBe(false); // month 13
    expect(isEgyptianNationalId('29502300101234')).toBe(false); // 30 February
    expect(isEgyptianNationalId('29503140501234')).toBe(false); // governorate 05
    expect(isEgyptianNationalId('19503140101234')).toBe(false); // century digit 1
    expect(isEgyptianNationalId('2950314010123')).toBe(false); // 13 digits
  });
});

describe('detectWithRules', () => {
  it('finds emails', () => {
    expect(types('Write to mona.adel@example.com today.')).toEqual([['EMAIL', 'mona.adel@example.com']]);
    expect(count('No email @ here.', 'EMAIL')).toBe(0);
  });

  it('finds Egyptian and international phone numbers in common formats', () => {
    for (const p of ['+20 100 555 0192', '01005550192', '0020 100 555 0192', '0122 555 0148', '+44 20 7946 0958']) {
      expect(detectWithRules(`Call ${p} now.`).map((e) => [e.type, e.value])).toEqual([['PHONE', p]]);
    }
  });

  it('does not call a plain year or amount a phone number', () => {
    expect(count('In 2024 the rent was 8500.', 'PHONE')).toBe(0);
  });

  it('finds IBANs with or without spaces and rejects bad checksums', () => {
    expect(types('Account EG38 0019 0005 0000 0000 2631 8000 2.')).toEqual([['IBAN', 'EG38 0019 0005 0000 0000 2631 8000 2']]);
    expect(types('Account EG380019000500000000263180002')).toEqual([['IBAN', 'EG380019000500000000263180002']]);
    expect(count('Account EG380019000500000000263180003', 'IBAN')).toBe(0);
  });

  it('finds national IDs, with or without spaces, and only when the structure is valid', () => {
    expect(types('ID 29503140101234.')).toEqual([['NATIONAL_ID', '29503140101234']]);
    expect(types('ID 2950 3140 1012 34.')).toEqual([['NATIONAL_ID', '2950 3140 1012 34']]);
    expect(count('Ref 29513140101234.', 'NATIONAL_ID')).toBe(0);
  });

  it('finds card numbers that pass Luhn', () => {
    expect(types('Card 4111 1111 1111 1111.')).toEqual([['CARD', '4111 1111 1111 1111']]);
    expect(count('Card 4111 1111 1111 1112.', 'CARD')).toBe(0);
  });

  it('finds money with the currency before or after, but not percentages', () => {
    expect(types('Rent is EGP 8,500 a month.')).toEqual([['MONEY', 'EGP 8,500']]);
    expect(types('Rent is 8,500 EGP a month.')).toEqual([['MONEY', '8,500 EGP']]);
    expect(types('A fee of $1,200.50 applies.')).toEqual([['MONEY', '$1,200.50']]);
    expect(types('Pay 250 LE late.')).toEqual([['MONEY', '250 LE']]);
    expect(count('Up to 10% per year.', 'MONEY')).toBe(0);
  });

  it('finds dates in common English formats', () => {
    for (const d of ['1 September 2024', 'September 1, 2024', '01/09/2024', '2024-09-01']) {
      expect(types(`Starts ${d}.`)).toEqual([['DATE', d]]);
    }
  });

  it('finds street addresses with a light heuristic', () => {
    expect(types('Flat at 14 El-Nadi St, Flat 7, Maadi, Cairo.')).toEqual([['ADDRESS', '14 El-Nadi St, Flat 7, Maadi, Cairo']]);
    expect(count('Wait 10 days before paying.', 'ADDRESS')).toBe(0);
  });

  it('never returns overlapping entities', () => {
    const found = detectWithRules(EN_LEASE.text);
    for (let i = 1; i < found.length; i++) expect(found[i]!.start).toBeGreaterThanOrEqual(found[i - 1]!.end);
  });

  it('reports exact source offsets', () => {
    const t = 'Pay EGP 8,500 to EG38 0019 0005 0000 0000 2631 8000 2';
    for (const e of detectWithRules(t)) expect(t.slice(e.start, e.end)).toBe(e.value);
  });

  it('finds the structured details in the sample lease', () => {
    const t = EN_LEASE.text;
    expect(count(t, 'NATIONAL_ID')).toBeGreaterThanOrEqual(2);
    expect(count(t, 'PHONE')).toBe(2);
    expect(count(t, 'EMAIL')).toBe(2);
    expect(count(t, 'IBAN')).toBe(1);
    expect(count(t, 'MONEY')).toBeGreaterThanOrEqual(3);
    expect(count(t, 'DATE')).toBeGreaterThanOrEqual(2);
    expect(count(t, 'ADDRESS')).toBeGreaterThanOrEqual(1);
  });
});

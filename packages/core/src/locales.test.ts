import { describe, expect, it } from 'vitest';
import { checkOutbound } from './guard';
import { evaluate } from './expr';
import { restoreAnswer } from './restore';
import { detectWithRules, isFrenchNir, isSpanishId } from './rules';
import { scanText } from './scan';
import { assignTags, canonical, parseAmountNumber } from './tags';

const found = (t: string) => detectWithRules(t).map((e) => `${e.type}:${e.value}`);

describe('Spanish, French and German formats (all values fictional)', () => {
  it('Spanish DNI and NIE, only with the right check letter', () => {
    expect(isSpanishId('12345678Z')).toBe(true);
    expect(isSpanishId('12345678A')).toBe(false);
    expect(isSpanishId('X1234567L')).toBe(true);
    expect(found('DNI 12345678-Z, NIE X-1234567-L, y 87654321A no.')).toEqual([
      'NATIONAL_ID:12345678-Z',
      'NATIONAL_ID:X-1234567-L',
    ]);
  });

  it('French NIR, only with the right key', () => {
    expect(isFrenchNir('1 84 12 76 451 089 46')).toBe(true);
    expect(isFrenchNir('1 84 12 76 451 089 47')).toBe(false);
    expect(found('Sécurité sociale : 1 84 12 76 451 089 46.')).toEqual([
      'NATIONAL_ID:1 84 12 76 451 089 46',
    ]);
  });

  it('French phone numbers, dates in three languages, and European amounts', () => {
    expect(found('Appelez le 06 12 34 56 78 ou le 01.23.45.67.89.')).toEqual([
      'PHONE:06 12 34 56 78',
      'PHONE:01.23.45.67.89',
    ]);
    expect(found('Firmado el 15 de agosto de 2024.')).toEqual(['DATE:15 de agosto de 2024']);
    expect(found('Signé le 1er septembre 2024.')).toEqual(['DATE:1er septembre 2024']);
    expect(found('Unterschrieben am 15. August 2024 (15.08.2024).')).toEqual([
      'DATE:15. August 2024',
      'DATE:15.08.2024',
    ]);
    expect(found('Miete: 1.250,50 € im Monat; Kaution 3 750 EUR.')).toEqual([
      'MONEY:1.250,50 €',
      'MONEY:3 750 EUR',
    ]);
  });

  it('reads European and English amounts as the same number, so the maths is right', () => {
    expect(parseAmountNumber('8.500,00 €')).toBe(8500);
    expect(parseAmountNumber('EGP 8,500')).toBe(8500);
    expect(parseAmountNumber('1 200,50 EUR')).toBe(1200.5);
    expect(parseAmountNumber('USD 1,200.50')).toBe(1200.5);
    expect(canonical('1.250,50 €', 'MONEY')).toBe('EUR:1250.5');
    const scan = scanText('Le loyer est de 1.250,50 € par mois.');
    const r = restoreAnswer('Au plus {{AMOUNT * 1.1}}.', scan.tags);
    expect(r.text).toBe('Au plus EUR 1,375.55.');
    expect(evaluate('AMOUNT * 2', { AMOUNT: parseAmountNumber('3 750 EUR') })).toBe(7500);
  });

  it('the guard blocks them in an outbound excerpt, and tags pass', () => {
    const text = 'Inquilino con DNI 12345678Z paga 1.250,50 € al mes.';
    const ents = detectWithRules(text);
    const tags = assignTags(ents);
    expect(checkOutbound('Inquilino con DNI [NATIONAL_ID] paga [AMOUNT] al mes.', ents).ok).toBe(
      true,
    );
    expect(checkOutbound('El DNI es 1234 5678 Z.', ents).ok).toBe(false);
    expect(tags.entries().map((e) => e.tag)).toEqual(['[NATIONAL_ID]', '[AMOUNT]']);
  });
});

import { describe, expect, it } from 'vitest';
import { assignTags, canonical, maskText, mergeEntities } from './tags';
import type { Entity } from './types';

const ent = (type: Entity['type'], value: string, start: number, extra: Partial<Entity> = {}): Entity => ({
  type,
  value,
  start,
  end: start + value.length,
  confidence: 0.9,
  source: 'rules',
  ...extra,
});

describe('canonical', () => {
  it('treats phone formats as one number', () => {
    expect(canonical('+20 100 555 0192', 'PHONE')).toBe(canonical('01005550192', 'PHONE'));
    expect(canonical('0020 100 555 0192', 'PHONE')).toBe(canonical('01005550192', 'PHONE'));
  });

  it('treats amount formats as one amount, keeping the currency', () => {
    expect(canonical('EGP 8,500', 'MONEY')).toBe(canonical('8,500 EGP', 'MONEY'));
    expect(canonical('8500 LE', 'MONEY')).toBe(canonical('EGP 8,500', 'MONEY'));
    expect(canonical('$8,500', 'MONEY')).not.toBe(canonical('EGP 8,500', 'MONEY'));
  });

  it('ignores spacing and case for IBANs, IDs and names', () => {
    expect(canonical('EG38 0019 0005 0000 0000 2631 8000 2', 'IBAN')).toBe(canonical('eg380019000500000000263180002', 'IBAN'));
    expect(canonical('Karim  Fathy', 'PERSON')).toBe(canonical('karim fathy', 'PERSON'));
  });
});

describe('mergeEntities', () => {
  it('lets rules win on overlap but keeps the role the model found', () => {
    const rules = [ent('MONEY', 'EGP 8,500', 20)];
    const nano = [ent('MONEY', '8,500', 24, { source: 'nano', role: 'rent' }), ent('PERSON', 'Karim Fathy', 0, { source: 'nano', role: 'landlord' })];
    const merged = mergeEntities(rules, nano);
    expect(merged.map((e) => [e.type, e.value, e.source, e.role])).toEqual([
      ['PERSON', 'Karim Fathy', 'nano', 'landlord'],
      ['MONEY', 'EGP 8,500', 'rules', 'rent'],
    ]);
  });

  it('returns entities sorted with no overlaps', () => {
    const merged = mergeEntities([ent('PHONE', '01005550192', 10)], [ent('PERSON', 'Mona', 0, { source: 'nano' }), ent('PERSON', '0100', 10, { source: 'nano' })]);
    expect(merged.map((e) => e.value)).toEqual(['Mona', '01005550192']);
  });
});

describe('assignTags', () => {
  it('uses the role for meaning-preserving tags', () => {
    const tags = assignTags([ent('PERSON', 'Karim Fathy', 0, { role: 'landlord' }), ent('MONEY', 'EGP 8,500', 40, { role: 'rent' })]);
    expect(tags.tagOf(ent('PERSON', 'Karim Fathy', 0, { role: 'landlord' }))).toBe('[LANDLORD]');
    expect(tags.valueOf('[RENT]')).toBe('EGP 8,500');
  });

  it('falls back to the type, with ACCOUNT for IBANs', () => {
    const iban = ent('IBAN', 'EG38 0019 0005 0000 0000 2631 8000 2', 0);
    const phone = ent('PHONE', '+20 100 555 0192', 60);
    const tags = assignTags([iban, phone]);
    expect(tags.tagOf(iban)).toBe('[ACCOUNT]');
    expect(tags.tagOf(phone)).toBe('[PHONE]');
  });

  it('gives one tag to format variants of the same value', () => {
    const a = ent('MONEY', 'EGP 8,500', 0, { role: 'rent' });
    const b = ent('MONEY', '8,500 EGP', 30);
    const p1 = ent('PHONE', '+20 100 555 0192', 50);
    const p2 = ent('PHONE', '01005550192', 80);
    const tags = assignTags([a, b, p1, p2]);
    expect(tags.tagOf(b)).toBe(tags.tagOf(a));
    expect(tags.tagOf(p2)).toBe(tags.tagOf(p1));
  });

  it('numbers distinct values that share a role or type', () => {
    const t1 = ent('PERSON', 'Mona Adel', 0, { role: 'tenant' });
    const t2 = ent('PERSON', 'Omar Adel', 20, { role: 'tenant' });
    const d1 = ent('DATE', '1 September 2024', 40);
    const d2 = ent('DATE', '15 August 2024', 70);
    const tags = assignTags([t1, t2, d1, d2]);
    expect([tags.tagOf(t1), tags.tagOf(t2), tags.tagOf(d1), tags.tagOf(d2)]).toEqual(['[TENANT]', '[TENANT_2]', '[DATE_1]', '[DATE_2]']);
  });

  it('lists every tag with its value and type', () => {
    const tags = assignTags([ent('EMAIL', 'mona.adel@example.com', 0)]);
    expect(tags.entries()).toEqual([{ tag: '[EMAIL]', value: 'mona.adel@example.com', type: 'EMAIL' }]);
  });
});

describe('maskText', () => {
  it('replaces only detected values and keeps the meaning of the clause', () => {
    const clause =
      "7. Rent. The monthly rent is EGP 8,500. The Landlord may increase the rent once per contract year by no more than 10%, with at least 60 days' written notice to the Tenant.";
    const at = clause.indexOf('EGP 8,500');
    const entities = [ent('MONEY', 'EGP 8,500', at, { role: 'rent' })];
    expect(maskText(clause, entities, assignTags(entities))).toBe(
      "7. Rent. The monthly rent is [RENT]. The Landlord may increase the rent once per contract year by no more than 10%, with at least 60 days' written notice to the Tenant.",
    );
  });

  it('masks every occurrence, including format variants', () => {
    const text = 'Call +20 100 555 0192 or 01005550192.';
    const entities = [ent('PHONE', '+20 100 555 0192', 5), ent('PHONE', '01005550192', 25)];
    expect(maskText(text, entities, assignTags(entities))).toBe('Call [PHONE] or [PHONE].');
  });
});

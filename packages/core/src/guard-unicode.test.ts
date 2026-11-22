import { describe, expect, it } from 'vitest';
import { checkOutbound, detectWithRules, guardView, type Entity } from './index';

const ZWSP = String.fromCharCode(0x200b); // zero-width space
const ZWJ = String.fromCharCode(0x200d); // zero-width joiner
const SOFT_HYPHEN = String.fromCharCode(0xad);
const BIDI = String.fromCharCode(0x202e); // right-to-left override
const fullWidth = (s: string) =>
  s.replace(/[0-9A-Za-z]/g, (c) => String.fromCodePoint(c.codePointAt(0)! + 0xfee0));
const arabicIndic = (s: string) =>
  s.replace(/\d/g, (d) => String.fromCodePoint(0x0660 + Number(d)));

const person: Entity = {
  type: 'PERSON',
  value: 'Mona Adel',
  start: 0,
  end: 9,
  confidence: 0.9,
  source: 'nano',
};
const [email] = detectWithRules('mona.adel@example.com');
const [phone] = detectWithRules('+20 100 555 0192');
const [iban] = detectWithRules('EG38 0019 0005 0000 0000 2631 8000 2');
const [nid] = detectWithRules('29503140101234');

describe('guard view', () => {
  it('drops invisible characters and folds lookalikes, with offsets back to the original', () => {
    const raw = `a${ZWSP}b ${fullWidth('12')} ${arabicIndic('3')}`;
    const v = guardView(raw);
    expect(v.text).toBe('ab 12 3');
    expect(raw[v.toOriginal(1)]).toBe('b');
  });
});

describe('the guard is not fooled by', () => {
  it('zero-width characters inside an email', () => {
    const r = checkOutbound(`Write to mona${ZWSP}.adel@exam${ZWJ}ple.com`, [email!]);
    expect(r.ok).toBe(false);
    expect(r.leaks[0]!.value).toContain(ZWSP); // reported as it really appears
  });

  it('full-width digits in a phone number', () => {
    expect(checkOutbound(`Call ${fullWidth('01005550192')}`, [phone!]).ok).toBe(false);
  });

  it('Arabic-Indic digits in a national ID', () => {
    expect(checkOutbound(`ID ${arabicIndic('29503140101234')}`, [nid!]).ok).toBe(false);
  });

  it('soft hyphens and bidi controls inside an IBAN', () => {
    const sneaky = `EG38${SOFT_HYPHEN}0019 0005 ${BIDI}0000 0000 2631 8000 2`;
    expect(checkOutbound(`Pay ${sneaky}`, [iban!]).ok).toBe(false);
  });

  it('Cyrillic letters that look like Latin ones in a name', () => {
    expect(checkOutbound('Ask Mоna Аdel about it', [person]).ok).toBe(false); // о and А are Cyrillic
  });

  it('a full-width email with no protected entity at all (rules re-run on the view)', () => {
    expect(checkOutbound(`Reach ${fullWidth('sara')}@example.com`, []).ok).toBe(false);
  });

  it('still lets clean, masked text through', () => {
    expect(
      checkOutbound('Question: can [LANDLORD] raise [RENT] by 20%?', [person, email!, phone!], {
        knownTags: ['[LANDLORD]', '[RENT]'],
      }).ok,
    ).toBe(true);
  });
});

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

  // Regressions from the eval lane's red team (tests/eval/redteam.json).
  it('combining accents added to a name (rt-28)', () => {
    const ACUTE = String.fromCharCode(0x301);
    const karim: Entity = { ...person, value: 'Karim Fathy', end: 11 };
    expect(checkOutbound(`Signed by Ka${ACUTE}rim Fa${ACUTE}thy.`, [karim]).ok).toBe(false);
    expect(checkOutbound('Signed by Kárim Fáthy.', [karim]).ok).toBe(false); // precomposed
  });

  it('a defanged email (rt-23)', () => {
    expect(checkOutbound('Email: mona [dot] adel [at] example [dot] com.', [email!]).ok).toBe(
      false,
    );
  });

  it('a spaced-out token that contains digits (rt-27)', () => {
    const token: Entity = {
      type: 'ORG',
      value: 'TOKEN_ALPHA_992817',
      start: 0,
      end: 18,
      confidence: 1,
      source: 'rules',
    };
    expect(checkOutbound('Key: T-O-K-E-N-_-A-L-P-H-A-_-9-9-2-8-1-7.', [token]).ok).toBe(false);
  });

  it('does not over-match: a name without digits is not searched compacted', () => {
    expect(checkOutbound('Simona Adelaide wrote back.', [person]).ok).toBe(true);
  });

  it('still lets clean, masked text through', () => {
    expect(
      checkOutbound('Question: can [LANDLORD] raise [RENT] by 20%?', [person, email!, phone!], {
        knownTags: ['[LANDLORD]', '[RENT]'],
      }).ok,
    ).toBe(true);
  });

  // Milestone 3 red-team regressions (rt-10..12, rt-14, rt-17..20) + false-positive controls.
  it('catches digits and amounts spelled out in words (rt-10, rt-11, rt-12)', () => {
    const rent: Entity = {
      type: 'MONEY',
      value: 'EGP 8,500',
      start: 0,
      end: 9,
      confidence: 1,
      source: 'rules',
    };
    const rId = checkOutbound(
      'ID digits: two nine five zero three one four zero one zero one two three four.',
      [nid!],
    );
    expect(rId.ok).toBe(false);
    expect(rId.leaks[0]!.value).toContain('two nine five');

    const rPhone = checkOutbound(
      'Call zero one zero zero five five five zero one nine two.',
      [phone!],
    );
    expect(rPhone.ok).toBe(false);

    const rMoney = checkOutbound(
      'Monthly rent is eight thousand five hundred Egyptian pounds.',
      [rent],
    );
    expect(rMoney.ok).toBe(false);
    expect(rMoney.leaks[0]!.value).toBe('eight thousand five hundred');
  });

  it('catches Base64-encoded protected values (rt-17, rt-18) without blocking ordinary Base64', () => {
    const karim: Entity = { ...person, value: 'Karim Fathy', end: 11 };
    const karimNid: Entity = { ...nid!, value: '27506120104839' };
    expect(checkOutbound('Landlord token: S2FyaW0gRmF0aHk=.', [karim]).ok).toBe(false);
    expect(checkOutbound('Ref: Mjc1MDYxMjAxMDQ4Mzk=.', [karimNid]).ok).toBe(false);
    // Ordinary non-PII Base64 ("Hello world from Envoy!") must pass.
    expect(
      checkOutbound('Digest: SGVsbG8gd29ybGQgZnJvbSBFbnZveSE=.', [karim, karimNid]).ok,
    ).toBe(true);
  });

  it('catches reversed protected names and IDs (rt-19, rt-20) without blocking ordinary words', () => {
    const karim: Entity = { ...person, value: 'Karim Fathy', end: 11 };
    const karimNid: Entity = { ...nid!, value: '27506120104839' };
    expect(checkOutbound('Note: yhtaF miraK owns the unit.', [karim]).ok).toBe(false);
    expect(checkOutbound('Backwards ID: 93840102160572.', [karimNid]).ok).toBe(false);
    expect(
      checkOutbound('The parties live well without raw war over stops.', [karim, karimNid]).ok,
    ).toBe(true);
  });

  it('catches a person name split mid-word across a newline (rt-14) without over-matching', () => {
    const karim: Entity = { ...person, value: 'Karim Fathy', end: 11 };
    expect(checkOutbound('Signed by Kar\nim Fat\nhy on the lease.', [karim]).ok).toBe(false);
    // Substring across newline inside longer words must NOT be blocked.
    expect(checkOutbound('Simona\nAdelaide wrote back.', [person]).ok).toBe(true);
    // Sentence punctuation across a newline must NOT join unrelated words.
    expect(checkOutbound('We drove a kar.\nIm fat, hy!', [karim]).ok).toBe(true);
  });

  it('does not block ordinary lease prose with number words or multi-line wrapped text', () => {
    const rent: Entity = {
      type: 'MONEY',
      value: 'EGP 8,500',
      start: 0,
      end: 9,
      confidence: 1,
      source: 'rules',
    };
    const prose =
      'Clause 2: Term of three years with sixty days written notice, two inspections, zero tolerance, ' +
      'and twenty-four hours notice.\nThe building has two hundred fifty units and [RENT] is due monthly.';
    expect(
      checkOutbound(prose, [person, nid!, phone!, rent], { knownTags: ['[RENT]'] }).ok,
    ).toBe(true);
  });
});

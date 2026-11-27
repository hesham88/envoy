/**
 * A deterministic adversarial suite for the outbound guard (no model, no randomness): fictional
 * private values, each written every way someone might try to sneak it past the guard, plus benign
 * controls that must NOT be blocked. Every attack must be blocked; every control must pass.
 * Generated, not hand-picked, so it can't be tuned to the guard: each disguise is applied to every
 * value it fits.
 */
import { checkOutbound } from './guard';
import { scanText } from './scan';
import { EN_LEASE } from './samples/en-lease';
import { EN_FREELANCE, EN_LAB, EN_LOAN, EN_OFFER } from './samples/en-more';
import type { Entity, EntityType } from './types';

export interface SuiteCase {
  id: string;
  category: string;
  protectedEntities: Entity[];
  outbound: string;
  expectedBlocked: boolean;
}

const ent = (type: EntityType, value: string): Entity => ({
  type,
  value,
  start: 0,
  end: value.length,
  confidence: 1,
  source: 'rules',
});

/** Fictional values, two of each kind. */
export const SUITE_VALUES: Entity[] = [
  ent('EMAIL', 'mona.adel@example.com'),
  ent('EMAIL', 'karim.fathy@example.org'),
  ent('PHONE', '+20 100 555 0192'),
  ent('PHONE', '+44 20 7946 0958'),
  ent('IBAN', 'EG38 0019 0005 0000 0000 2631 8000 2'),
  ent('IBAN', 'DE89 3704 0044 0532 0130 00'),
  ent('NATIONAL_ID', '29503140101234'),
  ent('NATIONAL_ID', '28812120102348'),
  ent('CARD', '4532 0151 1283 0366'),
  ent('CARD', '5555 5555 5555 4444'),
  ent('MONEY', 'EGP 8,500'),
  ent('MONEY', 'USD 42,750'),
  ent('PERSON', 'Karim Fathy'),
  ent('PERSON', 'Mona Adel'),
  ent('ADDRESS', '14 El Nasr St, Maadi, Cairo'),
  ent('ADDRESS', '11 Tahrir St, Dokki, Giza'),
  // A fictional JWT (a provider-shaped fake key would trip GitHub's secret scanning, rightly).
  ent('SECRET', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJtb25hLWFkZWwifQ.ZmFrZS1zaWduYXR1cmUtMDAx'),
  ent('SECRET', 'AKIAIOSFODNN7EXAMPLE'),
  ent('PLATE', 'AB12 CDE'),
  ent('PLATE', '7ABC123'),
];

const DIGITS = new Set<EntityType>(['PHONE', 'IBAN', 'NATIONAL_ID', 'CARD', 'MONEY']);
const LETTERS = new Set<EntityType>(['EMAIL', 'PERSON', 'ADDRESS', 'IBAN', 'SECRET', 'PLATE']);
const HOMO: Record<string, string> = {
  a: 'а',
  e: 'е',
  o: 'о',
  c: 'с',
  p: 'р',
  x: 'х',
  i: 'і',
  A: 'А',
  E: 'Е',
  O: 'О',
  C: 'С',
  K: 'К',
  M: 'М',
};
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

const toB64 = (s: string) =>
  btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(''));

/** Each disguise: which types it applies to, and how it rewrites the value. */
const DISGUISES: {
  name: string;
  fits: (t: EntityType) => boolean;
  apply: (v: string) => string;
}[] = [
  { name: 'plain', fits: () => true, apply: (v) => v },
  {
    name: 'upper-case',
    fits: (t) => LETTERS.has(t) && t !== 'IBAN',
    apply: (v) => v.toUpperCase(),
  },
  { name: 'spaced', fits: () => true, apply: (v) => v.replace(/\s+/g, '').split('').join(' ') },
  {
    name: 'dashed',
    fits: (t) => DIGITS.has(t) && t !== 'MONEY',
    apply: (v) => v.replace(/\s+/g, '').replace(/(.{2})(?=.)/g, '$1-'),
  },
  {
    name: 'dotted',
    fits: (t) => DIGITS.has(t) && t !== 'MONEY',
    apply: (v) => v.replace(/\s+/g, '').replace(/(.{3})(?=.)/g, '$1.'),
  },
  {
    name: 'run-together',
    fits: (t) => t !== 'PERSON' && t !== 'ADDRESS',
    apply: (v) => v.replace(/[\s,]+/g, ''),
  },
  { name: 'zero-width', fits: () => true, apply: (v) => v.split('').join('​') },
  { name: 'word-joiner', fits: () => true, apply: (v) => v.split('').join('⁠') },
  { name: 'soft-hyphen', fits: () => true, apply: (v) => v.split('').join('­') },
  {
    name: 'homoglyph',
    fits: (t) => LETTERS.has(t),
    apply: (v) => v.replace(/[aeocpxiAEOCKM]/g, (c) => HOMO[c] ?? c),
  },
  {
    name: 'full-width',
    fits: () => true,
    apply: (v) => v.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)),
  },
  {
    name: 'arabic-indic-digits',
    fits: (t) => DIGITS.has(t),
    apply: (v) => v.replace(/\d/g, (d) => String.fromCharCode(0x660 + Number(d))),
  },
  { name: 'base64', fits: () => true, apply: (v) => toB64(v) },
  { name: 'reversed', fits: () => true, apply: (v) => [...v].reverse().join('') },
  {
    name: 'number-words',
    fits: (t) => DIGITS.has(t) && t !== 'MONEY',
    apply: (v) =>
      v
        .replace(/\d/g, (d) => ` ${WORDS[Number(d)]} `)
        .replace(/\s+/g, ' ')
        .trim(),
  },
  {
    name: 'line-split',
    fits: () => true,
    apply: (v) => `${v.slice(0, Math.ceil(v.length / 2))}\n${v.slice(Math.ceil(v.length / 2))}`,
  },
  {
    name: 'url-encoded',
    fits: () => true,
    apply: (v) =>
      [...v].map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`).join(''),
  },
  {
    name: 'defanged',
    fits: (t) => t === 'EMAIL',
    apply: (v) => v.replace('@', ' [at] ').replace(/\./g, ' [dot] '),
  },
];

/**
 * Benign text that must pass. The guard fails closed on ANY detectable private value in an excerpt,
 * protected or not (Envoy tags them all), so benign means: tags, and text with no private detail.
 */
const BENIGN: { text: string; note: string }[] = [
  {
    text: 'The landlord [LANDLORD] may raise [RENT] by at most 10% once a year, with 60 days notice.',
    note: 'tags only',
  },
  {
    text: 'Clause 7 applies from [DATE_1]; the term is three years.',
    note: 'clause number and a date tag',
  },
  { text: 'Write to [EMAIL] with questions.', note: 'email tag' },
  { text: 'Use your IBAN [ACCOUNT] for the transfer.', note: 'account tag' },
  {
    text: 'Mona Lisa and Karim Benzema are mentioned as examples only.',
    note: 'first names alone, different people',
  },
  {
    text: 'API keys look like sk_live_... and must never be shared.',
    note: 'a key prefix, no key',
  },
  { text: 'The rent rises to {{RENT * 1.10}} at most.', note: 'an expression over a tag' },
  { text: 'In base64, "hello" is aGVsbG8=.', note: 'base64 of something harmless' },
  { text: 'Reversed, the word "lease" reads "esael".', note: 'reversed harmless text' },
  {
    text: 'Percent-encoding turns a space into %20, as in my%20file.txt.',
    note: 'url encoding of harmless text',
  },
  { text: 'The tenant [TENANT] pays [RENT] to [LANDLORD] by the 5th.', note: 'tags only' },
  { text: 'Total: [AMOUNT_2]; insurance pays 80%.', note: 'tags and a percentage' },
  { text: 'Phone numbers in Egypt start with +20.', note: 'a country code only' },
  {
    text: 'Section 12, paragraph 3: the notice period is 30 days.',
    note: 'section numbers and a duration',
  },
  {
    text: 'A B C D E F: the clause lists six options.',
    note: 'spaced capital letters, not a name',
  },
  { text: 'Probation lasts 3 months; paid leave is 21 days a year.', note: 'durations' },
  { text: 'The policy covers 4 people and 2 cars.', note: 'small counts' },
  {
    text: 'Fasting glucose above the reference range needs a repeat test.',
    note: 'medical wording, no values',
  },
  { text: 'The penalty is 2% of the outstanding [AMOUNT].', note: 'a percentage and a tag' },
  {
    text: 'Milestone 2 is due after [DATE_2]; invoices are paid within 30 days.',
    note: 'milestone numbers and tags',
  },
];

/** Other private values, not in the protected list: blocked too (the guard fails closed on any). */
const UNLISTED: { text: string; note: string }[] = [
  { text: 'Clause 7 applies from 1 September 2024.', note: 'a raw date' },
  { text: 'Call the office on +20 100 555 0193 for repairs.', note: 'another phone number' },
  { text: 'The building is at 15 El Nasr St, Maadi, Cairo.', note: 'another address' },
  { text: 'Write to info@example.com with questions.', note: 'another email' },
  { text: 'Deposit: EGP 8,400, refundable within 30 days.', note: 'another amount' },
  { text: 'Reference 4532 0151 1283 0367 for the order.', note: 'a reference number' },
  { text: 'Plates like XY99 ZZZ are UK format.', note: 'another plate' },
  {
    text: 'Section 2950 3140 of the code is quoted.',
    note: 'eight digits of a protected ID (a fragment)',
  },
];

export function buildRedteamSuite(): SuiteCase[] {
  const cases: SuiteCase[] = [];
  for (const v of SUITE_VALUES)
    for (const d of DISGUISES) {
      if (!d.fits(v.type)) continue;
      cases.push({
        id: `${v.type.toLowerCase()}-${SUITE_VALUES.filter((x) => x.type === v.type).indexOf(v) + 1}-${d.name}`,
        category: d.name,
        protectedEntities: [v],
        outbound: `Excerpt: the clause says ${d.apply(v.value)} as written.`,
        expectedBlocked: true,
      });
    }
  UNLISTED.forEach((n, i) =>
    cases.push({
      id: `unlisted-${i + 1}`,
      category: 'unlisted private value',
      protectedEntities: SUITE_VALUES,
      outbound: n.text,
      expectedBlocked: true,
    }),
  );
  // Benign controls against every protected value...
  BENIGN.forEach((n, i) =>
    cases.push({
      id: `benign-${i + 1}`,
      category: `benign: ${n.note}`,
      protectedEntities: SUITE_VALUES,
      outbound: n.text,
      expectedBlocked: false,
    }),
  );
  // ...and every sample document, fully masked, clause by clause.
  for (const [name, doc] of [
    ['lease', EN_LEASE],
    ['offer', EN_OFFER],
    ['lab', EN_LAB],
    ['freelance', EN_FREELANCE],
    ['loan', EN_LOAN],
  ] as const) {
    const scan = scanText(doc.text);
    scan.masked
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20)
      .forEach((p, i) =>
        cases.push({
          id: `benign-${name}-clause-${i + 1}`,
          category: 'benign: masked clause',
          protectedEntities: scan.entities,
          outbound: p,
          expectedBlocked: false,
        }),
      );
  }
  return cases;
}

export function runRedteamSuite(cases = buildRedteamSuite()) {
  const results = cases.map((c) => {
    const blocked = !checkOutbound(c.outbound, c.protectedEntities).ok;
    return { ...c, blocked, pass: blocked === c.expectedBlocked };
  });
  const attacks = results.filter((r) => r.expectedBlocked);
  const benign = results.filter((r) => !r.expectedBlocked);
  return {
    total: results.length,
    attacks: attacks.length,
    attacksBlocked: attacks.filter((r) => r.blocked).length,
    benign: benign.length,
    falseBlocks: benign.filter((r) => r.blocked).length,
    failures: results.filter((r) => !r.pass),
    byCategory: Object.fromEntries(
      [...new Set(attacks.map((r) => r.category))].map((c) => {
        const rs = attacks.filter((r) => r.category === c);
        return [c, `${rs.filter((r) => r.blocked).length}/${rs.length}`];
      }),
    ),
  };
}

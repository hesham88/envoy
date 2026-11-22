/**
 * Deterministic detectors for structured personal data. They run first, on every document,
 * whether or not the on-device model is available; checksums keep false positives down.
 */
import { normalizeDigits } from './normalize';
import type { Entity, EntityType } from './types';

// ---------- validators ----------

const IBAN_LENGTHS: Record<string, number> = { EG: 29, GB: 22, DE: 22, FR: 27, AE: 23, SA: 24, NL: 18, ES: 24, IT: 27 };

export function isValidIban(raw: string): boolean {
  const s = raw.replace(/[\s.-]+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const expected = IBAN_LENGTHS[s.slice(0, 2)];
  if (expected !== undefined && s.length !== expected) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const v = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

export function isLuhn(raw: string): boolean {
  const digits = raw.replace(/[\s.-]/g, '');
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const GOVERNORATES = new Set(['01', '02', '03', '04', '88', ...Array.from({ length: 25 }, (_, i) => String(i + 11))]);

/** Structure check only (century, birth date, governorate); the final check digit is not verified. */
export function isEgyptianNationalId(raw: string): boolean {
  const s = raw.replace(/[\s.-]+/g, '');
  if (!/^[23]\d{13}$/.test(s)) return false;
  const century = s[0] === '2' ? 1900 : 2000;
  const year = century + Number(s.slice(1, 3));
  const month = Number(s.slice(3, 5));
  const day = Number(s.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  return GOVERNORATES.has(s.slice(7, 9));
}

// ---------- detectors ----------

interface Detector {
  type: EntityType;
  priority: number; // lower wins on overlap
  confidence: number;
  pattern: RegExp;
  /** Return the accepted value (possibly shortened) or null. */
  accept?: (value: string) => string | null;
}

const MONTHS =
  '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)';
const NUMBER = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const CURRENCY_BEFORE = '(?:EGP|USD|EUR|GBP|LE|L\\.E\\.|US\\$|\\$|€|£)';
const CURRENCY_AFTER = '(?:EGP|USD|EUR|GBP|LE|L\\.E\\.|pounds|dollars|euros|ج\\.م|جنيه)';

const DETECTORS: Detector[] = [
  {
    type: 'IBAN',
    priority: 0,
    confidence: 0.99,
    pattern: /\b[A-Z]{2}\d{2}(?:[ .-]?[A-Z0-9]{4}){2,7}(?:[ .-]?[A-Z0-9]{1,4})?\b/g,
    accept: (v) => {
      if (isValidIban(v)) return v;
      const shorter = v.replace(/[ .-]?[A-Z0-9]{1,4}$/, '');
      return shorter !== v && isValidIban(shorter) ? shorter : null;
    },
  },
  {
    type: 'NATIONAL_ID',
    priority: 1,
    confidence: 0.97,
    pattern: /(?<!\d)[23]\d{3}[ .-]?\d{4}[ .-]?\d{4}[ .-]?\d{2}(?!\d)/g,
    accept: (v) => (isEgyptianNationalId(v) ? v : null),
  },
  {
    type: 'EMAIL',
    priority: 2,
    confidence: 0.95,
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
  },
  // Separators people use in numbers: space . - / ( ) — at most two between digits.
  { type: 'PHONE', priority: 3, confidence: 0.9, pattern: /\+[1-9]\d{0,2}(?:[ .\-/()]{0,2}\d){6,13}(?!\d)/g },
  { type: 'PHONE', priority: 3, confidence: 0.9, pattern: /(?<!\d)00[1-9]\d{0,2}(?:[ .\-/()]{0,2}\d){6,13}(?!\d)/g },
  { type: 'PHONE', priority: 3, confidence: 0.9, pattern: /(?<![\d(])\(?01[0125]\)?(?:[ .\-/]{0,2}\d){8}(?!\d)/g },
  { type: 'PHONE', priority: 3, confidence: 0.85, pattern: /(?<![\d(])\(?0[23]\)?(?:[ .\-/]{0,2}\d){8}(?!\d)/g },
  {
    type: 'CARD',
    priority: 4,
    confidence: 0.97,
    pattern: /(?<!\d)(?:\d[ .-]?){12,18}\d(?!\d)/g,
    accept: (v) => (isLuhn(v) ? v : null),
  },
  {
    type: 'MONEY',
    priority: 5,
    confidence: 0.9,
    pattern: new RegExp(`(?<![A-Za-z])${CURRENCY_BEFORE} ?${NUMBER}(?![\\d%])`, 'g'),
  },
  {
    type: 'MONEY',
    priority: 5,
    confidence: 0.9,
    pattern: new RegExp(`(?<![\\d.,])${NUMBER} ?${CURRENCY_AFTER}(?![A-Za-z])`, 'g'),
  },
  { type: 'DATE', priority: 6, confidence: 0.85, pattern: new RegExp(`\\b\\d{1,2} ${MONTHS},? \\d{4}\\b`, 'g') },
  { type: 'DATE', priority: 6, confidence: 0.85, pattern: new RegExp(`\\b${MONTHS} \\d{1,2}, \\d{4}\\b`, 'g') },
  { type: 'DATE', priority: 6, confidence: 0.8, pattern: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g },
  { type: 'DATE', priority: 6, confidence: 0.8, pattern: /\b\d{4}-\d{2}-\d{2}\b/g },
  {
    type: 'ADDRESS',
    priority: 7,
    confidence: 0.6,
    pattern:
      /\b\d{1,4} (?:[A-Z][\w-]* ){0,3}(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard)\b\.?(?: \d{1,4})?(?:, ?[A-Z0-9][\w-]*(?: [A-Z0-9][\w-]*)*)+/g,
  },
];

const overlaps = (a: Entity, b: Entity) => a.start < b.end && b.start < a.end;

/** Runs every detector; on overlap the higher-priority (then longer) match wins. */
export function detectWithRules(text: string): Entity[] {
  const norm = normalizeDigits(text);
  const candidates: (Entity & { priority: number })[] = [];
  for (const d of DETECTORS) {
    d.pattern.lastIndex = 0;
    for (const m of norm.text.matchAll(d.pattern)) {
      const accepted = d.accept ? d.accept(m[0]) : m[0];
      if (!accepted) continue;
      const start = norm.toOriginal(m.index);
      const end = norm.toOriginal(m.index + accepted.length);
      candidates.push({ type: d.type, value: text.slice(start, end), start, end, confidence: d.confidence, source: 'rules', priority: d.priority });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority || b.end - b.start - (a.end - a.start));
  const kept: Entity[] = [];
  for (const { priority: _p, ...c } of candidates) {
    if (!kept.some((k) => overlaps(k, c))) kept.push(c);
  }
  return kept.sort((a, b) => a.start - b.start);
}

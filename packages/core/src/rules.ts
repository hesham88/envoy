/**
 * Deterministic detectors for structured personal data. They run first, on every document,
 * whether or not the on-device model is available; checksums keep false positives down.
 */
import { normalizeDigits } from './normalize';
import type { Entity, EntityType } from './types';

// ---------- validators ----------

const IBAN_LENGTHS: Record<string, number> = {
  EG: 29,
  GB: 22,
  DE: 22,
  FR: 27,
  AE: 23,
  SA: 24,
  NL: 18,
  ES: 24,
  IT: 27,
};

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

const GOVERNORATES = new Set([
  '01',
  '02',
  '03',
  '04',
  '88',
  ...Array.from({ length: 25 }, (_, i) => String(i + 11)),
]);

/** Structure check only (century, birth date, governorate); the final check digit is not verified. */
export function isEgyptianNationalId(raw: string): boolean {
  const s = raw.replace(/[\s.-]+/g, '');
  if (!/^[23]\d{13}$/.test(s)) return false;
  const century = s[0] === '2' ? 1900 : 2000;
  const year = century + Number(s.slice(1, 3));
  const month = Number(s.slice(3, 5));
  const day = Number(s.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return false;
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
  /** Use this capture group as the value instead of the whole match. */
  group?: number;
  /** Tag label for a user rule (becomes the entity's role). */
  label?: string;
}

const MONTHS =
  '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)';
const NUMBER = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const CURRENCY_BEFORE = '(?:EGP|USD|EUR|GBP|LE|L\\.E\\.|US\\$|\\$|€|£)';
const CURRENCY_AFTER = '(?:EGP|USD|EUR|GBP|LE|L\\.E\\.|pounds|dollars|euros|ج\\.م|جنيه)';

// Secrets: provider key formats with fixed prefixes (low false-positive rate), PEM private keys,
// JWTs, and the value of an explicit `password=` / `api_key:` style assignment.
const SECRET_DETECTORS: Detector[] = [
  {
    type: 'SECRET',
    priority: -1,
    confidence: 0.99,
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    type: 'SECRET',
    priority: -1,
    confidence: 0.98,
    pattern:
      /\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|xox[abprs]-[A-Za-z0-9-]{10,}|(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}|sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|glpat-[A-Za-z0-9_-]{20,})/g,
  },
  {
    type: 'SECRET',
    priority: -1,
    confidence: 0.95,
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  },
  {
    type: 'SECRET',
    priority: -1,
    confidence: 0.85,
    // (?<![A-Za-z0-9]) rather than \b so DB_PASSWORD and MY_API_KEY count.
    pattern:
      /(?<![A-Za-z0-9])(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b["']?[ \t]*[:=][ \t]*["']?([^\s"',;]{6,})/gi,
    group: 1,
  },
];

const DETECTORS: Detector[] = [
  ...SECRET_DETECTORS,
  {
    // A number the text itself calls an account, card, policy, passport or other ID number:
    // "my bank account number 1010192316", "policy no. 88-4410-2093", "passport #A1234567".
    // Lowest priority, so IBANs, cards, phones, national IDs and dates win when they overlap.
    type: 'ACCOUNT',
    priority: 8,
    confidence: 0.85,
    pattern:
      /(?<!\p{L})(?:(?:bank\s+)?account|acct|a\/c|card|policy|member(?:ship)?|customer|client|reference|ref|invoice|passport|licen[cs]e|national\s+id|id|ssn|social\s+security|tax|routing|sort\s+code|swift|bic|meter|contract|mrn|medical\s+record|patient|claim|accession|specimen)(?:\s+(?:number|no\.?|num|#|id|code))?\s*(?:is\s+|:\s*|=\s*|#\s*)?((?:[A-Z]{1,4}[ -]?)?\d[\d -]{4,30}\d)(?![\p{L}\p{N}])/giu,
    group: 1,
    accept: (v) => ((v.match(/\d/g) ?? []).length >= 6 ? v.trim() : null),
  },
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
  {
    type: 'PHONE',
    priority: 3,
    confidence: 0.9,
    pattern: /\+[1-9]\d{0,2}(?:[ .\-/()]{0,2}\d){6,13}(?!\d)/g,
  },
  {
    type: 'PHONE',
    priority: 3,
    confidence: 0.9,
    pattern: /(?<!\d)00[1-9]\d{0,2}(?:[ .\-/()]{0,2}\d){6,13}(?!\d)/g,
  },
  {
    type: 'PHONE',
    priority: 3,
    confidence: 0.9,
    pattern: /(?<![\d(])\(?01[0125]\)?(?:[ .\-/]{0,2}\d){8}(?!\d)/g,
  },
  {
    type: 'PHONE',
    priority: 3,
    confidence: 0.85,
    pattern: /(?<![\d(])\(?0[23]\)?(?:[ .\-/]{0,2}\d){8}(?!\d)/g,
  },
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
  {
    type: 'DATE',
    priority: 6,
    confidence: 0.85,
    pattern: new RegExp(`\\b\\d{1,2} ${MONTHS},? \\d{4}\\b`, 'g'),
  },
  {
    type: 'DATE',
    priority: 6,
    confidence: 0.85,
    pattern: new RegExp(`\\b${MONTHS} \\d{1,2}, \\d{4}\\b`, 'g'),
  },
  { type: 'DATE', priority: 6, confidence: 0.8, pattern: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g },
  { type: 'DATE', priority: 6, confidence: 0.8, pattern: /\b\d{4}-\d{2}-\d{2}\b/g },
  // Vehicle plates. Named ones in any format ("plate no. 7ABC123", "vehicle registration KA-01 1234"),
  // and three strict national formats on their own: UK (AB12 CDE), France (AB-123-CD), Germany (B-MW 1234).
  {
    type: 'PLATE',
    priority: 7,
    confidence: 0.85,
    pattern:
      // Case-sensitive on purpose: the labels allow a capital first letter, the plate must be upper case.
      /(?<!\p{L})(?:(?:[Ll]icen[cs]e|[Nn]umber|[Vv]ehicle|[Cc]ar)\s+)?(?:[Pp]late|[Rr]egistration|[Rr]eg\.?|[Vv]ehicle|[Cc]ar)(?:\s+(?:[Nn]umber|[Nn]o\.?|[Nn]um|#|[Mm]ark|[Pp]late))?\s*(?:is\s+|:\s*|#\s*)?([A-Z0-9]{1,4}(?:[ -]?[A-Z0-9]{1,4}){1,3})(?![\p{L}\p{N}])/gu,
    group: 1,
    accept: (v) => {
      // Plates are upper case with letters and digits: "red", "2024" and "Toyota" are not plates.
      const alnum = v.replace(/[^A-Z0-9]/g, '');
      return alnum.length >= 4 &&
        alnum.length <= 9 &&
        alnum.length === v.replace(/[ -]/g, '').length &&
        /\d/.test(alnum) &&
        /[A-Z]/.test(alnum)
        ? v.trim()
        : null;
    },
  },
  {
    type: 'PLATE',
    priority: 7,
    confidence: 0.8,
    pattern:
      /(?<![A-Z0-9-])(?:[A-Z]{2}\d{2} ?[A-Z]{3}|[A-Z]{2}-\d{3}-[A-Z]{2}|[A-ZÄÖÜ]{1,3}-[A-Z]{1,2} \d{1,4}[EH]?)(?![A-Z0-9-])/g,
  },
  {
    type: 'ADDRESS',
    priority: 7,
    confidence: 0.6,
    pattern:
      /\b\d{1,4} (?:[A-Z][\w-]* ){0,3}(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard)\b\.?(?: \d{1,4})?(?:, ?[A-Z0-9][\w-]*(?: [A-Z0-9][\w-]*)*)+/g,
  },
];

const overlaps = (a: Entity, b: Entity) => a.start < b.end && b.start < a.end;

// ---------- the user's own rules ----------

/**
 * A rule the user adds ("Project Falcon" → [PROJECT]). `terms` match whole words, ignoring case;
 * `pattern` is a regular expression. Rules are stored on the device and never sent anywhere.
 */
export interface CustomRule {
  /** Tag label: A–Z, 0–9 and _, e.g. PROJECT → [PROJECT], [PROJECT_2]. */
  label: string;
  terms?: string[];
  pattern?: string;
}

const LABEL_RE = /^[A-Z][A-Z0-9_]{0,23}$/;
const MAX_PATTERN = 200;
const cleanTerms = (r: CustomRule) => (r.terms ?? []).map((t) => t.trim()).filter(Boolean);

/** Checks one rule. Returns why it can't be used, or null when it's fine. */
export function validateCustomRule(rule: CustomRule): string | null {
  if (!LABEL_RE.test(rule.label))
    return 'The label must start with a letter and use only A–Z, 0–9 and _ (up to 24).';
  const terms = cleanTerms(rule);
  if (!terms.length && !rule.pattern) return 'Add at least one word or a pattern.';
  if (terms.some((t) => t.length < 2)) return 'Words must be at least 2 characters.';
  if (rule.pattern) {
    if (rule.pattern.length > MAX_PATTERN)
      return `The pattern is longer than ${MAX_PATTERN} characters.`;
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern, 'u');
    } catch {
      return 'The pattern is not a valid regular expression.';
    }
    if (re.test('')) return 'The pattern matches empty text.';
  }
  return null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function customDetectors(rules: readonly CustomRule[]): Detector[] {
  const out: Detector[] = [];
  for (const r of rules) {
    if (validateCustomRule(r)) continue; // invalid rules are skipped, never thrown on while the user types
    const terms = cleanTerms(r).sort((a, b) => b.length - a.length);
    if (terms.length) {
      const alt = terms.map(escapeRe).join('|');
      out.push({
        type: 'CUSTOM',
        label: r.label,
        priority: 10,
        confidence: 1,
        pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'giu'),
      });
    }
    if (r.pattern)
      out.push({
        type: 'CUSTOM',
        label: r.label,
        priority: 10,
        confidence: 1,
        pattern: new RegExp(r.pattern, 'gu'),
      });
  }
  return out;
}

export interface RuleOptions {
  /** The user's own rules. Built-in detectors win on overlap, so a term inside a detected address or
   *  account is masked as part of it instead of splitting it (which would expose the rest). */
  custom?: readonly CustomRule[];
}

/** Runs every detector; on overlap the higher-priority (then longer) match wins. */
export function detectWithRules(text: string, opts: RuleOptions = {}): Entity[] {
  const norm = normalizeDigits(text);
  const candidates: (Entity & { priority: number })[] = [];
  for (const d of [...DETECTORS, ...customDetectors(opts.custom ?? [])]) {
    d.pattern.lastIndex = 0;
    for (const m of norm.text.matchAll(d.pattern)) {
      const whole = d.group ? m[d.group] : m[0];
      if (!whole) continue;
      const offset = d.group ? m.index + m[0].lastIndexOf(whole) : m.index;
      const accepted = d.accept ? d.accept(whole) : whole;
      if (!accepted) continue;
      const start = norm.toOriginal(offset);
      const end = norm.toOriginal(offset + accepted.length);
      candidates.push({
        type: d.type,
        value: text.slice(start, end),
        start,
        end,
        confidence: d.confidence,
        source: 'rules',
        priority: d.priority,
        ...(d.label ? { role: d.label } : {}),
      });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority || b.end - b.start - (a.end - a.start));
  const kept: Entity[] = [];
  for (const { priority: _p, ...c } of candidates) {
    if (!kept.some((k) => overlaps(k, c))) kept.push(c);
  }
  return kept.sort((a, b) => a.start - b.start);
}

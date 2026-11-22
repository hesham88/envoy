/**
 * Outbound leak guard: runs right before any cloud call.
 * 1. Re-runs every rule detector on the outbound text (anything structured that isn't a tag is a leak).
 * 2. Looks for every protected value again, tolerant of reformatting (spacing, case, prefixes, currency).
 */
import { detectWithRules, type CustomRule } from './rules';
import { canonical } from './tags';
import type { Entity, EntityType } from './types';

export interface Leak {
  value: string;
  type: EntityType;
  index: number;
}

const TAG = /\[[A-Z][A-Z0-9_]*\]/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tags are replaced by spaces of the same length, so offsets stay true and tags never count as leaks.
 * With `knownTags`, only tags that really exist are blanked: `[MONA_ADEL]` typed by hand is still checked.
 */
const withoutTags = (text: string, knownTags?: Iterable<string>) => {
  const known = knownTags ? new Set(knownTags) : null;
  return text.replace(TAG, (t) => (!known || known.has(t) ? ' '.repeat(t.length) : t));
};

// Cyrillic and Greek letters that look like Latin ones ("Mоna" with a Cyrillic о).
const CONFUSABLE: Record<string, string> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  ԁ: 'd',
  ѕ: 's',
  һ: 'h',
  ӏ: 'l',
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  Х: 'X',
  І: 'I',
  Ј: 'J',
  Ѕ: 'S',
  ο: 'o',
  ν: 'v',
  α: 'a',
  ι: 'i',
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Η: 'H',
  Ι: 'I',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'P',
  Τ: 'T',
  Χ: 'X',
  Ζ: 'Z',
};
const FORMAT = /\p{Cf}/u; // zero-width spaces and joiners, soft hyphen, BOM, bidi controls
const ARABIC_INDIC = 0x0660;
const EASTERN_ARABIC_INDIC = 0x06f0;

const MARK = /\p{M}/u; // combining marks: accents added to a name, Arabic diacritics

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += B64_ALPHABET[(n >>> 18) & 63];
    out += B64_ALPHABET[(n >>> 12) & 63];
    out += i + 1 < bytes.length ? B64_ALPHABET[(n >>> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64_ALPHABET[n & 63] : '=';
  }
  return out;
}

const reverseStr = (s: string) => [...s].reverse().join('');

const DIGIT_WORD: Record<string, string> = {
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};

const SMALL_NUM: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS_NUM: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const SCALE_NUM: Record<string, number> = {
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
};

const CURRENCY_WORD = /^(?:egp|usd|eur|gbp|pounds?|dollars?|euros?|egyptian|le)$/i;
const NUM_SEP = /^[\s,-]+$/;
const CARDINAL_SEP = /^[\s-]+$/;

interface WordTok {
  lower: string;
  start: number;
  end: number;
}

/**
 * Folds spelled-out digit sequences (6+ digit words, e.g. "two seven five...") and multi-word
 * English cardinal phrases (e.g. "eight thousand five hundred") into ASCII digits, preserving
 * exact start/end offsets back to the input string. Single ordinary number words ("two years",
 * "sixty days", "zero tolerance") are left untouched unless adjacent to a currency word.
 */
function foldNumberWords(text: string): {
  text: string;
  mapStart: number[];
  mapEnd: number[];
} | null {
  const tokens: WordTok[] = [];
  for (const m of text.matchAll(/[A-Za-z]+/g)) {
    tokens.push({ lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }

  const replacements: { start: number; end: number; value: string }[] = [];
  let t = 0;
  while (t < tokens.length) {
    const tok = tokens[t]!;

    // 1. Digit-by-digit run (6+ consecutive digit words separated only by space/hyphen/comma)
    if (tok.lower in DIGIT_WORD) {
      let endIdx = t;
      let nonOh = tok.lower === 'oh' ? 0 : 1;
      while (endIdx + 1 < tokens.length) {
        const next = tokens[endIdx + 1]!;
        const sep = text.slice(tokens[endIdx]!.end, next.start);
        if (!NUM_SEP.test(sep) || !(next.lower in DIGIT_WORD)) break;
        endIdx++;
        if (next.lower !== 'oh') nonOh++;
      }
      const runLen = endIdx - t + 1;
      if (runLen >= 6 && nonOh > 0) {
        let digits = '';
        for (let k = t; k <= endIdx; k++) digits += DIGIT_WORD[tokens[k]!.lower]!;
        replacements.push({ start: tok.start, end: tokens[endIdx]!.end, value: digits });
        t = endIdx + 1;
        continue;
      }
    }

    // 2. Cardinal number phrase (e.g. "eight thousand five hundred", "two hundred and fifty")
    if (tok.lower in SMALL_NUM || tok.lower in TENS_NUM) {
      let total = 0;
      let current = 0;
      let numWords = 0;
      let hasScale = false;
      let lastValid = t - 1;
      let k = t;
      let pendingAnd = false;

      while (k < tokens.length) {
        const cur = tokens[k]!;
        if (k > t) {
          const sep = text.slice(tokens[k - 1]!.end, cur.start);
          const okSep = hasScale ? NUM_SEP.test(sep) : CARDINAL_SEP.test(sep);
          if (!okSep) break;
        }
        const w = cur.lower;
        if (w === 'and' && hasScale && !pendingAnd && k > t) {
          pendingAnd = true;
          k++;
          continue;
        }
        if (w in SMALL_NUM) {
          const v = SMALL_NUM[w]!;
          const valid =
            numWords === 0 ||
            current % 100 === 0 ||
            (current % 10 === 0 && current % 100 >= 20 && v > 0 && v < 10);
          if (!valid) break;
          current += v;
          numWords++;
          pendingAnd = false;
          lastValid = k;
          k++;
        } else if (w in TENS_NUM) {
          if (numWords > 0 && current % 100 !== 0) break;
          current += TENS_NUM[w]!;
          numWords++;
          pendingAnd = false;
          lastValid = k;
          k++;
        } else if (w === 'hundred') {
          if (current <= 0 || current >= 100 || pendingAnd) break;
          current *= 100;
          numWords++;
          hasScale = true;
          lastValid = k;
          k++;
        } else if (w in SCALE_NUM) {
          if (current <= 0 || pendingAnd) break;
          total += current * SCALE_NUM[w]!;
          current = 0;
          numWords++;
          hasScale = true;
          lastValid = k;
          k++;
        } else {
          break;
        }
      }

      if (lastValid >= t) {
        const prevTok = t > 0 ? tokens[t - 1] : undefined;
        const nextTok = lastValid + 1 < tokens.length ? tokens[lastValid + 1] : undefined;
        const adjCurrency =
          (prevTok && /^\s+$/.test(text.slice(prevTok.end, tok.start)) && CURRENCY_WORD.test(prevTok.lower)) ||
          (nextTok && /^\s+$/.test(text.slice(tokens[lastValid]!.end, nextTok.start)) && CURRENCY_WORD.test(nextTok.lower));
        if (hasScale || numWords >= 2 || adjCurrency) {
          const val = total + current;
          replacements.push({ start: tok.start, end: tokens[lastValid]!.end, value: String(val) });
          t = lastValid + 1;
          continue;
        }
      }
    }

    t++;
  }

  if (replacements.length === 0) return null;

  let out = '';
  const mapStart: number[] = [];
  const mapEnd: number[] = [];
  let cursor = 0;
  for (const r of replacements) {
    for (let i = cursor; i < r.start; i++) {
      out += text[i]!;
      mapStart.push(i);
      mapEnd.push(i + 1);
    }
    for (let k = 0; k < r.value.length; k++) {
      out += r.value[k]!;
      mapStart.push(r.start);
      mapEnd.push(r.end);
    }
    cursor = r.end;
  }
  for (let i = cursor; i < text.length; i++) {
    out += text[i]!;
    mapStart.push(i);
    mapEnd.push(i + 1);
  }
  return { text: out, mapStart, mapEnd };
}

function foldChar(ch: string): string {
  const n = ch.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFKC');
  let out = '';
  for (const c of n) {
    const code = c.codePointAt(0)!;
    if (code >= ARABIC_INDIC && code <= ARABIC_INDIC + 9) out += String(code - ARABIC_INDIC);
    else if (code >= EASTERN_ARABIC_INDIC && code <= EASTERN_ARABIC_INDIC + 9)
      out += String(code - EASTERN_ARABIC_INDIC);
    else out += CONFUSABLE[c] ?? c;
  }
  return out;
}

/**
 * The text as the guard reads it: invisible format characters removed, compatibility forms folded
 * (NFKC: full-width and styled digits and letters), Arabic-Indic digits and common Latin lookalikes
 * mapped, and spelled-out digit sequences / cardinal amounts folded to digits.
 * `toOriginal` / `toOriginalEnd` map an offset in the view back to the outbound text.
 */
export function guardView(text: string): {
  text: string;
  toOriginal: (i: number) => number;
  toOriginalEnd: (i: number) => number;
} {
  let out = '';
  const mapStart: number[] = [];
  const mapEnd: number[] = [];
  let i = 0;
  for (const ch of text) {
    if (!FORMAT.test(ch) && !MARK.test(ch)) {
      const folded = foldChar(ch);
      for (let k = 0; k < folded.length; k++) {
        mapStart.push(i);
        mapEnd.push(i + ch.length);
      }
      out += folded;
    }
    i += ch.length;
  }
  const numFolded = foldNumberWords(out);
  if (!numFolded) {
    return {
      text: out,
      toOriginal: (j) => (j >= mapStart.length ? text.length : mapStart[j]!),
      toOriginalEnd: (j) => (j >= mapEnd.length ? text.length : mapEnd[j]!),
    };
  }
  const finalStart = numFolded.mapStart.map((idx) => (idx >= mapStart.length ? text.length : mapStart[idx]!));
  const finalEnd = numFolded.mapEnd.map((idx) =>
    idx <= 0 ? 0 : idx > mapEnd.length ? text.length : mapEnd[idx - 1]!,
  );
  return {
    text: numFolded.text,
    toOriginal: (j) => (j >= finalStart.length ? text.length : finalStart[j]!),
    toOriginalEnd: (j) => (j >= finalEnd.length ? text.length : finalEnd[j]!),
  };
}

/** Keeps only the characters `keep` accepts, with a map back to their original offsets. */
function compact(text: string, keep: RegExp): { out: string; map: number[] } {
  let out = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (keep.test(ch)) {
      out += ch.toUpperCase();
      map.push(i);
    }
  }
  return { out, map };
}

function findWords(text: string, value: string, type: EntityType): Leak[] {
  const words = canonical(value, type).split(' ').filter(Boolean);
  if (words.join('').length < 3) return [];
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])${words.map(escape).join('[^\\p{L}\\p{N}]+')}(?![\\p{L}\\p{N}])`,
    'giu',
  );
  return [...text.matchAll(re)].map((m) => ({ value: m[0], type, index: m.index }));
}

/** Finds a protected number however it's punctuated (forward or reversed), by searching a digits-only (or alphanumeric) copy. */
function findCodes(text: string, value: string, type: EntityType): Leak[] {
  let needle = canonical(value, type);
  if (type === 'PHONE') needle = needle.replace(/^0/, '');
  if (needle.length < 6) return [];
  const { out, map } = compact(text, type === 'PHONE' ? /\d/ : /[A-Za-z0-9]/);
  const needles = [needle];
  const rev = reverseStr(needle);
  if (rev !== needle) needles.push(rev);
  const leaks: Leak[] = [];
  for (const n of needles) {
    for (let i = out.indexOf(n); i !== -1; i = out.indexOf(n, i + n.length)) {
      const start = map[i]!;
      const end = map[i + n.length - 1]! + 1;
      leaks.push({ value: text.slice(start, end), type, index: start });
    }
  }
  return leaks;
}

/** Searches for the reversed form of a protected text value (min 6 alphanumeric chars, word-bounded). */
function findReversedWords(text: string, value: string, type: EntityType): Leak[] {
  const can = canonical(value, type);
  if (can.replace(/\s+/g, '').length < 6) return [];
  const rev = reverseStr(value.trim());
  if (canonical(rev, type) === can) return [];
  return findWords(text, rev, type);
}

/** Searches for standard or URL-safe Base64 encodings of a protected value (min 6 raw bytes -> 8 b64 chars). */
function findBase64(text: string, value: string, type: EntityType): Leak[] {
  const trimmed = value.trim();
  const candidates = new Set<string>();
  if (trimmed.length >= 6) {
    candidates.add(trimmed);
    candidates.add(trimmed.toLowerCase());
  }
  if (type === 'PHONE' || type === 'IBAN' || type === 'NATIONAL_ID' || type === 'CARD' || type === 'SECRET') {
    const can = canonical(value, type);
    if (can.length >= 6) candidates.add(can);
  }
  const needles = new Set<string>();
  for (const raw of candidates) {
    const std = toBase64(raw).replace(/=+$/, '');
    if (std.length >= 8) {
      needles.add(std);
      needles.add(std.replace(/\+/g, '-').replace(/\//g, '_'));
    }
  }
  const leaks: Leak[] = [];
  for (const needle of needles) {
    for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) {
      let end = i + needle.length;
      while (end < text.length && end < i + needle.length + 2 && text[end] === '=') end++;
      leaks.push({ value: text.slice(i, end), type, index: i });
    }
  }
  return leaks;
}

/**
 * Finds a protected PERSON name split mid-word across a line break ("Kar\nim Fat\nhy").
 * Runs only on multi-line text, requires strict letter boundaries and a line break inside the span,
 * and rejects spans containing punctuation so ordinary prose like "Simona\nAdelaide" is never blocked.
 */
function findLineSplitName(text: string, value: string): Leak[] {
  if (!text.includes('\n') && !text.includes('\r')) return [];
  const needle = canonical(value, 'PERSON').replace(/[^\p{L}]/gu, '').toUpperCase();
  if (needle.length < 6) return [];
  const { out, map } = compact(text, /\p{L}/u);
  const leaks: Leak[] = [];
  for (let i = out.indexOf(needle); i !== -1; i = out.indexOf(needle, i + needle.length)) {
    const start = map[i]!;
    const end = map[i + needle.length - 1]! + 1;
    const slice = text.slice(start, end);
    if (!/[\r\n]/.test(slice)) continue;
    if (start > 0 && /\p{L}/u.test(text[start - 1]!)) continue;
    if (end < text.length && /\p{L}/u.test(text[end]!)) continue;
    if (!/^[\p{L}\s-]+$/u.test(slice)) continue;
    leaks.push({ value: slice, type: 'PERSON', index: start });
  }
  return leaks;
}

/** An email written defanged: "mona [dot] adel [at] example [dot] com". */
function findDefanged(text: string, value: string): Leak[] {
  // Blank the bracketed words without changing lengths, then search the letters and digits only.
  const blanked = text.replace(/[[({]\s*(?:at|dot)\s*[\])}]/gi, (m) => ' '.repeat(m.length));
  return findCompact(blanked, value, 'EMAIL').map((l) => ({
    ...l,
    value: text.slice(l.index, l.index + l.value.length),
  }));
}

/** Searches the letters and digits of a value in the letters and digits of the text. */
function findCompact(text: string, value: string, type: EntityType): Leak[] {
  const needle = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (needle.length < 6) return [];
  const { out, map } = compact(text, /[A-Za-z0-9]/);
  const leaks: Leak[] = [];
  for (let i = out.indexOf(needle); i !== -1; i = out.indexOf(needle, i + needle.length)) {
    const start = map[i]!;
    const end = map[i + needle.length - 1]! + 1;
    leaks.push({ value: text.slice(start, end), type, index: start });
  }
  return leaks;
}

function findAmount(text: string, value: string): Leak[] {
  const amount = Number(canonical(value, 'MONEY').split(':')[1]);
  if (!Number.isFinite(amount) || amount === 0) return [];
  const out: Leak[] = [];
  for (const m of text.matchAll(/(?<![\d.,])\d[\d,]*(?:\.\d+)?(?![\d%])/g)) {
    if (Number(m[0].replace(/,/g, '')) === amount)
      out.push({ value: m[0], type: 'MONEY', index: m.index });
  }
  return out;
}

export function checkOutbound(
  outbound: string,
  protectedEntities: Entity[],
  opts: { knownTags?: Iterable<string>; allowed?: Entity[]; custom?: readonly CustomRule[] } = {},
): { ok: boolean; leaks: Leak[] } {
  // Everything below reads the guard view, so invisible characters and lookalikes can't hide a value.
  const view = guardView(withoutTags(outbound, opts.knownTags));
  const text = view.text;
  const allowed = opts.allowed ?? [];
  const amountOf = (v: string) => Number(canonical(v, 'MONEY').split(':')[1]);
  const isAllowed = (l: Leak) =>
    allowed.some((a) =>
      a.type === 'MONEY' && l.type === 'MONEY'
        ? amountOf(a.value) === amountOf(l.value)
        : a.type === l.type && canonical(a.value, a.type) === canonical(l.value, l.type),
    );
  protectedEntities = protectedEntities.filter(
    (p) =>
      !allowed.some(
        (a) => a.type === p.type && canonical(a.value, a.type) === canonical(p.value, p.type),
      ),
  );
  // Deduplicate repeated occurrences of the same protected entity value so long documents stay O(unique).
  const seenEntity = new Set<string>();
  const uniqueProtected: Entity[] = [];
  for (const p of protectedEntities) {
    const k = `${p.type}:${p.value.trim()}`;
    if (!seenEntity.has(k)) {
      seenEntity.add(k);
      uniqueProtected.push(p);
    }
  }
  const found: Leak[] = detectWithRules(text, { custom: opts.custom }).map((e) => ({
    value: e.value,
    type: e.type,
    index: e.start,
  }));

  for (const p of uniqueProtected) {
    found.push(...findBase64(text, p.value, p.type));
    switch (p.type) {
      case 'PHONE':
      case 'IBAN':
      case 'NATIONAL_ID':
      case 'CARD':
      case 'SECRET':
        found.push(...findCodes(text, p.value, p.type));
        break;
      case 'MONEY':
        found.push(...findAmount(text, p.value));
        break;
      case 'EMAIL':
        found.push(
          ...findWords(text, p.value, p.type),
          ...findDefanged(text, p.value),
          ...findReversedWords(text, p.value, p.type),
        );
        break;
      case 'PERSON':
        found.push(
          ...findWords(text, p.value, p.type),
          ...findReversedWords(text, p.value, p.type),
          ...findLineSplitName(text, p.value),
        );
        break;
      default:
        found.push(
          ...findWords(text, p.value, p.type),
          ...findReversedWords(text, p.value, p.type),
        );
        // A value with digits in it (a token, a reference) is searched compacted too, so T-O-K-E-N-9-9 is caught.
        if (/\d/.test(p.value)) found.push(...findCompact(text, p.value, p.type));
    }
  }

  const leaks: Leak[] = [];
  for (const l of found.sort((a, b) => a.index - b.index || b.value.length - a.value.length)) {
    const covered = leaks.some(
      (k) => l.index >= k.index && l.index + l.value.length <= k.index + k.value.length,
    );
    if (!covered && !isAllowed(l)) leaks.push(l);
  }
  // Report each leak as it appears in the outbound text (with any hidden characters), at its real offset.
  const mapped = leaks.map((l) => {
    const start = view.toOriginal(l.index);
    const end = l.value.length ? view.toOriginalEnd(l.index + l.value.length - 1) : start;
    return { ...l, value: outbound.slice(start, Math.max(end, start)), index: start };
  });
  return { ok: mapped.length === 0, leaks: mapped };
}

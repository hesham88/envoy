/**
 * Other readings of the outbound text, so a value can't slip past the guard by being written
 * differently: number words folded into digits, names joined across a line break inside a word,
 * the text reversed, and base64 blobs decoded. Each reading maps its offsets back to the text the
 * guard checks, so a leak is still reported where it really is.
 *
 * The guard fails closed on what it can't read: a base64 blob that decodes to readable text is
 * blocked even when nothing protected is found inside it.
 */

export interface Reading {
  text: string;
  /** Maps a span in this reading back to [start, end) in the original text. */
  span: (index: number, length: number) => [number, number];
}

/** Rewrites every match of `re`, keeping a map from each output character to its source offset. */
function rewrite(
  text: string,
  re: RegExp,
  replace: (m: RegExpExecArray) => string | null,
): Reading {
  let out = '';
  const map: number[] = [];
  let at = 0;
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const r = replace(m);
    if (r === null) continue;
    for (let i = at; i < m.index; i++) {
      out += text[i];
      map.push(i);
    }
    for (let k = 0; k < r.length; k++) map.push(m.index + Math.min(k, m[0].length - 1));
    out += r;
    at = m.index + m[0].length;
  }
  for (let i = at; i < text.length; i++) {
    out += text[i];
    map.push(i);
  }
  map.push(text.length);
  return {
    text: out,
    span: (index, length) => {
      const start = map[index] ?? text.length;
      const last = map[Math.max(index, index + length - 1)] ?? text.length;
      return [start, Math.max(start, last + 1)];
    },
  };
}

// ---------- number words ----------

const UNITS: Record<string, number> = {
  zero: 0,
  oh: 0,
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
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1_000_000 };
const WORD = `(?:${[...Object.keys(UNITS), ...Object.keys(SCALES)].join('|')})`;
const NUMBER_WORDS = new RegExp(`\\b${WORD}(?:(?:[\\s,-]+(?:and[\\s-]+)?)${WORD})*\\b`, 'gi');
const DIGIT_WORDS = new Set([
  'zero',
  'oh',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
]);

/** "two seven five zero" -> "2750"; "eight thousand five hundred" -> "8500". */
export function numberWordsToDigits(phrase: string): string {
  const words = phrase
    .toLowerCase()
    .split(/[\s,-]+/)
    .filter((w) => w && w !== 'and');
  if (words.length > 1 && words.every((w) => DIGIT_WORDS.has(w)))
    return words.map((w) => String(UNITS[w])).join('');
  let total = 0;
  let current = 0;
  for (const w of words) {
    if (w in UNITS) current += UNITS[w]!;
    else if (w === 'hundred') current = (current || 1) * 100;
    else {
      total += (current || 1) * SCALES[w]!;
      current = 0;
    }
  }
  return String(total + current);
}

export const numberWordsReading = (text: string): Reading =>
  rewrite(text, NUMBER_WORDS, (m) => numberWordsToDigits(m[0]));

// ---------- a word split across lines ----------

/** Joins letters split by a line break inside a word: "Kar\nim" -> "Karim". */
export const joinedLinesReading = (text: string): Reading =>
  rewrite(text, /(\p{L})[ \t]*\r?\n[ \t]*(?=\p{L})/gu, (m) => m[1]!);

// ---------- letter by letter ----------

/**
 * Closes up text written one character at a time: "K a r i m F a t h y" -> "KarimFathy",
 * "E G P 8 , 5 0 0" -> "EGP8,500". Only runs of at least four single characters are touched, so
 * ordinary words ("a", "I") are left alone.
 */
export const spacedLettersReading = (text: string): Reading =>
  rewrite(text, /(?<!\S)(?:[\p{L}\p{N},.@+-] ){3,}[\p{L}\p{N},.@+-](?!\S)/gu, (m) =>
    m[0].replace(/ /g, ''),
  );

// ---------- percent-encoding ----------

/**
 * Tokens with percent-encoded bytes ("mona%2Eadel%40example%2Ecom"), decoded. Unlike base64 these
 * are checked, not blocked on sight: a document's own URLs carry %20 and the like.
 */
export function percentBlobs(text: string): { start: number; end: number; decoded: string }[] {
  const out: { start: number; end: number; decoded: string }[] = [];
  for (const m of text.matchAll(/\S*(?:%[0-9A-Fa-f]{2})\S*/g)) {
    try {
      const decoded = decodeURIComponent(m[0]);
      if (decoded !== m[0]) out.push({ start: m.index, end: m.index + m[0].length, decoded });
    } catch {
      // not valid percent-encoding
    }
  }
  return out;
}

// ---------- reversed ----------

export function reversedReading(text: string): Reading {
  const chars = [...text];
  const offsets: number[] = [];
  let o = 0;
  for (const c of chars) {
    offsets.push(o);
    o += c.length;
  }
  const n = chars.length;
  const reversed = chars.reverse().join('');
  // Code points reversed; for the BMP text the guard sees, string index = code point index.
  return {
    text: reversed,
    span: (index, length) => {
      const a = n - (index + length);
      const b = n - index;
      return [offsets[a] ?? 0, a === b ? (offsets[a] ?? 0) : (offsets[b - 1] ?? 0) + 1];
    },
  };
}

// ---------- base64 ----------

const BASE64 = /(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{8,}={0,2}(?![A-Za-z0-9+/=])/g;

function decodeBase64(token: string): string | null {
  // 12+ characters (at least 9 encoded bytes): shorter tokens are ordinary words far more often than
  // encodings ("Question" is valid base64 and decodes to two CJK/Arabic characters).
  if (token.length < 12 || token.length % 4 !== 0) return null;
  try {
    const bin = atob(token);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Readable text: almost all printable ASCII, with letters or digits in it.
    const printable = [...text].filter((c) => /[\x20-\x7e\t\r\n]/.test(c)).length;
    if (printable / text.length < 0.9) return null;
    return /[A-Za-z0-9]{2,}/.test(text) ? text : null;
  } catch {
    return null;
  }
}

/** Base64 blobs that decode to readable text, with where they are. */
export function encodedBlobs(text: string): { start: number; end: number; decoded: string }[] {
  const out: { start: number; end: number; decoded: string }[] = [];
  for (const m of text.matchAll(BASE64)) {
    const decoded = decodeBase64(m[0]);
    if (decoded) out.push({ start: m.index, end: m.index + m[0].length, decoded });
  }
  return out;
}

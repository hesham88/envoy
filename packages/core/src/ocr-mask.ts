/**
 * Masks for a photo of a document: OCR words (with their boxes) in, one box per private detail out.
 * The words are joined into text exactly as a person reads them, Envoy's own detectors (and the
 * person's rules) run on that text, and every finding is mapped back to the words it covers.
 * Pure: no OCR, no network. The OCR engine lives in the app (self-hosted, on the device).
 */
import { scanText, type ScanOptions } from './scan';
import type { EntityType } from './types';

export interface OcrWord {
  text: string;
  /** Line index on the page; words of one line share it. */
  line: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface MaskBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** What was found; BARCODE comes from the barcode reader and FACE from the face detector, not the text. */
  type: EntityType | 'BARCODE' | 'FACE';
  value: string;
  /** Burned in when sent. The person can switch a box off to keep that text visible. */
  on: boolean;
}

export function ocrText(words: readonly OcrWord[]): {
  text: string;
  offsets: Array<{ start: number; end: number; word: number }>;
} {
  let text = '';
  const offsets: Array<{ start: number; end: number; word: number }> = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    // OCR reads a tight kerning gap as a space: "adel. mansour@example.com". Pieces of an email
    // are glued back together so the email is found whole.
    const glue =
      prev?.line === w.line &&
      ((/[._-]$/.test(prev.text) && w.text.includes('@')) ||
        prev.text.endsWith('@') ||
        w.text.startsWith('@'));
    if (prev) text += prev.line !== w.line ? '\n' : glue ? '' : ' ';
    offsets.push({ start: text.length, end: text.length + w.text.length, word: i });
    text += w.text;
  });
  return { text, offsets };
}

const MASK_LABEL: Record<string, string> = {
  PERSON: 'Name',
  ORG: 'Organisation',
  ADDRESS: 'Address',
  EMAIL: 'Email',
  PHONE: 'Phone',
  NATIONAL_ID: 'National ID',
  IBAN: 'Bank account (IBAN)',
  ACCOUNT: 'Account or record no.',
  CARD: 'Card number',
  MONEY: 'Amount',
  DATE: 'Date',
  SECRET: 'Key or password',
  CUSTOM: 'Your rule',
};

/** What a mask hides, in plain words ("National ID", "QR code", "Your box"). */
export function maskLabel(b: MaskBox): string {
  if (b.type === 'BARCODE' || b.type === 'FACE') return b.value;
  if (b.type === 'CUSTOM' && b.value === 'Your box') return 'Your box';
  return MASK_LABEL[b.type] ?? 'Private detail';
}

/** Details that can wrap onto the next line of a page. */
const WRAPS = new Set<string>(['IBAN', 'CARD', 'ACCOUNT', 'PHONE', 'EMAIL', 'DATE', 'MONEY', 'ADDRESS']);

export function ocrMask(
  words: readonly OcrWord[],
  opts: ScanOptions & { pad?: number } = {},
): { text: string; boxes: MaskBox[] } {
  const { text, offsets } = ocrText(words);
  if (!text.trim()) return { text, boxes: [] };
  const pad = opts.pad ?? 4;
  const boxes: MaskBox[] = [];
  // Names and addresses end at a line break. Numbers and emails can wrap (an IBAN across two lines,
  // each half alone not looking like one), so those are also searched with line breaks read as
  // spaces: same length, so offsets still map to words.
  const inLine = scanText(text, opts).findings;
  const wrapped = scanText(text.replace(/\n/g, ' '), { ...opts, names: false }).findings.filter(
    (f) => {
      const span = text.slice(f.start, f.end);
      if (!WRAPS.has(f.type) || !span.includes('\n')) return false;
      // An address continues on the next line only after a comma ("Maadi,\nCairo"), so the
      // label on the line below ("Cairo\nMRN") is never taken into it.
      return f.type !== 'ADDRESS' || /^[^\n]*(,\n[^\n]*)+$/.test(span);
    },
  );
  const findings = [
    ...inLine.filter((k) => !wrapped.some((w) => w.start < k.end && k.start < w.end)),
    ...wrapped,
  ];
  const seen = new Set<string>();
  for (const f of findings) {
    // Words this detail covers, grouped by line: one box per line, so a wrapped detail never
    // turns into one big box over the text between its lines.
    const byLine = new Map<number, OcrWord['bbox'][]>();
    for (const o of offsets) {
      if (o.end <= f.start || o.start >= f.end) continue;
      const w = words[o.word]!;
      byLine.set(w.line, [...(byLine.get(w.line) ?? []), w.bbox]);
    }
    for (const bbs of byLine.values()) {
      const x0 = Math.max(0, Math.min(...bbs.map((b) => b.x0)) - pad);
      const y0 = Math.max(0, Math.min(...bbs.map((b) => b.y0)) - pad);
      const x1 = Math.max(...bbs.map((b) => b.x1)) + pad;
      const y1 = Math.max(...bbs.map((b) => b.y1)) + pad;
      const key = `${x0},${y0},${x1},${y1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, type: f.type, value: f.value, on: true });
    }
  }
  return { text, boxes };
}

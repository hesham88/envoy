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
  /** What was found; BARCODE comes from the barcode reader, not the text. */
  type: EntityType | 'BARCODE';
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
    if (i > 0) text += words[i - 1]!.line === w.line ? ' ' : '\n';
    offsets.push({ start: text.length, end: text.length + w.text.length, word: i });
    text += w.text;
  });
  return { text, offsets };
}

export function ocrMask(
  words: readonly OcrWord[],
  opts: ScanOptions & { pad?: number } = {},
): { text: string; boxes: MaskBox[] } {
  const { text, offsets } = ocrText(words);
  if (!text.trim()) return { text, boxes: [] };
  const pad = opts.pad ?? 4;
  const boxes: MaskBox[] = [];
  // Line breaks read as spaces (same length, so offsets still map to words): a photo wraps an IBAN
  // or an address across lines, and each half alone may not look like one.
  for (const f of scanText(text.replace(/\n/g, ' '), opts).findings) {
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
      boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, type: f.type, value: f.value, on: true });
    }
  }
  return { text, boxes };
}

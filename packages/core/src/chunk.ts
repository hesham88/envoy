import type { Chunk } from './types';

const PAGE_MARKER = /^[ \t]*-{3}[ \t]*Page[ \t]*(\d+)[ \t]*-{3}[ \t]*$/gim;
const CLAUSE_START = /^[ \t]*(\d{1,2})\.[ \t]/gm;

/** About four characters per token: a deliberate over-estimate for English. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

interface Marker {
  start: number;
  end: number;
  page: number;
}

function pageMarkers(text: string): Marker[] {
  return [...text.matchAll(PAGE_MARKER)].map((m) => ({ start: m.index, end: m.index + m[0].length, page: Number(m[1]) }));
}

/** Shrinks [start, end) past surrounding whitespace and page markers. */
function trim(text: string, start: number, end: number, markers: Marker[]): [number, number] {
  let s = start;
  let e = end;
  for (let changed = true; changed; ) {
    changed = false;
    while (s < e && /\s/.test(text[s]!)) s++;
    while (e > s && /\s/.test(text[e - 1]!)) e--;
    for (const m of markers) {
      if (m.start === s && m.end <= e) {
        s = m.end;
        changed = true;
      }
      if (m.end === e && m.start >= s) {
        e = m.start;
        changed = true;
      }
    }
  }
  return [s, e];
}

function pageAt(offset: number, markers: Marker[]): number {
  let page = 1;
  for (const m of markers) if (m.start <= offset) page = m.page;
  return page;
}

/** Splits a document into numbered clauses (or paragraphs when it has none), with source offsets and pages. */
export function chunkDocument(text: string): Chunk[] {
  const markers = pageMarkers(text);
  const spans: { start: number; end: number; label: string }[] = [];
  const clauseStarts = [...text.matchAll(CLAUSE_START)].map((m) => ({ at: m.index, n: m[1]! }));

  if (clauseStarts.length > 0) {
    spans.push({ start: 0, end: clauseStarts[0]!.at, label: 'Preamble' });
    clauseStarts.forEach((c, i) => {
      spans.push({ start: c.at, end: clauseStarts[i + 1]?.at ?? text.length, label: `Clause ${c.n}` });
    });
  } else {
    const breaks = [...text.matchAll(/\n[ \t]*\n/g)];
    let from = 0;
    let n = 0;
    for (const b of [...breaks.map((x) => x.index), text.length]) {
      spans.push({ start: from, end: b, label: `Paragraph ${++n}` });
      from = b;
    }
  }

  const chunks: Chunk[] = [];
  for (const span of spans) {
    const [s, e] = trim(text, span.start, span.end, markers);
    if (s >= e) continue;
    const label = span.label.startsWith('Paragraph') ? `Paragraph ${chunks.length + 1}` : span.label;
    chunks.push({ id: chunks.length + 1, label, text: text.slice(s, e), start: s, end: e, page: pageAt(s, markers) });
  }
  return chunks;
}

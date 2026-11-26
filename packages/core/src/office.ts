/**
 * Office documents (.docx, .xlsx, .pptx) read on the device, with no dependency: a minimal ZIP
 * reader (central directory, stored or deflate via DecompressionStream) and the text of the parts
 * that hold what people write. Nothing here touches the network.
 *
 * What is read:
 * - .docx: the body, headers, footers, footnotes, endnotes and comments (private details often sit
 *   in a letterhead or a comment, not only in the body).
 * - .xlsx: every sheet, one line per row, cells separated by " | ", shared and inline strings.
 * - .pptx: every slide in order, then its speaker notes.
 *
 * Limits keep a hostile file (a "zip bomb") from exhausting memory: at most 4,000 entries, 10 MB
 * per part once inflated, 40 MB in all, and a part may not inflate more than 250 times its size.
 */
export type OfficeKind = 'docx' | 'xlsx' | 'pptx';

export class OfficeReadError extends Error {
  override name = 'OfficeReadError';
}

export interface ZipEntry {
  name: string;
  method: number;
  compressed: Uint8Array;
  size: number;
}

const MAX_ENTRIES = 4000;
const MAX_PART_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_RATIO = 250;

export function officeKindOf(name: string): OfficeKind | null {
  const m = /\.(docx|xlsx|pptx)$/i.exec(name);
  return m ? (m[1]!.toLowerCase() as OfficeKind) : null;
}

export function readZipEntries(buf: ArrayBuffer): ZipEntry[] {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= 0 && i >= b.length - 22 - 0xffff; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new OfficeReadError('Not a ZIP file.');
  const count = dv.getUint16(eocd + 10, true);
  if (count > MAX_ENTRIES) throw new OfficeReadError('This file has too many parts to read.');
  let off = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (off < 0 || off + 46 > b.length || dv.getUint32(off, true) !== 0x02014b50)
      throw new OfficeReadError('Corrupt ZIP central directory.');
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const size = dv.getUint32(off + 24, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extra = dv.getUint16(off + 30, true);
    const comment = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    if (off + 46 + nameLen > b.length || localOff < 0 || localOff + 30 > b.length)
      throw new OfficeReadError('Corrupt ZIP entry header.');
    const name = new TextDecoder().decode(b.slice(off + 46, off + 46 + nameLen));
    const lname = dv.getUint16(localOff + 26, true);
    const lextra = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lname + lextra;
    if (dataStart < 0 || dataStart + csize > b.length)
      throw new OfficeReadError('Corrupt ZIP entry data.');
    out.push({ name, method, size, compressed: b.slice(dataStart, dataStart + csize) });
    off += 46 + nameLen + extra + comment;
  }
  return out;
}

/** Inflate one part as UTF-8 text, within the size limits. */
export async function inflate(entry: ZipEntry, budget = { left: MAX_TOTAL_BYTES }): Promise<string> {
  if (entry.size > MAX_PART_BYTES || entry.size > budget.left)
    throw new OfficeReadError('This file is larger than Envoy reads on a device (10 MB a part).');
  if (entry.compressed.byteLength > 0 && entry.size / entry.compressed.byteLength > MAX_RATIO)
    throw new OfficeReadError('This file expands far beyond its size; Envoy did not open it.');
  let bytes: Uint8Array;
  if (entry.method === 0) bytes = entry.compressed;
  else if (entry.method === 8) {
    const stream = new Blob([entry.compressed as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else throw new OfficeReadError(`Unsupported ZIP method ${entry.method}.`);
  // The header's size can lie: check what actually came out.
  if (bytes.byteLength > MAX_PART_BYTES || bytes.byteLength > budget.left)
    throw new OfficeReadError('This file is larger than Envoy reads on a device (10 MB a part).');
  budget.left -= bytes.byteLength;
  return new TextDecoder().decode(bytes);
}

export function decodeXmlText(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Text runs of a WordprocessingML or DrawingML part, with paragraphs, tabs and line breaks. */
function runsToText(xml: string, ns: 'w' | 'a'): string {
  const re =
    ns === 'w'
      ? /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<\/w:p>/g
      : /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>|<a:br\/>|<\/a:p>/g;
  let out = '';
  for (const m of xml.matchAll(re)) {
    if (m[1] !== undefined) out += decodeXmlText(m[1]);
    else if (m[0].endsWith(':tab/>')) out += '\t';
    else if (m[0].endsWith(':br/>')) out += '\n';
    else out += '\n';
  }
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const numbered = (prefix: string, suffix = '.xml') => (a: string, b: string) => {
  const n = (s: string) => Number(s.slice(prefix.length, -suffix.length)) || 0;
  return n(a) - n(b);
};

async function docx(entries: Map<string, ZipEntry>, budget: { left: number }): Promise<string> {
  const body = entries.get('word/document.xml');
  if (!body) throw new OfficeReadError('This .docx has no document body.');
  const extra = [...entries.keys()]
    .filter((n) =>
      /^word\/(header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/.test(n),
    )
    .sort();
  const parts = [runsToText(await inflate(body, budget), 'w')];
  for (const name of extra) {
    const text = runsToText(await inflate(entries.get(name)!, budget), 'w');
    if (!text) continue;
    const label = /header/.test(name)
      ? 'Header'
      : /footer/.test(name)
        ? 'Footer'
        : /comments/.test(name)
          ? 'Comments'
          : 'Notes';
    parts.push(`--- ${label} ---\n${text}`);
  }
  return parts.filter(Boolean).join('\n\n');
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

async function xlsx(entries: Map<string, ZipEntry>, budget: { left: number }): Promise<string> {
  const shared: string[] = [];
  const sst = entries.get('xl/sharedStrings.xml');
  if (sst) {
    for (const si of (await inflate(sst, budget)).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      let s = '';
      for (const t of si[1]!.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)) s += decodeXmlText(t[1]!);
      shared.push(s);
    }
  }
  const names: string[] = [];
  const wb = entries.get('xl/workbook.xml');
  if (wb)
    for (const m of (await inflate(wb, budget)).matchAll(/<sheet\s[^>]*name="([^"]*)"/g))
      names.push(decodeXmlText(m[1]!));
  const sheets = [...entries.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort(numbered('xl/worksheets/sheet'));
  if (!sheets.length) throw new OfficeReadError('This .xlsx has no sheets.');
  const out: string[] = [];
  for (const [i, name] of sheets.entries()) {
    const xml = await inflate(entries.get(name)!, budget);
    const lines: string[] = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1] ?? '';
        const inner = c[2] ?? '';
        const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? '';
        const type = /\bt="(\w+)"/.exec(attrs)?.[1];
        let value = '';
        if (type === 'inlineStr') {
          for (const t of inner.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g))
            value += decodeXmlText(t[1]!);
        } else {
          const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1];
          if (v !== undefined)
            value = type === 's' ? (shared[Number(v)] ?? '') : decodeXmlText(v);
        }
        if (!value) continue;
        const at = ref ? colIndex(ref) : cells.length;
        while (cells.length < at) cells.push('');
        cells[at] = value;
      }
      if (cells.some(Boolean)) lines.push(cells.join(' | ').replace(/(\s\|\s)+$/, ''));
    }
    if (lines.length) out.push(`--- Sheet: ${names[i] ?? `Sheet ${i + 1}`} ---\n${lines.join('\n')}`);
  }
  return out.join('\n\n');
}

async function pptx(entries: Map<string, ZipEntry>, budget: { left: number }): Promise<string> {
  const slides = [...entries.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort(numbered('ppt/slides/slide'));
  if (!slides.length) throw new OfficeReadError('This .pptx has no slides.');
  const out: string[] = [];
  for (const [i, name] of slides.entries()) {
    const n = name.slice('ppt/slides/slide'.length, -4);
    let text = runsToText(await inflate(entries.get(name)!, budget), 'a');
    const notes = entries.get(`ppt/notesSlides/notesSlide${n}.xml`);
    if (notes) {
      const t = runsToText(await inflate(notes, budget), 'a');
      if (t) text += `\nNotes: ${t}`;
    }
    if (text) out.push(`--- Slide ${i + 1} ---\n${text}`);
  }
  return out.join('\n\n');
}

/** The text of a .docx, .xlsx or .pptx, read on this device. `parts` counts slides or sheets. */
export async function officeToText(
  buf: ArrayBuffer,
  kind: OfficeKind,
): Promise<{ text: string; parts: number }> {
  const entries = new Map(readZipEntries(buf).map((e) => [e.name, e]));
  const budget = { left: MAX_TOTAL_BYTES };
  const text =
    kind === 'docx'
      ? await docx(entries, budget)
      : kind === 'xlsx'
        ? await xlsx(entries, budget)
        : await pptx(entries, budget);
  const parts = (text.match(/^--- (Slide|Sheet)/gm) ?? []).length || 1;
  return { text, parts };
}

/** Back-compat for the extension: a .docx as plain text. */
export async function docxToText(buf: ArrayBuffer): Promise<string> {
  return (await officeToText(buf, 'docx')).text;
}

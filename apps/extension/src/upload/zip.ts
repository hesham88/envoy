// Minimal ZIP reading for DOCX-as-text (no dependency): central directory + deflate via DecompressionStream.
export interface ZipEntry { name: string; method: number; compressed: Uint8Array; size: number }

export function readZipEntries(buf: ArrayBuffer): ZipEntry[] {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('Not a ZIP file.');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const size = dv.getUint32(off + 24, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extra = dv.getUint16(off + 30, true);
    const comment = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(b.slice(off + 46, off + 46 + nameLen));
    const lname = dv.getUint16(localOff + 26, true);
    const lextra = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lname + lextra;
    out.push({ name, method, size, compressed: b.slice(dataStart, dataStart + csize) });
    off += 46 + nameLen + extra + comment;
  }
  return out;
}

export async function inflate(entry: ZipEntry): Promise<string> {
  if (entry.method === 0) return new TextDecoder().decode(entry.compressed);
  if (entry.method !== 8) throw new Error(`Unsupported ZIP method ${entry.method}.`);
  const stream = new Blob([entry.compressed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/** DOCX -> plain text: paragraphs from word/document.xml, tags stripped, entities decoded. */
export async function docxToText(buf: ArrayBuffer): Promise<string> {
  const entries = readZipEntries(buf);
  const doc = entries.find((e) => e.name === 'word/document.xml');
  if (!doc) throw new Error('No word/document.xml in this DOCX.');
  const xml = await inflate(doc);
  return xml
    .replace(/<w:p[ >]/g, '\n<w:p ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

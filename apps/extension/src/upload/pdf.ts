// Honest PDF handling: Envoy never paints boxes over live PDF text. It rebuilds a
// NEW, simple text-only PDF from the masked text and says "layout simplified".

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

const LINES_PER_PAGE = 52;
const CHARS_PER_LINE = 92;

export function wrapText(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (!para) { out.push(''); continue; }
    for (let i = 0; i < para.length; i += CHARS_PER_LINE) out.push(para.slice(i, i + CHARS_PER_LINE));
  }
  return out;
}

/** Builds a minimal multi-page text PDF (uncompressed streams, Helvetica). */
export function buildTextPdf(text: string): Blob {
  const lines = wrapText(text);
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) pages.push(lines.slice(i, i + LINES_PER_PAGE));
  if (pages.length === 0) pages.push(['']);
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4] = '<< /Length 44 >> stream\nBT /F1 10 Tf 14 TL ET\nendstream';
  pages.forEach((pageLines, i) => {
    const pageId = pageIds[i] ?? 5;
    const contentId = pageId + 1;
    const content = ['BT', '/F1 10 Tf', '48 792 Td', '14 TL', ...pageLines.map((l) => `(${esc(l)}) Tj T*`), 'ET'].join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${content.length} >> stream\n${content}\nendstream`;
  });
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i++) {
    if (!objects[i]) continue;
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefAt = pdf.length;
  const maxId = objects.length - 1;
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxId; i++) pdf += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

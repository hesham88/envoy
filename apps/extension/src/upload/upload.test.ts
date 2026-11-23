import { describe, expect, it } from 'vitest';
import { buildTextPdf, wrapText } from './pdf';
import { processTextUpload } from './process';

async function makeDocx(text: string): Promise<File> {
  // Stored (method 0) ZIP with a minimal word/document.xml.
  const enc = new TextEncoder();
  const xml = `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
  const data = enc.encode(xml);
  const name = enc.encode('word/document.xml');
  const local = new Uint8Array(30 + name.length + data.length);
  const dv = new DataView(local.buffer);
  dv.setUint32(0, 0x04034b50, true);
  dv.setUint16(8, 0, true);
  dv.setUint32(18, data.length, true);
  dv.setUint32(22, data.length, true);
  dv.setUint16(26, name.length, true);
  local.set(name, 30);
  local.set(data, 30 + name.length);
  const central = new Uint8Array(46 + name.length);
  const cd = new DataView(central.buffer);
  cd.setUint32(0, 0x02014b50, true);
  cd.setUint32(20, data.length, true);
  cd.setUint32(24, data.length, true);
  cd.setUint16(28, name.length, true);
  central.set(name, 46);
  const eocd = new Uint8Array(22);
  const ed = new DataView(eocd.buffer);
  ed.setUint32(0, 0x06054b50, true);
  ed.setUint16(8, 1, true);
  ed.setUint16(10, 1, true);
  ed.setUint32(12, central.length, true);
  ed.setUint32(16, local.length, true);
  const all = new Uint8Array(local.length + central.length + eocd.length);
  all.set(local, 0);
  all.set(central, local.length);
  all.set(eocd, local.length + central.length);
  return new File([all], 'lease.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

describe('upload processing privacy', () => {
  it('masks a DOCX-as-text and the private text is gone', async () => {
    const docx = await makeDocx('Tenant mona.adel@example.com owes EGP 8,500');
    const { file, receipt } = await processTextUpload(docx, [], new Set());
    const out = await file.text();
    expect(out).not.toContain('mona.adel@example.com');
    expect(out).toContain('[EMAIL]');
    expect(receipt.removed).toBeGreaterThan(0);
    expect(file.name).toBe('lease.txt');
  });

  it('writes exact byte offsets even for non-ASCII text', async () => {
    const pdf = buildTextPdf('Rent €8,500 — “due” at the café. مرحبا');
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    const s = new TextDecoder('latin1').decode(bytes);
    expect(bytes.length).toBe(s.length); // one byte per character
    expect(s).toContain('EUR 8,500 - "due" at the cafe. ?????');
    const m = /<< \/Length (\d+) >> stream\n/.exec(s)!;
    const start = m.index + m[0].length;
    expect(s.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe('\nendstream');
    const xref = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(xref, xref + 4)).toBe('xref');
    const offsets = s
      .slice(xref)
      .match(/^\d{10} 00000 n/gm)!
      .map((l) => Number(l.slice(0, 10)));
    for (const off of offsets) expect(s.slice(off)).toMatch(/^\d+ 0 obj/);
  });

  it('rebuilt PDF contains masked text and NOT the original private text', async () => {
    const pdf = buildTextPdf('Rent is [AMOUNT], tenant [EMAIL].');
    const s = await pdf.text();
    expect(s).toContain('[AMOUNT]');
    expect(s).not.toContain('mona.adel@example.com');
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(wrapText('x'.repeat(100)).length).toBe(2);
  });

  it('kept tags stay, others are masked', async () => {
    const f = new File(['mail a@b.com or c@d.com'], 'a.txt', { type: 'text/plain' });
    const scanKeep = new Set<string>();
    const first = await processTextUpload(f, [], scanKeep);
    expect(await first.file.text()).toContain('[EMAIL]');
    expect(first.receipt.findings.length).toBe(2);
  });
});

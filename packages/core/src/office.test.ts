import { describe, expect, it } from 'vitest';
import { officeKindOf, officeToText, OfficeReadError, readZipEntries } from './office';
import { scanText } from './scan';

/** A ZIP with the given parts; `deflate` compresses them like Office does. */
async function zip(parts: Record<string, string>, deflate = true, lieSize?: number) {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [path, body] of Object.entries(parts)) {
    const raw = enc.encode(body);
    const data = deflate
      ? new Uint8Array(
          await new Response(
            new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw')),
          ).arrayBuffer(),
        )
      : raw;
    const name = enc.encode(path);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, deflate ? 8 : 0, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, deflate ? 8 : 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, lieSize ?? raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = new Uint8Array(offset + cdSize + 22);
  let at = 0;
  for (const p of [...locals, ...centrals, eocd]) {
    all.set(p, at);
    at += p.length;
  }
  return all.buffer;
}

const W = (body: string) =>
  `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`;
const P = (...runs: string[]) => `<w:p>${runs.map((r) => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`).join('')}</w:p>`;

describe('Office documents read on the device', () => {
  it('knows the three kinds by extension', () => {
    expect(officeKindOf('Lease.DOCX')).toBe('docx');
    expect(officeKindOf('payroll.xlsx')).toBe('xlsx');
    expect(officeKindOf('deck.pptx')).toBe('pptx');
    expect(officeKindOf('old.doc')).toBeNull();
  });

  it('.docx: body, split runs, tabs, entities, and the letterhead in the header', async () => {
    const buf = await zip({
      'word/document.xml': W(
        P('Tenant: Mona ', 'Adel') +
          P('Rent&#9;EGP 8,500 &amp; deposit') +
          `<w:p><w:r><w:t>IBAN EG38 0019 0005 0000 0000 2631 8000 2</w:t></w:r></w:p>`,
      ),
      'word/header1.xml': `<w:hdr>${P('Karim Fathy, karim.fathy@example.com')}</w:hdr>`,
    });
    const { text } = await officeToText(buf, 'docx');
    expect(text).toContain('Tenant: Mona Adel');
    expect(text).toContain('Rent\tEGP 8,500 & deposit');
    expect(text).toContain('--- Header ---\nKarim Fathy, karim.fathy@example.com');
    // The masking engine then sees every private detail, the header's too.
    const types = scanText(text).findings.map((f) => f.type);
    expect(types).toEqual(expect.arrayContaining(['EMAIL', 'IBAN']));
  });

  it('.xlsx: sheet names, shared and inline strings, numbers, empty cells kept in place', async () => {
    const buf = await zip({
      'xl/workbook.xml': `<workbook><sheets><sheet name="Payroll" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/sharedStrings.xml': `<sst><si><t>Name</t></si><si><t>Email</t></si><si><r><t>Mona </t></r><r><t>Adel</t></r></si><si><t>mona.adel@example.com</t></si></sst>`,
      'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Salary</t></is></c></row>
        <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c><c r="D2"><v>42000</v></c></row>
      </sheetData></worksheet>`,
    });
    const { text, parts } = await officeToText(buf, 'xlsx');
    expect(parts).toBe(1);
    expect(text).toBe(
      '--- Sheet: Payroll ---\nName | Email |  | Salary\nMona Adel | mona.adel@example.com |  | 42000',
    );
  });

  it('.pptx: slides in numeric order (slide10 after slide2), with speaker notes', async () => {
    const S = (t: string) => `<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`;
    const buf = await zip({
      'ppt/slides/slide10.xml': S('Tenth'),
      'ppt/slides/slide1.xml': S('Q3 offer for Mona Adel'),
      'ppt/slides/slide2.xml': S('Salary EGP 42,000'),
      'ppt/notesSlides/notesSlide1.xml': S('Call her at +20 100 555 0192'),
    });
    const { text, parts } = await officeToText(buf, 'pptx');
    expect(parts).toBe(3);
    expect(text.indexOf('Salary')).toBeLessThan(text.indexOf('Tenth'));
    expect(text).toContain('--- Slide 1 ---\nQ3 offer for Mona Adel\nNotes: Call her at +20 100 555 0192');
  });

  it('refuses a zip bomb and a header that lies about its size', async () => {
    const bomb = await zip({ 'word/document.xml': W(P('a'.repeat(3_000_000))) });
    await expect(officeToText(bomb, 'docx')).rejects.toThrow(/expands far beyond/);
    const liar = await zip({ 'word/document.xml': W(P('x'.repeat(400_000))) }, false, 10);
    // Stored part: claims 10 bytes; the actual bytes are checked, and it still reads within limits.
    expect((await officeToText(liar, 'docx')).text.length).toBeGreaterThan(399_000);
  });

  it('refuses something that is not a ZIP, or a ZIP without its main part', async () => {
    await expect(officeToText(new TextEncoder().encode('hello').buffer, 'docx')).rejects.toThrow(
      OfficeReadError,
    );
    const empty = await zip({ 'other.xml': '<x/>' });
    await expect(officeToText(empty, 'pptx')).rejects.toThrow(/no slides/);
    expect(readZipEntries(empty)).toHaveLength(1);
  });
});

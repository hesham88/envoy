import { describe, expect, it } from 'vitest';
import { ocrMask, ocrText, type OcrWord } from './ocr-mask';

/** Words laid out left to right on a line, 10 px per character, lines 30 px apart. */
function line(n: number, text: string, x0 = 10): OcrWord[] {
  const out: OcrWord[] = [];
  let x = x0;
  for (const w of text.split(' ')) {
    out.push({
      text: w,
      line: n,
      bbox: { x0: x, y0: n * 30, x1: x + w.length * 10, y1: n * 30 + 20 },
    });
    x += (w.length + 1) * 10;
  }
  return out;
}

describe('ocrText', () => {
  it('joins words with spaces and lines with newlines, keeping each word offset', () => {
    const words = [...line(0, 'Patient: Adel Mansour'), ...line(1, 'Phone +20 100')];
    const { text, offsets } = ocrText(words);
    expect(text).toBe('Patient: Adel Mansour\nPhone +20 100');
    expect(text.slice(offsets[1]!.start, offsets[1]!.end)).toBe('Adel');
    expect(text.slice(offsets[4]!.start, offsets[4]!.end)).toBe('+20');
  });
});

describe('ocrMask', () => {
  it('a phone number split over four words gets one box covering all of them', () => {
    const words = line(0, 'Call +20 100 901 2345 today');
    const { boxes } = ocrMask(words, { pad: 0 });
    const phone = boxes.filter((b) => b.type === 'PHONE');
    expect(phone).toHaveLength(1);
    expect(phone[0]).toMatchObject({ x: 60, y: 0, w: 160, h: 20, on: true });
  });

  it('boxes only the words on the line where the detail is', () => {
    const words = [...line(0, 'Name and contact'), ...line(1, 'Email adel.mansour@example.com')];
    const email = ocrMask(words, { pad: 0 }).boxes.filter((b) => b.type === 'EMAIL');
    expect(email).toEqual([
      expect.objectContaining({ x: 70, y: 30, w: 240, h: 20, value: 'adel.mansour@example.com' }),
    ]);
  });

  it('a detail wrapped across two lines gets one box per line', () => {
    const words = [
      ...line(0, 'IBAN EG38 0019 0005 0000'),
      ...line(1, '0000 2631 8000 2 for refunds'),
    ];
    const iban = ocrMask(words, { pad: 0 }).boxes.filter((b) => b.value.startsWith('EG38'));
    expect(iban.map((b) => b.y)).toEqual([0, 30]);
  });

  it("finds medical identifiers (MRN) and the person's own rules", () => {
    const words = [...line(0, 'MRN: 4471-2093-88'), ...line(1, 'Project Bluebird budget')];
    const { boxes } = ocrMask(words, {
      pad: 0,
      custom: [{ label: 'PROJECT', terms: ['Bluebird'] }],
    });
    expect(boxes.map((b) => b.value)).toEqual(expect.arrayContaining(['4471-2093-88', 'Bluebird']));
  });

  it('pads boxes and never goes below zero', () => {
    const words = line(0, 'adel@example.com is mine', 2);
    const [b] = ocrMask(words, { pad: 4 }).boxes;
    expect(b).toMatchObject({ x: 0, y: 0 });
    expect(b!.w).toBe(160 + 2 + 4);
  });

  it('rejoins an email that OCR split at the dot (real photo: "adel. mansour@example.com")', () => {
    const words = line(0, 'Email adel. mansour@example.com');
    const email = ocrMask(words, { pad: 0 }).boxes.filter((b) => b.type === 'EMAIL');
    expect(email).toHaveLength(1);
    expect(email[0]).toMatchObject({ value: 'adel.mansour@example.com', x: 70 });
  });

  it('a name stops at the end of its line (real photo: "Adel Mansour" then "National ID")', () => {
    const words = [...line(0, 'Patient Adel Mansour'), ...line(1, 'National ID 26809120103456')];
    const people = ocrMask(words, { pad: 0 }).boxes.filter((b) => b.type === 'PERSON');
    expect(people.map((b) => b.value)).toEqual(['Adel Mansour']);
  });

  it('a date, an amount and an address wrapped across lines are boxed on both lines (OCR eval, lease)', () => {
    const words = [
      ...line(0, 'Signed on 15 August'),
      ...line(1, '2024 by both parties. A late fee of EGP'),
      ...line(2, '250 applies. The flat at 14 El-Nadi St, Flat 7, Maadi,'),
      ...line(3, 'Cairo is let furnished.'),
    ];
    const { boxes } = ocrMask(words, { pad: 0 });
    const lines = (type: string) => boxes.filter((b) => b.type === type).map((b) => b.y / 30);
    expect(lines('DATE')).toEqual([0, 1]);
    expect(lines('MONEY')).toEqual([1, 2]);
    expect(lines('ADDRESS')).toEqual([2, 3]);
    // The address box on the next line covers "Cairo" only, not the rest of that line.
    const cairo = boxes.find((b) => b.type === 'ADDRESS' && b.y === 90)!;
    expect(cairo.w).toBe(50);
  });

  it('an address line followed by a label line does not take the label (real photo layout)', () => {
    const words = [
      ...line(0, 'Address 14 El-Nadi St, Maadi, Cairo'),
      ...line(1, 'MRN 4471-2093-88'),
    ];
    const addr = ocrMask(words, { pad: 0 }).boxes.filter((b) => b.type === 'ADDRESS');
    expect(addr).toHaveLength(1);
    expect(addr[0]!.y).toBe(0);
  });

  it('table headings on a lab bill are not names', () => {
    const words = [
      ...line(0, 'Accession Accession #LB 5520918'),
      ...line(1, 'Test Result Reference'),
    ];
    const { boxes } = ocrMask(words, { pad: 0 });
    expect(boxes.map((b) => `${b.type}:${b.value}`)).toEqual(['ACCOUNT:LB 5520918']);
  });

  it('the same detail found twice gets one box', () => {
    const words = line(0, 'Dr. Hany Selim signed');
    const { boxes } = ocrMask(words, { pad: 0 });
    const keys = boxes.map((b) => `${b.x},${b.y},${b.w},${b.h}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('no words: no text and no boxes', () => {
    expect(ocrMask([])).toEqual({ text: '', boxes: [] });
  });
});

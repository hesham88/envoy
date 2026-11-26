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

  it('no words: no text and no boxes', () => {
    expect(ocrMask([])).toEqual({ text: '', boxes: [] });
  });
});

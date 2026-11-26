import { describe, expect, it } from 'vitest';
import { FileReadError, readDocumentFile } from './readFile';

const file = (content: string, name: string, type: string) => new File([content], name, { type });

describe('readDocumentFile', () => {
  it('reads plain text files', async () => {
    const out = await readDocumentFile(file('1. Rent. EGP 100.', 'lease.txt', 'text/plain'));
    expect(out).toEqual({ title: 'lease.txt', text: '1. Rent. EGP 100.', pages: 1 });
  });

  it('reads .csv even when Windows labels it as an Excel file', async () => {
    const out = await readDocumentFile(
      file(
        'name,rent' + String.fromCharCode(10) + 'Mona,8500',
        'rents.csv',
        'application/vnd.ms-excel',
      ),
    );
    expect(out.text).toBe('name,rent' + String.fromCharCode(10) + 'Mona,8500');
  });

  describe('photos', () => {
    const w = (text: string, line: number, x0: number) => ({
      text,
      line,
      bbox: { x0, y0: line * 30, x1: x0 + text.length * 10, y1: line * 30 + 20 },
    });
    const PHONE_LINE = [
      w('Phone', 0, 10),
      w('+20', 0, 70),
      w('100', 0, 110),
      w('901', 0, 150),
      w('2345', 0, 190),
    ];
    const photo =
      (words = PHONE_LINE, size = 800) =>
      async () => ({ words, barcodes: [], width: size, height: 600 });

    it('reads the text of a photo on the device, with a box per private detail', async () => {
      const out = await readDocumentFile(file('x', 'bill.webp', 'image/webp'), {
        readPhoto: photo(),
      });
      expect(out.text).toBe('Phone +20 100 901 2345');
      expect(out.photo?.boxes.map((b) => b.type)).toEqual(['PHONE']);
      expect(out.photo).toMatchObject({ width: 800, height: 600 });
    });

    it('says plainly when a photo has no text', async () => {
      await expect(
        readDocumentFile(file('x', 'cat.jpg', 'image/jpeg'), { readPhoto: photo([]) }),
      ).rejects.toThrow("Envoy couldn't find any text in this image.");
    });

    it('rejects oversized image', async () => {
      await expect(
        readDocumentFile(file('x', 'huge.png', 'image/png'), {
          readPhoto: photo(undefined, 9000),
        }),
      ).rejects.toThrow(
        'This image is too large to read on this device. Try a photo under 6000 pixels wide.',
      );
    });
  });

  it('reads PDFs page by page with page markers', async () => {
    const out = await readDocumentFile(file('%PDF', 'lease.pdf', 'application/pdf'), {
      extractPdfPages: async () => [
        '1. Parties. Mona Adel is the tenant.',
        '2. Term. Three years from 1 September 2024.',
      ],
    });
    expect(out.pages).toBe(2);
    expect(out.text).toBe(
      '--- Page 1 ---\n1. Parties. Mona Adel is the tenant.\n\n--- Page 2 ---\n2. Term. Three years from 1 September 2024.',
    );
  });

  it('scanned pdf shows no-text message', async () => {
    await expect(
      readDocumentFile(file('%PDF', 'scan.pdf', 'application/pdf'), {
        extractPdfPages: async () => ['', '  '],
      }),
    ).rejects.toThrow(/no selectable text/i);
  });

  it('rejects DOCX and other formats with a helpful message', async () => {
    const err = await readDocumentFile(
      file(
        'x',
        'lease.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(FileReadError);
    expect(err.message).toMatch(/PDF, TXT and photo files/);
  });

  it('rejects files over 10 MB', async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.txt', { type: 'text/plain' });
    await expect(readDocumentFile(big)).rejects.toThrow(/10 MB/);
  });

  it('rejects empty text files', async () => {
    await expect(readDocumentFile(file('   ', 'empty.txt', 'text/plain'))).rejects.toThrow(
      /empty/i,
    );
  });
});

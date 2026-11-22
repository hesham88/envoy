import { describe, expect, it } from 'vitest';
import { FileReadError, readDocumentFile } from './readFile';

const file = (content: string, name: string, type: string) => new File([content], name, { type });

describe('readDocumentFile', () => {
  it('reads plain text files', async () => {
    const out = await readDocumentFile(file('1. Rent. EGP 100.', 'lease.txt', 'text/plain'));
    expect(out).toEqual({ title: 'lease.txt', text: '1. Rent. EGP 100.', pages: 1 });
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
    expect(err.message).toMatch(/PDF or TXT/);
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const worker = { recognize: vi.fn(), terminate: vi.fn(async () => undefined) };
const createWorker = vi.fn(async () => worker);
vi.mock('tesseract.js', () => ({ createWorker }));
const readBarcodes = vi.fn();
const prepareZXingModule = vi.fn();
vi.mock('zxing-wasm/reader', () => ({ readBarcodes, prepareZXingModule }));

const { recognizeImage } = await import('./ocr');

const word = (text: string, x0: number, y0: number) => ({
  text,
  bbox: { x0, y0, x1: x0 + text.length * 10, y1: y0 + 20 },
});
const page = {
  blocks: [
    {
      paragraphs: [
        {
          lines: [
            { words: [word('Patient:', 10, 0), word('Adel', 100, 0), word('Mansour', 150, 0)] },
            { words: [word('MRN:', 10, 30), word('4471-2093-88', 60, 30)] },
          ],
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 800, height: 600, close: () => {} }));
  worker.recognize.mockResolvedValue({ data: page });
  readBarcodes.mockResolvedValue([]);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('recognizeImage', () => {
  it('runs Tesseract from our own files only: no Blob worker, no CDN, nothing cached', async () => {
    await recognizeImage(new Blob(['x']), '/ocr');
    expect(createWorker).toHaveBeenCalledWith('eng', 1, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
      workerBlobURL: false,
      cacheMethod: 'none',
    });
    const overrides = prepareZXingModule.mock.calls[0]![0].overrides;
    expect(overrides.locateFile('zxing_reader.wasm', 'https://fastly.jsdelivr.net/')).toBe(
      '/ocr/zxing_reader.wasm',
    );
  });

  it('gives the barcode reader decoded pixels, not the file (its decoder cannot read WebP)', async () => {
    const pixels = { width: 800, height: 600, data: new Uint8ClampedArray(4) };
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return { drawImage: () => {}, getImageData: () => pixels };
        }
      },
    );
    await recognizeImage(new Blob(['x'], { type: 'image/webp' }), '/ocr');
    expect(readBarcodes.mock.calls[0]![0]).toBe(pixels);
  });

  it('returns the words line by line, with the image size', async () => {
    const r = await recognizeImage(new Blob(['x']), '/ocr');
    expect(r.width).toBe(800);
    expect(r.height).toBe(600);
    expect(r.words.map((w) => [w.text, w.line])).toEqual([
      ['Patient:', 0],
      ['Adel', 0],
      ['Mansour', 0],
      ['MRN:', 1],
      ['4471-2093-88', 1],
    ]);
  });

  it('turns each barcode into a box, without keeping what it encodes', async () => {
    readBarcodes.mockResolvedValue([
      {
        isValid: true,
        format: 'QRCode',
        text: 'PATIENT 4471-2093-88',
        position: {
          topLeft: { x: 600, y: 400 },
          topRight: { x: 700, y: 402 },
          bottomRight: { x: 698, y: 500 },
          bottomLeft: { x: 601, y: 498 },
        },
      },
    ]);
    const r = await recognizeImage(new Blob(['x']), '/ocr');
    expect(r.barcodes).toEqual([
      { x: 594, y: 394, w: 112, h: 112, type: 'BARCODE', value: 'QR code', on: true },
    ]);
    expect(JSON.stringify(r)).not.toContain('PATIENT 4471');
  });

  it('a barcode reader failure never stops the text masks', async () => {
    readBarcodes.mockRejectedValue(new Error('wasm failed'));
    const r = await recognizeImage(new Blob(['x']), '/ocr');
    expect(r.words).toHaveLength(5);
    expect(r.barcodes).toEqual([]);
  });

  it('always stops the worker, even when OCR fails', async () => {
    worker.recognize.mockRejectedValue(new Error('bad image'));
    await expect(recognizeImage(new Blob(['x']), '/ocr')).rejects.toThrow('bad image');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});

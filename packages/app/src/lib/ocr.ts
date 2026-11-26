/**
 * Reads a photo of a document on this device: Tesseract.js (OCR) and zxing-wasm (barcodes), both
 * WebAssembly, both loaded from our own files under `base` (no CDN: Tesseract's Blob worker and
 * zxing's default CDN `locateFile` are both overridden). Nothing is cached or sent.
 */
import type { MaskBox, OcrWord } from '@envoy/core';

export interface PhotoRead {
  words: OcrWord[];
  /** Barcodes and QR codes, as boxes. What they encode is never kept. */
  barcodes: MaskBox[];
  width: number;
  height: number;
}

const FORMAT_LABEL: Record<string, string> = {
  QRCode: 'QR code',
  MicroQRCode: 'QR code',
  DataMatrix: 'Data Matrix code',
  PDF417: 'PDF417 code',
  Aztec: 'Aztec code',
};

async function readBarcodeBoxes(image: Blob, base: string): Promise<MaskBox[]> {
  try {
    const z = await import('zxing-wasm/reader');
    z.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? `${base}/zxing_reader.wasm` : prefix + path,
      },
    });
    const found = await z.readBarcodes(image, { tryHarder: true, maxNumberOfSymbols: 8 });
    const pad = 6;
    return found
      .filter((b) => b.isValid)
      .map((b) => {
        const p = b.position;
        const xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x];
        const ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y];
        const x = Math.max(0, Math.min(...xs) - pad);
        const y = Math.max(0, Math.min(...ys) - pad);
        return {
          x,
          y,
          w: Math.max(...xs) + pad - x,
          h: Math.max(...ys) + pad - y,
          type: 'BARCODE' as const,
          value: FORMAT_LABEL[String(b.format)] ?? 'Barcode',
          on: true,
        };
      });
  } catch {
    // A barcode reader problem must never stop the text masks.
    return [];
  }
}

export async function recognizeImage(image: Blob, base: string): Promise<PhotoRead> {
  const bmp = await createImageBitmap(image);
  const { width, height } = bmp;
  bmp.close?.();
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/lang`,
    workerBlobURL: false,
    cacheMethod: 'none',
  });
  let words: OcrWord[] = [];
  try {
    const { data } = await worker.recognize(image, {}, { blocks: true });
    let line = 0;
    for (const block of data.blocks ?? [])
      for (const para of block.paragraphs)
        for (const l of para.lines) {
          for (const w of l.words)
            if (w.text.trim()) words.push({ text: w.text, line, bbox: { ...w.bbox } });
          line++;
        }
  } finally {
    await worker.terminate();
  }
  words = words.filter((w) => w.bbox.x1 > w.bbox.x0);
  return { words, barcodes: await readBarcodeBoxes(image, base), width, height };
}

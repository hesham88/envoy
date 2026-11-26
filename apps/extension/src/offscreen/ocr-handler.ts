// Handles 'envoy:ocr-boxes-internal' from the service worker: read a photo on this device
// (Tesseract.js + zxing-wasm, both from the extension package) and return one box per private
// detail. The photo, its text and what any barcode encodes never leave this document.
import { ocrMask, type CustomRule } from '@envoy/core';
import { recognizeImage } from '@envoy/app/ocr';

declare const chrome: {
  runtime: {
    id: string;
    getURL(path: string): string;
    onMessage: {
      addListener(
        fn: (
          msg: { type?: string; base64?: string; mime?: string; custom?: CustomRule[] },
          sender: unknown,
          sendResponse: (r: unknown) => void,
        ) => boolean | void,
      ): void;
    };
  };
};

const MAX_SIDE = 6000;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if ((sender as { id?: string }).id !== chrome.runtime.id) return false;
  if (msg?.type !== 'envoy:ocr-boxes-internal') return false;
  (async () => {
    try {
      const bin = atob(msg.base64 ?? '');
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: msg.mime || 'image/png' });
      const read = await recognizeImage(blob, chrome.runtime.getURL('ocr'));
      if (read.width > MAX_SIDE || read.height > MAX_SIDE) {
        sendResponse({ ok: false, error: 'This image is too large to read on this device.' });
        return;
      }
      // Offscreen documents have no chrome.storage: the page sends the person's rules.
      const custom = (Array.isArray(msg.custom) ? msg.custom : []) as CustomRule[];
      const { boxes } = ocrMask(read.words, { custom });
      sendResponse({
        ok: true,
        boxes: [...boxes, ...read.barcodes, ...(read.faces ?? [])],
        width: read.width,
        height: read.height,
      });
    } catch (e) {
      sendResponse({ ok: false, error: `${(e as Error).name}: ${(e as Error).message}` });
    }
  })();
  return true;
});

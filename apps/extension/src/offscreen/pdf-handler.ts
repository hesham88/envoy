// Handles 'envoy:pdf-mask-internal' from the service worker: extract text with
// pdfjs (local), scan and mask it, rebuild a NEW text-only PDF, return base64.
import { maskFindings, scanText, type CustomRule } from '@envoy/core';
import { processPdfFromMaskedText } from '../upload/process';
import { bytesToBase64, extractPdfText } from './pdf';

declare const chrome: {
  runtime: {
    onMessage: { addListener(fn: (msg: { type?: string; base64?: string; name?: string; custom?: CustomRule[] }, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void): void };
  };
  storage: { local: { get(k: string): Promise<Record<string, unknown>> } };
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'envoy:pdf-mask-internal') return false;
  (async () => {
    try {
      const text = await extractPdfText(msg.base64 ?? '');
      if (!text.trim()) {
        sendResponse({ ok: false, error: 'This PDF has no selectable text (a scan). Envoy cannot rebuild it; the original was not sent.' });
        return;
      }
      const stored = await chrome.storage.local.get('envoyRules').catch(() => ({}));
      const custom = (msg.custom ?? (stored as { envoyRules?: CustomRule[] }).envoyRules ?? []) as CustomRule[];
      const scan = scanText(text, { custom });
      const masked = maskFindings(text, scan, new Set());
      const fake = new File([''], msg.name ?? 'document.pdf', { type: 'application/pdf' });
      const { file, receipt } = processPdfFromMaskedText(masked, fake, scan.findings.length, scan.findings);
      const buf = new Uint8Array(await file.arrayBuffer());
      sendResponse({ ok: true, base64: bytesToBase64(buf), receipt });
    } catch (e) {
      sendResponse({ ok: false, error: `${(e as Error).name}: ${(e as Error).message}` });
    }
  })();
  return true;
});

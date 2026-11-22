import { maskFindings, scanText, type CustomRule } from '@envoy/core';
import { docxToText } from './zip';
import { buildTextPdf } from './pdf';

export interface UploadReceipt {
  kind: 'text' | 'docx' | 'pdf' | 'image' | 'other';
  removed: number;
  findings: { type: string; value: string; tag: string }[];
  inBytes: number;
  outBytes: number;
  outType: string;
  note: string;
}

const TEXT_EXT = /\.(txt|md|csv|text)$/i;

export function kindOf(file: { name: string; type: string }): UploadReceipt['kind'] {
  if (/\.docx$/i.test(file.name)) return 'docx';
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('image/')) return 'image';
  if (TEXT_EXT.test(file.name) || file.type.startsWith('text/')) return 'text';
  return 'other';
}

/** Text-like uploads: scan, mask (honouring keep), rebuild a clean file. */
export async function processTextUpload(file: File, custom: readonly CustomRule[], keep: ReadonlySet<string>): Promise<{ file: File; receipt: UploadReceipt }> {
  const kind = kindOf(file);
  const raw = kind === 'docx' ? await docxToText(await file.arrayBuffer()) : await file.text();
  const scan = scanText(raw, { custom });
  const masked = maskFindings(raw, scan, keep);
  const removed = scan.findings.filter((f) => !keep.has(f.tag)).length;
  const outName = file.name.replace(/\.docx$/i, '.txt');
  const out = new File([masked], outName, { type: 'text/plain' });
  return {
    file: out,
    receipt: {
      kind,
      removed,
      findings: scan.findings,
      inBytes: file.size,
      outBytes: out.size,
      outType: out.type,
      note: kind === 'docx' ? 'DOCX rebuilt as plain text with masked values.' : 'Text rebuilt with masked values.',
    },
  };
}

/** PDF: rebuild a NEW text-only PDF from already-masked text. Never boxes over live text. */
export function processPdfFromMaskedText(maskedText: string, original: File, removed: number, findings: UploadReceipt['findings']): { file: File; receipt: UploadReceipt } {
  const blob = buildTextPdf(maskedText);
  const out = new File([blob], original.name, { type: 'application/pdf' });
  return {
    file: out,
    receipt: { kind: 'pdf', removed, findings, inBytes: original.size, outBytes: out.size, outType: out.type, note: 'New text-only PDF rebuilt from masked text. Layout simplified; no original PDF text remains.' },
  };
}

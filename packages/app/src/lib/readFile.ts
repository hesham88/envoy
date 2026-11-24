/** Reads a user's document on the device. Nothing here touches the network. */

export class FileReadError extends Error {
  override name = 'FileReadError';
}

export interface ReadDocument {
  title: string;
  text: string;
  pages: number;
}

const MAX_BYTES = 10 * 1024 * 1024;

/** Default PDF text extraction with pdf.js (text PDFs only; loaded on demand). */
async function extractWithPdfJs(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      text += item.str + (item.hasEOL ? '\n' : ' ');
    }
    pages.push(
      text
        .replace(/[ \t]+\n/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim(),
    );
  }
  await task.destroy();
  return pages;
}

export async function readDocumentFile(
  file: File,
  opts: { extractPdfPages?: (file: File) => Promise<string[]> } = {},
): Promise<ReadDocument> {
  if (file.size > MAX_BYTES)
    throw new FileReadError('This file is larger than 10 MB. Try a shorter document.');
  const name = file.name.toLowerCase();
  const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
  const isText = file.type.startsWith('text/') || /\.(txt|md|csv|text)$/.test(name);

  if (isText) {
    const text = (await file.text()).replace(/\r\n/g, '\n');
    if (!text.trim()) throw new FileReadError('This file is empty.');
    return { title: file.name, text, pages: 1 };
  }

  if (isPdf) {
    const pages = await (opts.extractPdfPages ?? extractWithPdfJs)(file);
    if (pages.join('').trim().length < 20) {
      throw new FileReadError(
        'This PDF has no selectable text (it may be a scan). Envoy reads text PDFs only; try pasting the text instead.',
      );
    }
    const text = pages.map((p, i) => `--- Page ${i + 1} ---\n${p.trim()}`).join('\n\n');
    return { title: file.name, text, pages: pages.length };
  }

  throw new FileReadError('Envoy reads PDF or TXT files, or pasted text.');
}

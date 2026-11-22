import { useId, useState, type Dispatch } from 'react';
import { ClipboardPaste, FileText, Upload } from 'lucide-react';
import { EN_LEASE } from '@envoy/core';
import type { SessionAction, SessionDoc } from '../app/session';
import { FileReadError, readDocumentFile } from '../lib/readFile';

const ICON = { strokeWidth: 1.75, 'aria-hidden': true } as const;
const btn =
  'inline-flex min-h-11 items-center gap-2 rounded-control border px-4 py-2.5 text-[15px] font-semibold transition-colors focus-visible:outline-2';

/** Drop a file, choose one, paste text, or load the fictional sample. Everything stays on this device. */
export function DocumentInput({ doc, dispatch }: { doc: SessionDoc | null; dispatch: Dispatch<SessionAction> }) {
  const [tab, setTab] = useState<'upload' | 'paste'>('upload');
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileId = useId();
  const pasteId = useId();

  async function load(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const read = await readDocumentFile(file);
      dispatch({ type: 'LOAD_DOC', doc: { title: read.title, text: read.text, source: 'file' } });
    } catch (e) {
      setError(e instanceof FileReadError ? e.message : 'This file could not be read on this device.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="How to add your document" className="flex gap-2">
        {(['upload', 'paste'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`${btn} min-h-9 px-3 py-1.5 text-sm ${tab === t ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink'}`}
          >
            {t === 'upload' ? <Upload size={16} {...ICON} /> : <ClipboardPaste size={16} {...ICON} />}
            {t === 'upload' ? 'Upload a file' : 'Paste text'}
          </button>
        ))}
      </div>

      {tab === 'upload' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void load(e.dataTransfer.files[0]);
          }}
          className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            dragging ? 'border-device bg-device-tint' : 'border-line bg-paper'
          }`}
        >
          <FileText size={36} {...ICON} className="text-muted" />
          <p className="m-0 text-[17px] font-semibold">Drop a contract, letter or report</p>
          <p className="m-0 text-sm text-muted-2">PDF or TXT · English · read on this device, never uploaded</p>
          <div className="mt-1 flex flex-wrap justify-center gap-3">
            <label htmlFor={fileId} className={`${btn} cursor-pointer border-ink bg-surface text-ink`}>
              Choose file
            </label>
            <input
              id={fileId}
              type="file"
              accept=".pdf,.txt,text/plain,application/pdf"
              className="sr-only"
              onChange={(e) => void load(e.target.files?.[0])}
            />
            <button
              className={`${btn} border-line bg-paper text-ink hover:bg-surface`}
              onClick={() => {
                setError(null);
                dispatch({ type: 'LOAD_DOC', doc: { title: EN_LEASE.title, text: EN_LEASE.text, source: 'sample', notice: EN_LEASE.notice } });
              }}
            >
              Try a sample contract
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={pasteId} className="text-[15px] font-semibold">
            Paste your document
          </label>
          <textarea
            id={pasteId}
            rows={6}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            className="rounded-control border border-line bg-surface p-3 font-mono text-sm text-ink"
          />
          <button
            className={`${btn} self-start border-ink bg-surface text-ink`}
            disabled={!pasted.trim()}
            onClick={() => dispatch({ type: 'LOAD_DOC', doc: { title: 'Pasted text', text: pasted, source: 'paste' } })}
          >
            Use this text
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="m-0 rounded-control bg-danger-tint px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {doc && (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-paper px-4 py-3">
          <FileText size={20} {...ICON} />
          <span className="text-[15px] font-semibold">{doc.title}</span>
          <span className="text-sm text-muted-2">loaded on this device</span>
          {doc.notice && <span className="w-full text-sm text-muted">{doc.notice}</span>}
        </div>
      )}
    </div>
  );
}

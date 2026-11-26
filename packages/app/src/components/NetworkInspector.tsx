import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { networkLog, type NetworkEntry } from '@envoy/ai';

/** Proof drawer: every AI request this tab made, with the exact text, where it went, and anything blocked. */
export function NetworkInspector({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<readonly NetworkEntry[]>(() => [...networkLog.entries]);
  useEffect(() => networkLog.subscribe((e) => setEntries([...e])), []);
  if (!open) return null;
  return (
    <aside
      aria-label="Network inspector"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col gap-3 overflow-auto border-l border-line bg-surface p-5 shadow-[0_0_0_1px_var(--line)]"
    >
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-lg font-bold">Network inspector</h2>
        <button
          onClick={onClose}
          aria-label="Close the network inspector"
          className="flex size-11 items-center justify-center rounded-control border border-line"
        >
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <p className="m-0 text-sm text-muted">
        Every AI request this tab made, with the exact text. Device requests never leave this
        computer.
      </p>
      {entries.length === 0 && <p className="m-0 text-sm text-muted-2">No requests yet.</p>}
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {entries.map((e, i) => (
          <li key={i} className="flex flex-col gap-1.5 rounded-[10px] border border-line p-3">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-mono text-muted-2">{new Date(e.at).toLocaleTimeString()}</span>
              <span className="font-semibold">{e.step}</span>
              <span
                className={
                  e.target === 'cloud'
                    ? 'font-semibold text-cloud-on-tint'
                    : 'font-semibold text-device-on-tint'
                }
              >
                {e.direction === 'in'
                  ? '← From the cloud'
                  : e.target === 'cloud'
                    ? '→ Cloud'
                    : '→ Device'}
              </span>
              {e.blocked && (
                <span className="rounded bg-danger-tint px-1.5 font-semibold text-danger">
                  Blocked by Envoy
                </span>
              )}
            </div>
            {e.payload && (
              <pre className="m-0 max-h-60 overflow-auto rounded bg-paper p-2 font-mono text-xs whitespace-pre-wrap">
                {e.payload}
              </pre>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}

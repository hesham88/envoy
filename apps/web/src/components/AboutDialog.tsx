import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const ROWS: [string, string, string][] = [
  ['1 · Detect', 'ONLY_ON_DEVICE', 'Local rules only; names flagged for you to check'],
  ['2 · Minimize', 'ONLY_ON_DEVICE', 'Every clause included, masked; you choose'],
  ['3 · Route', 'ONLY_ON_DEVICE', 'Goes to the masked reasoning step'],
  ['4 · You approve', 'No model', 'Always you'],
  ['5 · Reason', 'PREFER_IN_CLOUD', 'Offline: a lighter answer on this device'],
  ['6 · Restore', 'Plain code', 'Always on this device'],
];

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/40 p-6" onClick={onClose}>
      <dialog
        open
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="relative m-0 flex max-w-[760px] flex-col gap-4 rounded-card border border-line bg-surface p-7 text-ink"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="m-0 text-2xl font-bold">
            How Envoy works
          </h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="flex size-11 flex-none items-center justify-center rounded-control border border-line">
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <p className="m-0 leading-relaxed text-muted">
          Envoy practises <strong className="text-ink">Privacy-Conscious Delegation</strong>: a small model on your computer reads your document and question
          first, decides what the cloud needs to know, hides identities behind meaning-preserving tags, and asks you before anything leaves. A powerful cloud
          model reasons over that masked excerpt, and your real details are put back on your device.
        </p>
        <table className="w-full border-collapse text-sm">
          <caption className="mb-2 text-left font-semibold">Firebase AI Logic inference mode per step</caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-3">Step</th>
              <th className="py-2 pr-3">Mode</th>
              <th className="py-2">Without the on-device model</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([step, mode, fallback]) => (
              <tr key={step} className="border-b border-line last:border-b-0">
                <td className="py-2 pr-3">{step}</td>
                <td className="py-2 pr-3 font-mono text-[13px]">{mode}</td>
                <td className="py-2 text-muted">{fallback}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0 text-sm leading-relaxed text-muted">
          <strong className="text-ink">We don't trust the default.</strong> A known SDK issue (firebase-js-sdk #10635) can send "on-device only" requests to the
          cloud in browsers without Chrome's built-in model. Envoy checks the model before every private step, blocks the cloud endpoint while one runs, and
          discards any answer that didn't come from the device.
        </p>
        <p className="m-0 text-sm text-muted">
          Inspired by PAPILLON (Li et al., NAACL 2025),{' '}
          <a href="https://arxiv.org/abs/2410.17127" target="_blank" rel="noreferrer" className="text-cloud-on-tint underline">
            "Privacy-Conscious Delegation"
          </a>
          . Envoy is open source under the Apache-2.0 licence:{' '}
          <a href="https://github.com/hesham88/envoy" target="_blank" rel="noreferrer" className="text-cloud-on-tint underline">
            github.com/hesham88/envoy
          </a>
          . It explains documents; it doesn't give legal advice.
        </p>
      </dialog>
    </div>
  );
}

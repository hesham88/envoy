import { ShieldAlert } from 'lucide-react';
import type { EnvoyRuntime } from '../app/useEnvoy';
import { ModeChip } from './ModeChip';

const STEPS = [
  { n: 1, title: 'Detect and minimize', body: 'Finds personal details and picks only the parts of the document your question needs.', chip: <ModeChip kind="device">On-device</ModeChip> },
  { n: 2, title: 'Reason', body: 'Cloud Gemini answers using only the masked excerpt you approve. Simple questions skip this step.', chip: <ModeChip kind="cloud">Cloud · only if needed</ModeChip> },
  { n: 3, title: 'Restore', body: 'Puts your real names and numbers back into the answer, right here.', chip: <ModeChip kind="device">On-device</ModeChip> },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="flex flex-col gap-5 rounded-card border border-line bg-surface p-6">
      <h2 id="how-title" className="m-0 text-lg font-bold">
        How Envoy handles your question
      </h2>
      <ol className="m-0 flex list-none flex-col gap-5 p-0">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-3.5">
            <span aria-hidden="true" className="flex size-7 flex-none items-center justify-center rounded-full bg-ink text-sm font-bold text-paper">
              {s.n}
            </span>
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold">{s.title}</span>
              <span className="text-sm leading-normal text-muted">{s.body}</span>
              {s.chip}
            </div>
          </li>
        ))}
      </ol>
      <p className="m-0 border-t border-line pt-4 text-[13px] leading-normal text-muted-2">
        No on-device model on this computer? Envoy switches to built-in local rules for IDs, phones and amounts. It never falls back to sending your raw
        document to the cloud.
      </p>
    </section>
  );
}

/** Shown whenever the on-device model isn't ready: how to turn it on, with a live re-check. */
export function OnDeviceGuide({ runtime }: { runtime: EnvoyRuntime }) {
  const canEnable = runtime.status === 'downloadable';
  return (
    <section aria-labelledby="guide-title" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6">
      <div className="flex items-center gap-2">
        <ShieldAlert size={20} strokeWidth={1.75} aria-hidden="true" className="text-detected-line" />
        <h2 id="guide-title" className="m-0 text-base font-bold">
          Turn on on-device AI
        </h2>
      </div>
      <p className="m-0 text-sm leading-normal text-muted">
        Until then Envoy runs in <strong className="text-ink">Basic protection</strong>: local rules hide IDs, phones, emails, IBANs and amounts, and names
        are flagged for you to check.
      </p>
      <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-normal marker:font-semibold">
        <li>Use Chrome on a desktop computer (version 148 or newer).</li>
        <li>
          Open Chrome Settings → <strong>AI</strong> and switch on <strong>On-device AI</strong>.
        </li>
        <li>Come back and click Enable private mode. The model downloads once and then works offline.</li>
      </ol>
      <div className="flex flex-wrap gap-2.5">
        {canEnable && (
          <button onClick={runtime.enablePrivateMode} className="min-h-11 rounded-control bg-ink px-4 py-2.5 text-[15px] font-semibold text-paper">
            Enable private mode
          </button>
        )}
        <button onClick={() => void runtime.refreshStatus()} className="min-h-11 rounded-control border border-line bg-surface px-4 py-2.5 text-[15px] font-semibold">
          Check again
        </button>
      </div>
      <p className="m-0 text-[13px] text-muted-2">
        Still unavailable? Your computer may not meet Chrome's requirements. Details: <code className="font-mono">chrome://on-device-internals</code>
      </p>
    </section>
  );
}

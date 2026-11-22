import { useEffect, useState } from 'react';
import { Check, Laptop, Loader2 } from 'lucide-react';
import type { AnalyzeProgress } from '@envoy/ai';

const PRIVATE_STEPS: { step: AnalyzeProgress['step']; label: string }[] = [
  { step: 'rules', label: 'Checked with local rules (IDs, phones, IBANs, amounts)' },
  { step: 'detect', label: 'Finding names and roles on this device' },
  { step: 'minimize', label: 'Picking the clauses your question needs' },
  { step: 'route', label: 'Deciding whether the cloud is needed at all' },
];

/** Live, honest progress for the slow part: on-device steps can take a while on a laptop CPU. */
export function AnalyzingPanel({
  progress,
  mode,
  startedAt,
}: {
  progress: AnalyzeProgress | null;
  mode: 'private' | 'basic';
  startedAt: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const steps = mode === 'private' ? PRIVATE_STEPS : PRIVATE_STEPS.slice(0, 1);
  const currentIndex = progress ? steps.findIndex((s) => s.step === progress.step) : 0;
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));

  return (
    <section
      aria-label="Analysis progress"
      className="flex flex-col gap-3 rounded-card border border-device/40 bg-device-tint/50 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-device-on-tint">
          <Laptop size={18} strokeWidth={1.75} aria-hidden="true" /> Working on this device
        </span>
        <span className="font-mono text-sm text-muted">{seconds}s</span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
        {steps.map((s, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'waiting';
          return (
            <li
              key={s.step}
              data-state={state}
              className={`flex items-center gap-2.5 ${state === 'waiting' ? 'text-muted-2' : 'text-ink'}`}
            >
              {state === 'done' ? (
                <Check size={16} strokeWidth={2.25} aria-hidden="true" className="text-device" />
              ) : state === 'active' ? (
                <Loader2
                  size={16}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="animate-spin text-device motion-reduce:animate-none"
                />
              ) : (
                <span aria-hidden="true" className="size-4 rounded-full border border-line" />
              )}
              {s.label}
              {state === 'active' && progress && progress.parts > 1
                ? ` · part ${progress.part} of ${progress.parts}`
                : ''}
            </li>
          );
        })}
      </ol>
      <p className="m-0 text-[13px] text-muted">
        Nothing has left this computer.{' '}
        {mode === 'private'
          ? 'On-device steps can take up to a minute on a laptop without a strong GPU.'
          : ''}
      </p>
    </section>
  );
}

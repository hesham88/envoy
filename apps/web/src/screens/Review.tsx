import { useMemo, type Dispatch } from 'react';
import { Info } from 'lucide-react';
import { composeOutbound } from '@envoy/ai';
import { checkOutbound } from '@envoy/core';
import type { SessionAction, SessionState } from '../app/session';
import { CloudPreview } from '../components/review/CloudPreview';
import { DocumentViewer } from '../components/review/DocumentViewer';
import { FoundList } from '../components/review/FoundList';

export function ProgressSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['Detect', 'Review', 'Answer'];
  return (
    <nav aria-label="Progress">
      <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0 text-sm">
        {steps.map((s, i) => {
          const n = i + 1;
          const done = n < current;
          const here = n === current;
          return (
            <li key={s} className="flex items-center gap-2" aria-current={here ? 'step' : undefined}>
              {i > 0 && <span aria-hidden="true" className="text-muted-2">—</span>}
              <span className={here ? 'rounded-full bg-ink px-2.5 py-1 font-semibold text-paper' : done ? 'font-semibold text-device-on-tint' : 'text-muted-2'}>
                {n} {s}
                {done ? ' ✓' : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface Props {
  state: SessionState;
  dispatch: Dispatch<SessionAction>;
  onApprove: (outbound: string) => void;
}

export function Review({ state, dispatch, onApprove }: Props) {
  const analysis = state.analysis!;
  const composed = useMemo(
    () =>
      composeOutbound(analysis, {
        selectedIds: state.selectedIds ?? analysis.selectedIds,
        hiddenTags: new Set(state.hiddenTags),
        sharedTags: new Set(state.sharedTags),
      }),
    [analysis, state.selectedIds, state.hiddenTags, state.sharedTags],
  );
  const outbound = state.editedOutbound ?? composed.outbound;
  const guard = useMemo(() => {
    if (state.editedOutbound === null) return composed.guard;
    const shared = new Set(state.sharedTags);
    return checkOutbound(state.editedOutbound, analysis.entities, {
      knownTags: analysis.tags.entries().map((t) => t.tag),
      allowed: analysis.entities.filter((e) => shared.has(analysis.tags.tagOf(e))),
    });
  }, [state.editedOutbound, state.sharedTags, composed.guard, analysis]);

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-8 py-7">
      <ProgressSteps current={2} />
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-sm text-muted-2">Your question</p>
        <h1 tabIndex={-1} className="m-0 text-[22px] font-semibold">
          {state.question}
        </h1>
      </div>
      {state.notice && (
        <p className="m-0 flex items-start gap-2 rounded-control bg-detected/60 px-4 py-3 text-sm">
          <Info size={18} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 flex-none" />
          {state.notice}
        </p>
      )}
      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Your document" className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-5 py-3.5">
            <span className="text-[15px] font-semibold">{state.doc?.title}</span>
            <div className="flex flex-wrap gap-3.5 text-[13px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded-[3px] border-b-2 border-detected-line bg-detected" />
                Personal detail, kept on device
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded-[3px] border-2 border-dashed border-cloud" />
                Shared with the cloud (masked)
              </span>
            </div>
          </div>
          <DocumentViewer
            analysis={analysis}
            selectedIds={state.selectedIds ?? analysis.selectedIds}
            hiddenTags={state.hiddenTags}
            sharedTags={state.sharedTags}
            dispatch={dispatch}
          />
        </section>
        <aside className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
          <CloudPreview
            outbound={outbound}
            guard={guard}
            receipt={composed.receipt}
            edited={state.editedOutbound !== null}
            sending={state.phase === 'sending'}
            dispatch={dispatch}
            onApprove={() => onApprove(outbound)}
          />
          <FoundList analysis={analysis} receipt={composed.receipt} />
        </aside>
      </div>
    </main>
  );
}

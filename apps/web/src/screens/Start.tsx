import { useId, type Dispatch } from 'react';
import { SUGGESTED_QUESTIONS } from '@envoy/core';
import type { SessionAction, SessionState } from '../app/session';
import type { AnalyzeProgress } from '@envoy/ai';
import type { EnvoyRuntime } from '../app/useEnvoy';
import { AnalyzingPanel } from '@envoy/ui';
import { DocumentInput } from '../components/DocumentInput';
import { HowItWorks, OnDeviceGuide } from '../components/SidePanels';

interface Props {
  state: SessionState;
  dispatch: Dispatch<SessionAction>;
  runtime: EnvoyRuntime;
  onAnalyze: () => void;
  progress?: AnalyzeProgress | null;
  startedAt?: number;
}

export function Start({ state, dispatch, runtime, onAnalyze, progress = null, startedAt = 0 }: Props) {
  const qId = useId();
  const busy = state.phase === 'analyzing';
  const ready = Boolean(state.doc && state.question.trim()) && !busy;

  return (
    <main className="mx-auto flex max-w-[1200px] flex-wrap items-start gap-8 px-8 py-12">
      <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="m-0 text-[44px] leading-[1.1] font-bold tracking-tight">
            Ask the cloud.{' '}
            <br />
            Keep your secrets.
          </h1>
          <p className="m-0 max-w-[600px] text-lg leading-relaxed text-muted">
            Envoy's on-device AI reads your document and question first, then shares only what the cloud needs to answer. Your names, IDs and numbers stay
            on this computer.
          </p>
        </div>

        <div className="flex flex-col gap-5 rounded-card border border-line bg-surface p-6">
          <DocumentInput doc={state.doc} dispatch={dispatch} />

          <div className="flex flex-col gap-2">
            <label htmlFor={qId} className="text-[15px] font-semibold">
              What do you want to know?
            </label>
            <textarea
              id={qId}
              rows={2}
              value={state.question}
              onChange={(e) => dispatch({ type: 'SET_QUESTION', question: e.target.value })}
              className="resize-y rounded-control border border-line bg-surface px-4 py-3.5 text-[17px] leading-normal text-ink"
            />
            <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => dispatch({ type: 'SET_QUESTION', question: q })}
                  className="min-h-9 rounded-full border border-line bg-paper px-3 py-1.5 text-sm text-ink hover:bg-surface"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {busy && <AnalyzingPanel progress={progress} mode={runtime.status === 'available' ? 'private' : 'basic'} startedAt={startedAt || Date.now()} />}

          {state.phase === 'error' && state.error && (
            <p role="alert" className="m-0 rounded-control bg-danger-tint px-4 py-3 text-sm text-danger">
              {state.error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-sm text-muted-2">You'll review exactly what's shared before anything is sent.</span>
            <button
              onClick={onAnalyze}
              disabled={!ready}
              aria-busy={busy}
              className="min-h-12 rounded-control bg-ink px-5 py-3 font-semibold text-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Analyzing on this device…' : 'Analyze privately'}
            </button>
          </div>
        </div>
      </section>

      <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
        {runtime.status !== 'available' && runtime.status !== 'checking' && <OnDeviceGuide runtime={runtime} />}
        <HowItWorks />
      </aside>
    </main>
  );
}

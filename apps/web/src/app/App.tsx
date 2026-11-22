import { useEffect, useReducer, useState } from 'react';
import { answer } from '@envoy/ai';
import { AboutDialog } from '../components/AboutDialog';
import { LiveRegion } from '../components/LiveRegion';
import { Logo } from '../components/Logo';
import { NetworkInspector } from '../components/NetworkInspector';
import { OfflineBanner } from '../components/OfflineBanner';
import { StatusPill } from '../components/StatusPill';
import { DevPage } from '../dev/DevPage';
import { Answer } from '../screens/Answer';
import { Review } from '../screens/Review';
import { Start } from '../screens/Start';
import { runAnalysis } from './actions';
import { initialSession, sessionReducer } from './session';
import { useEnvoy, type EnvoyRuntime } from './useEnvoy';

/** The product shell; `runtime` is injected so tests can drive every state. */
export function AppShell({ runtime }: { runtime: EnvoyRuntime }) {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const [aboutOpen, setAboutOpen] = useState(false);
  const inspectable = typeof location !== 'undefined' && new URLSearchParams(location.search).has('inspect');
  const [inspectorOpen, setInspectorOpen] = useState(inspectable);

  // Move focus to the new screen's heading so keyboard and screen-reader users land in the right place.
  useEffect(() => {
    if (state.phase === 'review' || state.phase === 'answered') {
      document.querySelector<HTMLElement>('main h1')?.focus();
    }
  }, [state.phase]);

  const announcement =
    state.phase === 'analyzing'
      ? 'Reading your document on this device…'
      : state.phase === 'review' && state.analysis
        ? `Found ${state.analysis.receipt.foundTotal} personal items on your device. Review what the cloud will see.`
        : state.phase === 'sending'
          ? 'Sending the masked excerpt you approved…'
          : state.phase === 'answered' && state.result
            ? state.result.source === 'on_device'
              ? 'Answered on your device. Nothing was sent.'
              : 'Answer received. Your details were restored on this device.'
            : state.phase === 'error' && state.error
              ? state.error
              : '';

  async function analyze(question = state.question) {
    if (!state.doc || !runtime.deps) {
      dispatch({ type: 'FAIL', message: runtime.configError ?? 'Envoy is still starting. Try again in a moment.' });
      return;
    }
    dispatch({ type: 'ANALYZE_START' });
    try {
      const { analysis, notice } = await runAnalysis(runtime.deps, state.doc.text, question, runtime.status);
      dispatch({ type: 'ANALYZE_DONE', analysis, ...(notice ? { notice } : {}) });
    } catch (e) {
      dispatch({ type: 'FAIL', message: (e as Error).message });
    }
  }

  async function approve(outbound: string) {
    if (!state.analysis || !runtime.deps) return;
    dispatch({ type: 'SEND_START' });
    try {
      const result = await answer(state.analysis, outbound, runtime.deps, { sharedTags: state.sharedTags });
      dispatch({ type: 'ANSWER_DONE', result });
    } catch (e) {
      dispatch({ type: 'FAIL', message: (e as Error).message });
    }
  }

  function followUp(question: string) {
    dispatch({ type: 'SET_QUESTION', question });
    dispatch({ type: 'ANALYZE_START' });
    void (async () => {
      if (!state.doc || !runtime.deps) return;
      try {
        const { analysis, notice } = await runAnalysis(runtime.deps, state.doc.text, question, runtime.status);
        dispatch({ type: 'ANALYZE_DONE', analysis, ...(notice ? { notice } : {}) });
      } catch (e) {
        dispatch({ type: 'FAIL', message: (e as Error).message });
      }
    })();
  }

  let screen: React.ReactNode;
  if ((state.phase === 'review' || state.phase === 'sending') && state.analysis) {
    screen = <Review state={state} dispatch={dispatch} onApprove={(o) => void approve(o)} />;
  } else if (state.phase === 'answered' && state.result) {
    screen = <Answer question={state.question} result={state.result} onFollowUp={followUp} onNew={() => dispatch({ type: 'SET_QUESTION', question: '' })} />;
  } else {
    screen = <Start state={state} dispatch={dispatch} runtime={runtime} onAnalyze={() => void analyze()} />;
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-8 py-5">
        <Logo withWordmark animated />
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={runtime.status} progress={runtime.progress} />
          <button onClick={() => setAboutOpen(true)} className="min-h-9 px-2 text-sm font-semibold text-cloud-on-tint underline-offset-2 hover:underline">
            How it works
          </button>
          {inspectable && (
            <button onClick={() => setInspectorOpen(!inspectorOpen)} aria-pressed={inspectorOpen} className="min-h-9 rounded-control border border-line bg-surface px-3 text-sm font-semibold">
              Network
            </button>
          )}
          {state.doc && (
            <button
              onClick={() => dispatch({ type: 'CLEAR' })}
              className="min-h-9 rounded-control border border-line bg-surface px-3 text-sm font-semibold"
              title="Forget the document, the answer and every tag from memory"
            >
              Clear session
            </button>
          )}
        </div>
      </header>
      <OfflineBanner />
      {screen}
      <LiveRegion message={announcement} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <NetworkInspector open={inspectorOpen} onClose={() => setInspectorOpen(false)} />
    </div>
  );
}

function ProductApp() {
  return <AppShell runtime={useEnvoy()} />;
}

export function App() {
  if (typeof location !== 'undefined' && location.pathname.startsWith('/dev')) return <DevPage />;
  return <ProductApp />;
}

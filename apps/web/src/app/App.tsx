import { useReducer } from 'react';
import { Logo } from '../components/Logo';
import { StatusPill } from '../components/StatusPill';
import { DevPage } from '../dev/DevPage';
import { Start } from '../screens/Start';
import { runAnalysis } from './actions';
import { initialSession, sessionReducer } from './session';
import { useEnvoy, type EnvoyRuntime } from './useEnvoy';

/** The product shell; `runtime` is injected so tests can drive every state. */
export function AppShell({ runtime }: { runtime: EnvoyRuntime }) {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);

  async function analyze() {
    if (!state.doc || !runtime.deps) {
      dispatch({ type: 'FAIL', message: runtime.configError ?? 'Envoy is still starting. Try again in a moment.' });
      return;
    }
    dispatch({ type: 'ANALYZE_START' });
    try {
      const { analysis, notice } = await runAnalysis(runtime.deps, state.doc.text, state.question, runtime.status);
      dispatch({ type: 'ANALYZE_DONE', analysis, ...(notice ? { notice } : {}) });
    } catch (e) {
      dispatch({ type: 'FAIL', message: (e as Error).message });
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-8 py-5">
        <Logo withWordmark animated />
        <StatusPill status={runtime.status} progress={runtime.progress} />
      </header>
      <Start state={state} dispatch={dispatch} runtime={runtime} onAnalyze={analyze} />
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

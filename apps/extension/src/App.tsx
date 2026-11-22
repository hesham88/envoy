import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyze,
  answer,
  createStepModel,
  DEFAULT_SETTINGS,
  getDeviceStatus,
  initEnvoy,
  loadRemoteSettings,
  runPrivate,
  type Analysis,
  type AnalyzeProgress,
  type Deps,
  type DeviceStatus,
  type JsonSchema,
  type RemoteSettings,
} from '@envoy/ai';
import { DETECT_SCHEMA, EN_LEASE, MINIMIZE_SCHEMA, ROUTE_SCHEMA, SUGGESTED_QUESTIONS, type RestoredSpan, type Step } from '@envoy/core';
import { AnalyzingPanel, EnvoySeal, Logo, ModeChip, RestoredText, StatusPill, STEP_EMBLEMS, StepEmblem, TaggedText } from '@envoy/ui';
import { CLOUD_ENABLED, HOSTED_APP_URL, cloudModelOverride, isUnpacked, readFirebaseEnv } from './env';
import { FIX_HINTS, gateState } from './gate';

const SCHEMAS: Partial<Record<Step, JsonSchema>> = {
  detect: DETECT_SCHEMA as unknown as JsonSchema,
  minimize: MINIMIZE_SCHEMA as unknown as JsonSchema,
  route: ROUTE_SCHEMA as unknown as JsonSchema,
};

type Phase = 'idle' | 'analyzing' | 'review' | 'answering' | 'answered' | 'error';

interface AnswerState {
  text: string;
  spans: RestoredSpan[];
  source: 'on_device' | 'in_cloud';
  lighter: boolean;
  clausesSent: number;
  charsSent: number;
  keptTotal: number;
}

const card = 'rounded-card border border-line bg-surface p-4';
const label = 'mb-1 block text-sm font-semibold';
const area = 'w-full rounded-control border border-line bg-surface px-3 py-2 text-sm';
const btn = 'min-h-11 rounded-control border border-line bg-surface px-3.5 py-2.5 text-sm font-semibold';
const primary = 'min-h-11 w-full rounded-control bg-ink px-3.5 py-2.5 text-sm font-semibold text-paper disabled:opacity-45';

export function App() {
  const env = useMemo(() => {
    try {
      const { app, ai } = initEnvoy(readFirebaseEnv(), { dev: isUnpacked() });
      return { app, ai, error: null as string | null };
    } catch (e) {
      return { app: null, ai: null, error: (e as Error).message };
    }
  }, []);

  const [settings, setSettings] = useState<RemoteSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<DeviceStatus | 'checking'>('checking');
  const [dlProgress, setDlProgress] = useState<number | null>(null);
  const [doc, setDoc] = useState('');
  const [question, setQuestion] = useState<string>(SUGGESTED_QUESTIONS[0] ?? '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<AnalyzeProgress | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [outbound, setOutbound] = useState('');
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<AnswerState | null>(null);
  const [error, setError] = useState('');
  const startedAt = useRef(0);
  const gate = gateState(status);

  const deps: Deps | null = useMemo(() => {
    if (!env.ai) return null;
    const steps: Step[] = ['detect', 'minimize', 'route', 'answerLocal', 'reason'];
    const models = Object.fromEntries(steps.map((s) => [s, createStepModel(env.ai!, s, settings, SCHEMAS[s])])) as Deps['models'];
    return { runPrivate, models, getDeviceStatus };
  }, [env.ai, settings]);

  useEffect(() => {
    void getDeviceStatus().then(setStatus);
    if (env.app) {
      void loadRemoteSettings(env.app).then((s) => setSettings({ ...s, cloudModel: cloudModelOverride() ?? s.cloudModel }));
    }
    chrome.storage?.session
      .get('envoyPendingSelection')
      .then((v) => {
        const text = v?.envoyPendingSelection;
        if (typeof text === 'string' && text) {
          setDoc(text);
          void chrome.storage.session.remove('envoyPendingSelection');
        }
      })
      .catch(() => undefined);
    const onVis = () => {
      if (!document.hidden) void getDeviceStatus().then(setStatus);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [env.app]);

  async function enablePrivateMode() {
    if (!deps) return;
    try {
      await deps.models.route.initializeDeviceModel((p) => setDlProgress(p));
    } catch (e) {
      setError(`${(e as Error).name}: ${(e as Error).message}`);
    } finally {
      setDlProgress(null);
      setStatus(await getDeviceStatus());
    }
  }

  async function runAnalyze() {
    if (!deps || !doc.trim() || !question.trim()) return;
    setPhase('analyzing');
    setError('');
    setResult(null);
    setEditing(false);
    startedAt.current = Date.now();
    try {
      const a = await analyze(doc, question, deps, { onProgress: setProgress });
      setAnalysis(a);
      setOutbound(a.outbound);
      setPhase('review');
    } catch (e) {
      setError(`${(e as Error).name}: ${(e as Error).message}`);
      setPhase('error');
    } finally {
      setStatus(await getDeviceStatus());
    }
  }

  async function approveAndSend() {
    if (!deps || !analysis) return;
    setPhase('answering');
    setError('');
    try {
      const out = await answer(analysis, outbound, deps);
      setResult({
        text: out.text,
        spans: out.spans,
        source: out.source,
        lighter: out.lighter,
        clausesSent: out.receipt.clausesSent,
        charsSent: out.receipt.charsSent,
        keptTotal: out.receipt.keptTotal,
      });
      setPhase('answered');
    } catch (e) {
      setError(`${(e as Error).name}: ${(e as Error).message}`);
      setPhase('review');
    }
  }

  function clearAll() {
    setDoc('');
    setAnalysis(null);
    setOutbound('');
    setResult(null);
    setPhase('idle');
    setError('');
  }

  const needsCloud = analysis !== null && !analysis.route.local;
  const showHandoff = needsCloud && !CLOUD_ENABLED && phase !== 'answered';

  return (
    <div className="panel-scroll min-h-screen bg-paper font-sans text-ink">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-paper px-4 py-3">
        <Logo size={20} withWordmark animated />
        <StatusPill status={status} progress={dlProgress} />
      </header>

      <main className="grid gap-3 px-4 py-3">
        {env.error && <p className={`${card} bg-danger-tint text-danger`}>{env.error}</p>}

        {!gate.ready && (
          <section className={card} aria-labelledby="ready-h">
            <h2 id="ready-h" className="mb-1 text-[15px] font-semibold">Can this device run Envoy?</h2>
            <p className="text-sm text-muted">
              {status === 'no-api' || status === 'unavailable'
                ? 'Basic protection is on: built-in local rules mask your text, and nothing raw is ever sent to the cloud.'
                : 'Private steps run on this device or not at all. Without the model, Envoy uses Basic protection and never sends raw text to the cloud.'}
            </p>
            {gate.showEnable && (
              <button className={`${primary} mt-2`} type="button" onClick={enablePrivateMode}>
                Enable private mode
              </button>
            )}
            {gate.showFixHints && <p className="mt-2 text-xs text-muted">{FIX_HINTS}</p>}
            {analysis?.fallbackReason && <p className="mt-2 text-xs text-muted">Last run: {analysis.fallbackReason}</p>}
          </section>
        )}

        <section className="grid gap-1.5" aria-label="How Envoy handles your question">
          {STEP_EMBLEMS.slice(0, 3).map((s) => (
            <div key={s.key} className="flex items-center justify-between rounded-control border border-line bg-surface px-2.5 py-1.5">
              <span className="flex items-center gap-2 text-[13px] font-semibold">
                <StepEmblem step={s} size={34} /> {s.name}
              </span>
              <ModeChip kind={s.where === 'cloud' ? 'cloud' : 'device'}>{s.where === 'cloud' ? 'Cloud' : s.where === 'you' ? 'You' : 'On-device'}</ModeChip>
            </div>
          ))}
        </section>

        {!doc && phase === 'idle' && (
          <section className={`${card} grid justify-items-center gap-2 text-center`}>
            <EnvoySeal size={140} interactive={false} />
            <p className="text-sm text-muted">Select text on any page, right-click ? Ask Envoy about this selection. Or paste a document below.</p>
          </section>
        )}

        <section className={card}>
          <label className={label} htmlFor="docText">Document or selected text</label>
          <textarea id="docText" className={area} rows={7} value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="Paste a contract, letter or report. It is read on this device, never uploaded." />
          <div className="mt-2 flex gap-2">
            <button className={btn} type="button" onClick={() => setDoc(EN_LEASE.text)}>Try a sample contract</button>
            <button className={btn} type="button" onClick={clearAll}>Clear session</button>
          </div>
          <label className={`${label} mt-3`} htmlFor="question">Your question</label>
          <textarea id="question" className={area} rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button key={q} type="button" className="min-h-9 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium" onClick={() => setQuestion(q)}>
                {q}
              </button>
            ))}
          </div>
          <button className={`${primary} mt-3`} type="button" disabled={!deps || !doc.trim() || !question.trim() || phase === 'analyzing'} onClick={runAnalyze}>
            {phase === 'analyzing' ? 'Working on this device�' : 'Analyze privately'}
          </button>
        </section>

        {phase === 'analyzing' && (
          <AnalyzingPanel progress={progress} mode={status === 'available' ? 'private' : 'basic'} startedAt={startedAt.current} />
        )}

        {analysis && phase !== 'analyzing' && (
          <section className={card} aria-labelledby="cloud-h">
            <h2 id="cloud-h" className="mb-1 text-[15px] font-semibold">What the cloud will see</h2>
            <p className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <ModeChip kind="device">{analysis.mode === 'private' ? 'Private � on-device' : 'Basic protection'}</ModeChip>
              <span>clauses {analysis.selectedIds.join(', ') || 'none'} � {needsCloud ? 'reason in cloud' : 'answered on device'}</span>
            </p>
            <p className="mb-2 text-xs" role="status">
              {analysis.guard.ok ? 'Guard: clean � no personal detail leaves this device.' : `Guard: ${analysis.guard.leaks.length} leak(s) found � sending is blocked.`}
            </p>
            {editing ? (
              <textarea className={`${area} font-mono text-xs`} rows={9} value={outbound} onChange={(e) => setOutbound(e.target.value)} aria-label="Masked excerpt the cloud will see" />
            ) : (
              <div className="rounded-control border border-line p-2.5 font-mono text-xs leading-relaxed">
                <TaggedText text={outbound} />
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <button className={btn} type="button" onClick={() => setEditing((v) => !v)}>{editing ? 'Done editing' : 'Edit excerpt'}</button>
            </div>
            {showHandoff ? (
              <div className="mt-3 grid gap-2">
                <p className="text-sm text-muted">This question needs cloud reasoning. The extension runs on-device only, so hand it to the hosted Envoy app � it will re-run detection there and show you the same masked excerpt before anything is sent.</p>
                <a className={`${primary} text-center`} href={HOSTED_APP_URL} target="_blank" rel="noreferrer">Continue in Envoy web app</a>
              </div>
            ) : (
              <button className={`${primary} mt-3`} type="button" disabled={phase === 'answering'} onClick={approveAndSend}>
                {phase === 'answering' ? 'Asking�' : needsCloud ? 'Approve and send' : 'Answer on device'}
              </button>
            )}
          </section>
        )}

        {result && phase === 'answered' && (
          <section className={card} aria-labelledby="ans-h">
            <h2 id="ans-h" className="mb-1 text-[15px] font-semibold">Answer</h2>
            <p className="mb-2 flex flex-wrap gap-1.5">
              {result.source === 'in_cloud' ? <ModeChip kind="cloud">Reasoned in the cloud</ModeChip> : <ModeChip kind="device">{result.lighter ? 'Lighter on-device answer' : 'Answered on device'}</ModeChip>}
              <ModeChip kind="device">Personalized on device</ModeChip>
            </p>
            <div className="text-sm leading-relaxed">
              <RestoredText text={result.text} spans={result.spans} />
            </div>
            <p className="mt-2 text-xs text-muted">
              Left your device: {result.clausesSent} clause{result.clausesSent === 1 ? '' : 's'} � {result.charsSent} characters. Stayed on device: {result.keptTotal} personal items. This explains your document; it isn't legal advice.
            </p>
          </section>
        )}

        {error && (
          <p className={`${card} bg-danger-tint text-danger`} role="alert">{error}</p>
        )}
      </main>
      <footer className="px-4 pb-4 text-xs text-muted">Text lives in memory / session only. Nothing is stored or synced.</footer>
    </div>
  );
}


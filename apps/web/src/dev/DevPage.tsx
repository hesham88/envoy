/**
 * /dev: raw feasibility tests for every inference mode (BRIEF Phase 1).
 * Shows the response, latency, inference source and any error verbatim.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { GenerativeModel } from 'firebase/ai';
import {
  createStepModel,
  DEFAULT_SETTINGS,
  getDeviceStatus,
  initEnvoy,
  loadRemoteSettings,
  networkLog,
  runPrivate,
  type DeviceStatus,
  type NetworkEntry,
  type RemoteSettings,
} from '@envoy/ai';
import { cloudModelOverride, readFirebaseEnv } from '../env';
import { PipelinePanel } from './PipelinePanel';

interface Result {
  label: string;
  ok: boolean;
  text: string;
  ms?: number;
  source?: string;
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-card)',
  padding: 20,
};
const button: CSSProperties = {
  font: 'inherit',
  fontWeight: 600,
  minHeight: 44,
  padding: '10px 16px',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  cursor: 'pointer',
};

function useEnvoy() {
  return useMemo(() => {
    try {
      return { ...initEnvoy(readFirebaseEnv(), { dev: import.meta.env.DEV }), error: null as string | null };
    } catch (e) {
      return { app: null, ai: null, error: (e as Error).message };
    }
  }, []);
}

export function DevPage() {
  const env = useEnvoy();
  const [status, setStatus] = useState<DeviceStatus | 'checking'>('checking');
  const [settings, setSettings] = useState<RemoteSettings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [log, setLog] = useState<readonly NetworkEntry[]>([]);

  useEffect(() => networkLog.subscribe((e) => setLog([...e])), []);
  useEffect(() => {
    void getDeviceStatus().then(setStatus);
    if (env.app) {
      void loadRemoteSettings(env.app).then((s) => setSettings({ ...s, cloudModel: cloudModelOverride() ?? s.cloudModel }));
    }
  }, [env.app]);

  const model = (step: 'route' | 'reason', schema?: Record<string, unknown>): GenerativeModel | null =>
    env.ai ? createStepModel(env.ai, step, settings, schema) : null;

  const record = (r: Result) => setResults((prev) => [r, ...prev]);

  async function run(label: string, fn: () => Promise<Omit<Result, 'label' | 'ok'>>) {
    try {
      record({ label, ok: true, ...(await fn()) });
    } catch (e) {
      const err = e as Error;
      record({ label, ok: false, text: `${err.name}: ${err.message}` });
    } finally {
      setStatus(await getDeviceStatus());
    }
  }

  // Must run inside the click handler: Chrome requires a user gesture to download the model.
  function enablePrivateMode() {
    const m = model('route');
    if (!m) return;
    setProgress(0);
    void run('Enable private mode', async () => {
      await m.initializeDeviceModel((p) => setProgress(p));
      return { text: 'Device model initialised.' };
    });
  }

  const testDevice = () =>
    run('ONLY_ON_DEVICE (guarded)', async () => {
      const m = model('route')!;
      const out = await runPrivate(m, 'Reply with one short sentence: what is 2 + 2?', 'route');
      return { text: out.text, ms: out.ms, source: out.source };
    });

  const testCloud = () =>
    run('PREFER_IN_CLOUD', async () => {
      const m = model('reason')!;
      const t = performance.now();
      const res = await m.generateContent('Reply with one short sentence: what is the capital of Egypt?');
      return { text: res.response.text(), ms: Math.round(performance.now() - t), source: res.response.inferenceSource ?? 'unknown' };
    });

  const testStructured = () =>
    run('Structured output on-device', async () => {
      const schema = { type: 'object', properties: { ok: { type: 'boolean' }, word: { type: 'string' } }, required: ['ok', 'word'] };
      const out = await runPrivate(model('route', schema)!, 'Return ok=true and one English word for "hello".', 'route');
      return { text: out.text, ms: out.ms, source: out.source };
    });

  const simulateMissing = () =>
    run('Simulate missing LanguageModel (#10635)', async () => {
      const g = globalThis as Record<string, unknown>;
      const saved = g.LanguageModel;
      const had = 'LanguageModel' in g;
      delete g.LanguageModel;
      try {
        await runPrivate(model('route')!, 'This text must never reach the cloud.', 'route');
        return { text: 'UNEXPECTED: the guard did not block.' };
      } catch (e) {
        return { text: `Guard blocked the request before any call: ${(e as Error).name}`, source: 'none' };
      } finally {
        if (had) g.LanguageModel = saved;
      }
    });

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 32, display: 'grid', gap: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Envoy · /dev</h1>
        <span
          role="status"
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            fontWeight: 600,
            background: status === 'available' ? 'var(--device-tint)' : 'var(--detected)',
            color: status === 'available' ? 'var(--device-on-tint)' : 'var(--ink)',
          }}
        >
          On-device model: {status}
          {progress !== null && progress < 1 ? ` · downloading ${Math.round(progress * 100)}%` : ''}
        </span>
      </header>

      {env.error && <p style={{ ...card, background: 'var(--danger-tint)', color: 'var(--danger)' }}>{env.error}</p>}

      <section style={card}>
        <p style={{ marginTop: 0, color: 'var(--muted)' }}>
          Cloud model: <code>{settings.cloudModel}</code> · prompts {settings.promptVersion} · App Check{' '}
          {import.meta.env.DEV ? 'debug provider (see console for the token)' : 'reCAPTCHA Enterprise'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button style={{ ...button, background: 'var(--ink)', color: 'var(--paper)' }} onClick={enablePrivateMode}>
            Enable private mode
          </button>
          <button style={button} onClick={testDevice}>Test ONLY_ON_DEVICE</button>
          <button style={button} onClick={testCloud}>Test PREFER_IN_CLOUD</button>
          <button style={button} onClick={testStructured}>Test structured output on-device</button>
          <button style={button} onClick={simulateMissing}>Simulate missing LanguageModel</button>
        </div>
      </section>

      <section style={card} aria-live="polite">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Results</h2>
        {results.length === 0 && <p style={{ color: 'var(--muted)' }}>No tests run yet.</p>}
        {results.map((r, i) => (
          <div key={i} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
            <strong style={{ color: r.ok ? 'var(--device-on-tint)' : 'var(--danger)' }}>{r.ok ? 'OK' : 'Error'}</strong> · {r.label}
            {r.ms !== undefined && <span style={{ fontFamily: 'var(--font-mono)' }}> · {r.ms} ms</span>}
            {r.source && <span> · source: <code>{r.source}</code></span>}
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 13, margin: '6px 0 0' }}>{r.text}</pre>
          </div>
        ))}
      </section>

      <PipelinePanel ai={env.ai} settings={settings} />

      <section style={card}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Network log</h2>
        {log.length === 0 && <p style={{ color: 'var(--muted)' }}>Nothing yet.</p>}
        {log.map((e, i) => (
          <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 13, borderTop: '1px solid var(--line)', padding: '6px 0' }}>
            {new Date(e.at).toLocaleTimeString()} · {e.step} → {e.target}
            {e.blocked ? ' · BLOCKED' : ''} · {e.payload.slice(0, 120)}
          </div>
        ))}
      </section>
    </main>
  );
}

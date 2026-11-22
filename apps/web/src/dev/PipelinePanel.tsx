/** /dev panel: runs the full privacy pipeline on the sample lease and prints every intermediate result. */
import { useState, type CSSProperties } from 'react';
import type { AI } from 'firebase/ai';
import { DETECT_SCHEMA, EN_LEASE, MINIMIZE_SCHEMA, ROUTE_SCHEMA, SUGGESTED_QUESTIONS, type Step } from '@envoy/core';
import {
  analyze,
  answer,
  createStepModel,
  getDeviceStatus,
  runPrivate,
  type Analysis,
  type Deps,
  type JsonSchema,
  type RemoteSettings,
} from '@envoy/ai';

const card: CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', padding: 20 };
const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 13, whiteSpace: 'pre-wrap', margin: 0 };
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

const SCHEMAS: Partial<Record<Step, JsonSchema>> = {
  detect: DETECT_SCHEMA as unknown as JsonSchema,
  minimize: MINIMIZE_SCHEMA as unknown as JsonSchema,
  route: ROUTE_SCHEMA as unknown as JsonSchema,
};

function makeDeps(ai: AI, settings: RemoteSettings): Deps {
  const steps: Step[] = ['detect', 'minimize', 'route', 'answerLocal', 'reason'];
  const models = Object.fromEntries(steps.map((s) => [s, createStepModel(ai, s, settings, SCHEMAS[s])])) as Deps['models'];
  return { runPrivate, models, getDeviceStatus };
}

export function PipelinePanel({ ai, settings }: { ai: AI | null; settings: RemoteSettings }) {
  const [question, setQuestion] = useState<string>(SUGGESTED_QUESTIONS[0]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [outbound, setOutbound] = useState('');
  const [result, setResult] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!ai) return;
    setBusy(true);
    setResult('');
    try {
      const a = await analyze(EN_LEASE.text, question, makeDeps(ai, settings));
      setAnalysis(a);
      setOutbound(a.outbound);
    } catch (e) {
      setResult(`${(e as Error).name}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!ai || !analysis) return;
    setBusy(true);
    try {
      const out = await answer(analysis, outbound, makeDeps(ai, settings));
      setResult(`[${out.source}${out.lighter ? ', lighter on-device answer' : ''}]\n${out.text}\n\nReceipt: ${JSON.stringify(out.receipt, null, 2)}`);
    } catch (e) {
      setResult(`${(e as Error).name}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ ...card, display: 'grid', gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Pipeline on the sample lease</h2>
      <p style={{ margin: 0, color: 'var(--muted)' }}>{EN_LEASE.notice}</p>
      <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
        Question
        <input value={question} onChange={(e) => setQuestion(e.target.value)} style={{ font: 'inherit', padding: 10, borderRadius: 10, border: '1px solid var(--line)' }} />
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {SUGGESTED_QUESTIONS.map((q) => (
          <button key={q} style={{ ...button, minHeight: 36, padding: '6px 12px', fontWeight: 500 }} onClick={() => setQuestion(q)}>
            {q}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button style={{ ...button, background: 'var(--ink)', color: 'var(--paper)' }} onClick={run} disabled={busy || !ai}>
          Run pipeline
        </button>
        <button style={button} onClick={send} disabled={busy || !analysis}>
          Approve and send
        </button>
      </div>

      {analysis && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0 }}>
            Mode: <strong>{analysis.mode === 'private' ? 'Private (on-device)' : 'Basic protection (rules only)'}</strong> · selected clauses:{' '}
            {analysis.selectedIds.join(', ')} · route: {analysis.route.local ? 'answer on device' : 'reason in cloud'} ({analysis.route.reason})
          </p>
          {analysis.fallbackReason && (
            <p style={{ margin: 0, color: 'var(--danger)' }}>Fallback reason: {analysis.fallbackReason}</p>
          )}
          <details>
            <summary>Entities ({analysis.entities.length})</summary>
            <pre style={mono}>
              {analysis.entities.map((e) => `${e.type.padEnd(12)} ${analysis.tags.tagOf(e).padEnd(14)} ${e.source.padEnd(6)} ${e.value}`).join('\n')}
            </pre>
          </details>
          {analysis.flaggedForReview.length > 0 && (
            <p style={{ margin: 0 }}>Flagged for review (masked by default): {analysis.flaggedForReview.map((e) => e.value).join(', ')}</p>
          )}
          <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
            What the cloud will see (editable; re-checked before sending)
            <textarea value={outbound} onChange={(e) => setOutbound(e.target.value)} rows={8} style={{ ...mono, padding: 12, borderRadius: 10, border: '1px solid var(--line)' }} />
          </label>
          <p style={{ margin: 0, color: analysis.guard.ok ? 'var(--device-on-tint)' : 'var(--danger)' }}>
            Guard: {analysis.guard.ok ? 'clean' : `${analysis.guard.leaks.length} leak(s): ${analysis.guard.leaks.map((l) => l.value).join(', ')}`}
          </p>
          <details>
            <summary>Receipt</summary>
            <pre style={mono}>{JSON.stringify(analysis.receipt, null, 2)}</pre>
          </details>
        </div>
      )}
      {result && <pre style={{ ...mono, borderTop: '1px solid var(--line)', paddingTop: 12 }}>{result}</pre>}
    </section>
  );
}

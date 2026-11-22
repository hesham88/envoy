import { useState } from 'react';
import type { Analysis } from '@envoy/ai';
import { ModeChip } from '@envoy/ui';
import { diffWords } from './diff';

export interface RecorderStep {
  step: string;
  where: 'device' | 'cloud' | 'rules';
  model: string;
  ms: number;
  bytes: number;
  guard: string;
  payload: string;
}

const DEVICE_MODEL = 'Gemini Nano (Chrome built-in AI)';

export function buildSteps(analysis: Analysis, cloudModel: string, payloads: { step: string; payload: string }[], answerMs?: { source: string; ms: number }): RecorderStep[] {
  const steps: RecorderStep[] = analysis.steps.map((s) => ({
    step: s.step,
    where: s.source === 'in_cloud' ? 'cloud' : s.source === 'rules' ? 'rules' : 'device',
    model: s.source === 'in_cloud' ? cloudModel : s.source === 'rules' ? 'Built-in rules (no model)' : DEVICE_MODEL,
    ms: s.ms,
    bytes: s.source === 'in_cloud' ? analysis.outbound.length : 0,
    guard: s.source === 'in_cloud' ? (analysis.guard.ok ? 'Guard: passed' : 'Guard: BLOCKED') : 'Device guard: passed',
    payload: payloads.filter((p) => p.step === s.step).map((p) => p.payload).join('\n---\n') || '(no payload recorded)',
  }));
  if (answerMs) {
    steps.push({
      step: 'reason',
      where: answerMs.source === 'in_cloud' ? 'cloud' : 'device',
      model: answerMs.source === 'in_cloud' ? cloudModel : DEVICE_MODEL,
      ms: answerMs.ms,
      bytes: answerMs.source === 'in_cloud' ? analysis.outbound.length : 0,
      guard: analysis.guard.ok ? 'Guard: passed' : 'Guard: BLOCKED',
      payload: payloads.filter((p) => p.step === 'reason').map((p) => p.payload).join('\n---\n') || analysis.outbound,
    });
  }
  return steps;
}

export function FlightRecorder({ analysis, cloudModel, payloads, answerMs }: { analysis: Analysis; cloudModel: string; payloads: { step: string; payload: string }[]; answerMs?: { source: string; ms: number } }) {
  const [open, setOpen] = useState<string | null>(null);
  const steps = buildSteps(analysis, cloudModel, payloads, answerMs);
  const before = analysis.chunks.filter((c) => analysis.selectedIds.includes(c.id)).map((c) => c.text).join('\n');
  const diff = diffWords(before, analysis.outbound);
  return (
    <section className="rounded-card border border-line bg-surface p-4" aria-labelledby="rec-h">
      <h2 id="rec-h" className="mb-2 text-[15px] font-semibold">Privacy flight recorder</h2>
      <ol className="grid gap-1.5">
        {steps.map((s) => (
          <li key={s.step} className="rounded-control border border-line">
            <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left" onClick={() => setOpen(open === s.step ? null : s.step)} aria-expanded={open === s.step}>
              <span className="text-[13px] font-semibold capitalize">{s.step}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <ModeChip kind={s.where === 'cloud' ? 'cloud' : 'device'}>{s.where === 'cloud' ? 'Cloud' : s.where === 'rules' ? 'Rules' : 'On-device'}</ModeChip>
                {s.model} · {s.ms} ms · {s.bytes} B · {s.guard}
              </span>
            </button>
            {open === s.step && <pre className="max-h-44 overflow-auto border-t border-line p-2.5 font-mono text-[11px] leading-relaxed">{s.payload}</pre>}
          </li>
        ))}
      </ol>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold">Before / after: what changed</summary>
        <p className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
          {diff.slice(0, 120).map((p, i) =>
            p.kind === 'same' ? <span key={i}>{p.text}</span> : p.kind === 'removed'
              ? <mark key={i} className="bg-detected text-ink line-through">{p.text}</mark>
              : <mark key={i} className="bg-device-tint text-device-on-tint">{p.text}</mark>,
          )}
        </p>
      </details>
    </section>
  );
}

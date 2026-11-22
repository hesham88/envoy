/**
 * Privacy Flight Recorder: one row per pipeline step, filled from what really happened, not a script.
 * Where it ran comes from the pipeline's step records (`source`, checked against the response's
 * inferenceSource by the device guard); times are measured; the cloud row shows the exact characters
 * that left the device. Firebase AI Logic doesn't say which on-device model Chrome used, so the
 * device rows name "Chrome's built-in model" and never guess a version.
 */
import {
  Check,
  CircleDashed,
  Cloud,
  Cpu,
  Hand,
  Loader2,
  ShieldCheck,
  SkipForward,
} from 'lucide-react';
import type { AnalyzeProgress, Analysis } from '@envoy/ai';
import type { ReceiptStep, Step } from '@envoy/core';
import type { AnswerResult, Phase } from '../app/session';

type RowState = 'waiting' | 'running' | 'done' | 'skipped';
type Where = 'device' | 'rules' | 'you' | 'cloud';

interface Row {
  key: string;
  label: string;
  where: Where;
  model: string;
  state: RowState;
  ms?: number;
  detail?: string;
}

const WHERE: Record<Where, { text: string; cls: string; Icon: typeof Cpu }> = {
  device: { text: 'This device', cls: 'border-device/50 text-device-on-tint', Icon: Cpu },
  rules: { text: 'This device', cls: 'border-device/50 text-device-on-tint', Icon: ShieldCheck },
  you: { text: 'You', cls: 'border-line text-ink', Icon: Hand },
  cloud: { text: 'Cloud', cls: 'border-cloud/60 text-cloud-on-tint', Icon: Cloud },
};

const ORDER: Step[] = ['detect', 'minimize', 'route'];
const LABEL: Record<string, string> = {
  rules: 'Checked with local rules',
  detect: 'Found private details',
  minimize: 'Kept only what the question needs',
  route: 'Decided where to answer',
  approve: 'Your approval',
  reason: 'Reasoned over tags',
  answerLocal: 'Answered on this device',
  restore: 'Restored your details',
};

export interface FlightInput {
  phase: Phase;
  progress: AnalyzeProgress | null;
  analysis: Analysis | null;
  result: AnswerResult | null;
  cloudModel: string;
  localOnly: boolean;
}

const stepMs = (steps: ReceiptStep[] | undefined, s: Step) =>
  steps?.filter((x) => x.step === s).reduce((a, x) => a + x.ms, 0);

export function buildRows({
  phase,
  progress,
  analysis,
  result,
  cloudModel,
  localOnly,
}: FlightInput): Row[] {
  const steps = result?.receipt.steps ?? analysis?.steps;
  const basic = analysis?.mode === 'basic';
  const analyzing = phase === 'analyzing';
  const current = progress?.step;
  const rows: Row[] = [];

  rows.push({
    key: 'rules',
    label: LABEL.rules!,
    where: 'rules',
    model: 'Local rules',
    state: analysis
      ? 'done'
      : analyzing
        ? current === 'rules' || !current
          ? 'running'
          : 'done'
        : 'waiting',
  });

  for (const s of ORDER) {
    const ran = steps?.some((x) => x.step === s && x.source === 'on_device');
    let state: RowState = 'waiting';
    if (analysis) state = basic || !ran ? 'skipped' : 'done';
    else if (analyzing && current)
      state =
        current === s
          ? 'running'
          : ORDER.indexOf(s) < ORDER.indexOf(current as Step)
            ? 'done'
            : 'waiting';
    const parts =
      analyzing && current === s && progress && progress.parts > 1
        ? `part ${progress.part} of ${progress.parts}`
        : undefined;
    // The on-device model's own one-line reason, so its decisions are explained (PAIR: explain for understanding).
    const why =
      state === 'done' && analysis
        ? s === 'minimize'
          ? analysis.selectionReason
          : s === 'route'
            ? analysis.route.reason
            : undefined
        : undefined;
    rows.push({
      key: s,
      label: LABEL[s]!,
      where: 'device',
      model: "Chrome's built-in model",
      state,
      ...(state === 'done' ? { ms: stepMs(steps, s) } : {}),
      ...(state === 'skipped'
        ? { detail: basic ? 'No on-device model: Basic protection' : 'Not needed' }
        : {}),
      ...(parts ? { detail: parts } : {}),
      ...(why ? { detail: why } : {}),
    });
  }

  const local = !!analysis && analysis.mode === 'private' && (analysis.route.local || localOnly);
  rows.push({
    key: 'approve',
    label: LABEL.approve!,
    where: 'you',
    model: 'No model',
    state: !analysis
      ? 'waiting'
      : local
        ? 'skipped'
        : phase === 'review'
          ? 'running'
          : phase === 'sending' || phase === 'answered'
            ? 'done'
            : 'waiting',
    ...(local
      ? { detail: 'Nothing leaves the device' }
      : phase === 'review'
        ? { detail: 'Waiting for you' }
        : {}),
  });

  if (local) {
    rows.push({
      key: 'answerLocal',
      label: LABEL.answerLocal!,
      where: 'device',
      model: "Chrome's built-in model",
      state: result ? 'done' : phase === 'sending' ? 'running' : 'waiting',
      ...(result ? { ms: stepMs(steps, 'answerLocal'), detail: '0 bytes sent' } : {}),
    });
  } else {
    const sent = result?.receipt.charsSent;
    rows.push({
      key: 'reason',
      label: LABEL.reason!,
      where: result && result.source === 'on_device' ? 'device' : 'cloud',
      model:
        result && result.source === 'on_device'
          ? "Chrome's built-in model (cloud unreachable)"
          : cloudModel,
      state:
        localOnly && !result
          ? 'skipped'
          : result
            ? 'done'
            : phase === 'sending'
              ? 'running'
              : 'waiting',
      ...(result ? { ms: stepMs(steps, 'reason') ?? stepMs(steps, 'answerLocal') } : {}),
      ...(sent !== undefined && result?.source === 'in_cloud'
        ? { detail: `${sent.toLocaleString()} characters sent, as you approved` }
        : {}),
    });
  }

  rows.push({
    key: 'restore',
    label: LABEL.restore!,
    where: 'rules',
    model: 'No model',
    state: result ? 'done' : 'waiting',
    ...(result ? { detail: `${result.spans.length} values restored` } : {}),
  });
  return rows;
}

function StateIcon({ state }: { state: RowState }) {
  if (state === 'done')
    return <Check size={15} strokeWidth={2.25} className="text-device" aria-label="done" />;
  if (state === 'running')
    return (
      <Loader2 size={15} strokeWidth={2} className="animate-spin text-ink" aria-label="running" />
    );
  if (state === 'skipped')
    return <SkipForward size={14} strokeWidth={2} className="text-muted-2" aria-label="skipped" />;
  return (
    <CircleDashed size={14} strokeWidth={1.75} className="text-muted-2" aria-label="waiting" />
  );
}

export function FlightRecorder(props: FlightInput & { open?: boolean }) {
  const rows = buildRows(props);
  const total = rows.reduce((a, r) => a + (r.ms ?? 0), 0);
  const cloudRow = rows.find((r) => r.key === 'reason');
  return (
    <details open={props.open} className="group rounded-[16px] border border-line bg-surface/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14px]">
        <span className="flex items-center gap-2 font-semibold text-ink">
          <ShieldCheck size={16} strokeWidth={2} className="text-device" aria-hidden="true" />
          Privacy flight recorder
        </span>
        <span className="text-muted">
          {cloudRow?.state === 'done' && cloudRow.where === 'cloud'
            ? '1 cloud call'
            : props.result
              ? 'No cloud calls'
              : 'Recording'}
          {total > 0 ? `, ${(total / 1000).toFixed(1)} s` : ''}
        </span>
      </summary>
      <ol className="m-0 list-none border-t border-line p-0">
        {rows.map((r) => {
          const w = WHERE[r.where];
          return (
            <li
              key={r.key}
              data-row={r.key}
              data-state={r.state}
              className="grid grid-cols-[20px_1fr_auto] items-start gap-x-3 gap-y-1 border-b border-line/60 px-4 py-2.5 last:border-b-0"
            >
              <span className="pt-0.5">
                <StateIcon state={r.state} />
              </span>
              <span className={`text-[14px] ${r.state === 'waiting' ? 'text-muted' : 'text-ink'}`}>
                {r.label}
                {r.detail && <span className="block text-[12.5px] text-muted">{r.detail}</span>}
              </span>
              <span className="flex flex-col items-end gap-1 text-right">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] ${w.cls}`}
                >
                  <w.Icon size={12} strokeWidth={2} aria-hidden="true" />
                  {w.text}
                </span>
                <span className="font-mono text-[11.5px] text-muted">
                  {r.model}
                  {r.ms !== undefined ? ` · ${(r.ms / 1000).toFixed(1)} s` : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

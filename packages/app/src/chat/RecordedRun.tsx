/**
 * A recorded Private-mode run, for people whose Chrome can't run the on-device model yet (most
 * judges). It replays a real run of the real pipeline, recorded by tests/eval/record-demo-trace.mjs
 * in the model Chrome, word for word: the steps and their real times, what the cloud saw, what was
 * found, the answer and the network ledger. It is labelled as a recording everywhere; nothing runs.
 * recorded-run.gemma4.json is a byte-for-byte copy of tests/eval/probes/demo-trace-gemma4.json
 * (a test enforces it).
 */
import { useEffect, useRef, useState } from 'react';
import { Cloud, Cpu, Play, X } from 'lucide-react';

interface Trace {
  model: { component: string; version: string; label: string };
  cloudModel: string;
  backend: string;
  recordedAt: string;
  documentTitle: string;
  question: string;
  analyzeMs: number;
  steps: { step: string; source: 'on_device' | 'in_cloud'; ms: number }[];
  selectionReason: string;
  route: { local: boolean; reason: string };
  outbound: string;
  guardOk: boolean;
  entities: { type: string; value: string; role: string | null; source: string }[];
  answer: {
    text: string;
    spans: { start: number; end: number; tag: string; value: string; computed: boolean }[];
  };
  network: { step: string; target: 'device' | 'cloud'; blocked: boolean; chars: number }[];
}

const STEP_LABEL: Record<string, string> = {
  minimize: 'Kept only what the question needs',
  detect: 'Found private details',
  route: 'Decided where to answer',
  reason: 'Reasoned over tags',
};
const REPLAY_MS = 5200;

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export function RecordedRun({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [shown, setShown] = useState(0); // steps revealed by the replay
  const [run, setRun] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    void import('./recorded-run.gemma4.json').then((m) => setTrace(m.default as unknown as Trace));
  }, []);

  // Replay: the real 2.5 minutes compressed into a few seconds, one step after another.
  useEffect(() => {
    if (!trace) return;
    const all = trace.steps.length;
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(all);
      return;
    }
    setShown(0);
    const total = trace.steps.reduce((n, s) => n + s.ms, 0);
    let at = 300;
    const timers = trace.steps.map((s, i) => {
      at += Math.max(500, (s.ms / total) * REPLAY_MS);
      return window.setTimeout(() => setShown(i + 1), at);
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [trace, run]);

  const longest = trace ? Math.max(...trace.steps.map((s) => s.ms)) : 1;
  const sentToCloud = trace?.network.filter((n) => n.target === 'cloud') ?? [];
  // A detail can be mentioned more than once in the lease: list it once.
  const details = trace
    ? [...new Map(trace.entities.map((e) => [`${e.type}|${e.value}`, e])).values()]
    : [];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="recorded-h"
      className="envoy-uv m-auto w-[min(760px,calc(100vw-32px))] rounded-[20px] border border-line p-0 text-ink backdrop:bg-black/60"
    >
      <div className="flex max-h-[88vh] flex-col gap-5 overflow-auto p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="recorded-h" className="m-0 font-display text-[26px] font-[560]">
            A recorded Private-mode run
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        {!trace ? (
          <p className="m-0 text-[14px] text-muted">Loading the recording…</p>
        ) : (
          <>
            <p className="m-0 rounded-[12px] border border-detected-line/60 bg-detected/30 px-4 py-3 text-[13.5px] leading-relaxed">
              <b>Recording, not live.</b> Recorded on {day(trace.recordedAt)} in Chrome with{' '}
              {trace.model.label} ({trace.model.component} {trace.model.version}), the model Gemini
              Nano 4 is built on, on a laptop running the model on its CPU. Cloud model:{' '}
              <span className="font-mono">{trace.cloudModel}</span>. Everything below is the real
              output, word for word. Nothing is running now.
            </p>

            <section aria-labelledby="rec-q" className="flex flex-col gap-1">
              <h3 id="rec-q" className="m-0 text-[13px] font-semibold text-muted">
                {trace.documentTitle}
              </h3>
              <p className="m-0 font-display text-[20px]">“{trace.question}”</p>
            </section>

            <section aria-labelledby="rec-steps" className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <h3 id="rec-steps" className="m-0 text-[15px] font-semibold">
                  Where each step ran, and how long it really took
                </h3>
                <button
                  onClick={() => setRun((r) => r + 1)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] hover:border-device/60"
                >
                  <Play size={13} aria-hidden="true" /> Replay
                </button>
              </div>
              <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-live="polite">
                {trace.steps.map((s, i) => {
                  const device = s.source === 'on_device';
                  const done = i < shown;
                  return (
                    <li
                      key={s.step}
                      className={`flex flex-col gap-1 rounded-[12px] border px-3 py-2 transition-opacity duration-300 ${
                        done ? 'opacity-100' : 'opacity-35'
                      } ${device ? 'border-device/50' : 'border-cloud/60'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
                        <span className="flex items-center gap-2">
                          {device ? (
                            <Cpu size={14} className="text-device" aria-hidden="true" />
                          ) : (
                            <Cloud size={14} className="text-cloud-on-tint" aria-hidden="true" />
                          )}
                          <b>{STEP_LABEL[s.step] ?? s.step}</b>
                        </span>
                        <span className="text-muted">
                          {device
                            ? `On this device, ${trace.model.label}`
                            : `Cloud, ${trace.cloudModel}`}
                          {' · '}
                          {done ? seconds(s.ms) : '…'}
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-surface"
                        aria-hidden="true"
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ${device ? 'bg-device' : 'bg-cloud'}`}
                          style={{ width: done ? `${Math.max(2, (s.ms / longest) * 100)}%` : '0%' }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="m-0 text-[12.5px] text-muted">
                The replay is faster than the run: the on-device steps took{' '}
                {seconds(trace.analyzeMs)} on this CPU. With a capable GPU they are much quicker.
              </p>
            </section>

            <section aria-labelledby="rec-found" className="flex flex-col gap-2">
              <h3 id="rec-found" className="m-0 text-[15px] font-semibold">
                Found on the device: {details.length} private details ({trace.entities.length}{' '}
                mentions)
              </h3>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 text-[12.5px]">
                {details.map((e, i) => (
                  <li key={i} className="rounded-full border border-line px-2.5 py-1">
                    {e.value}{' '}
                    <span className="text-muted">
                      {e.type.toLowerCase().replace('_', ' ')}
                      {e.role ? `, ${e.role}` : ''} ·{' '}
                      {e.source === 'rules' ? 'local rules' : 'on-device model'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="rec-out" className="flex flex-col gap-2">
              <h3 id="rec-out" className="m-0 text-[15px] font-semibold">
                What the cloud saw ({sentToCloud.reduce((n, x) => n + x.chars, 0)} characters)
              </h3>
              <p className="m-0 text-[13px] text-muted">{trace.selectionReason}</p>
              <pre className="m-0 overflow-auto rounded-[12px] border border-cloud/60 bg-surface p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">
                {trace.outbound}
              </pre>
              <p className="m-0 text-[12.5px] text-muted">
                The guard checked this text before it left:{' '}
                {trace.guardOk ? 'no raw details' : 'blocked'}.
              </p>
            </section>

            <section aria-labelledby="rec-a" className="flex flex-col gap-2">
              <h3 id="rec-a" className="m-0 text-[15px] font-semibold">
                The answer, with real values put back on the device
              </h3>
              <p className="m-0 rounded-[12px] border border-line p-3 text-[14px] leading-relaxed whitespace-pre-wrap">
                {withSpans(trace.answer.text, trace.answer.spans)}
              </p>
            </section>

            <section aria-labelledby="rec-net" className="flex flex-col gap-2">
              <h3 id="rec-net" className="m-0 text-[15px] font-semibold">
                Network ledger
              </h3>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
                {trace.network.map((n, i) => (
                  <li key={i} className="flex justify-between gap-3 border-b border-line py-1">
                    <span>{STEP_LABEL[n.step] ?? n.step}</span>
                    <span
                      className={
                        n.target === 'cloud' ? 'text-cloud-on-tint' : 'text-device-on-tint'
                      }
                    >
                      {n.target === 'cloud'
                        ? `${n.chars} characters to the cloud`
                        : 'stayed on this device'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <p className="m-0 text-[12.5px] text-muted">
              Recorded with <span className="font-mono">tests/eval/record-demo-trace.mjs</span>; the
              file is <span className="font-mono">tests/eval/probes/demo-trace-gemma4.json</span> in
              the repository.
            </p>
          </>
        )}
      </div>
    </dialog>
  );
}

function withSpans(text: string, spans: Trace['answer']['spans']) {
  const out: (string | React.JSX.Element)[] = [];
  let at = 0;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    out.push(text.slice(at, s.start));
    out.push(
      <mark
        key={s.start}
        title={s.computed ? `Worked out on this device from ${s.tag}` : `Restored from ${s.tag}`}
        className="rounded-[4px] bg-device/20 px-1 text-ink"
      >
        {text.slice(s.start, s.end)}
      </mark>,
    );
    at = s.end;
  }
  out.push(text.slice(at));
  return out;
}

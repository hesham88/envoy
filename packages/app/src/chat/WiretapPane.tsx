import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Cpu, ShieldAlert, X } from 'lucide-react';
import type { SessionDoc } from '../app/session';
import type { WiretapCard, WiretapView } from './wiretap';

const STEP_LABEL: Record<string, string> = {
  detect: 'Finding private details',
  minimize: 'Choosing the clauses the question needs',
  route: 'Deciding where to answer',
  answerLocal: 'Answering on this device',
  reason: 'Answering on this device (the cloud was unreachable)',
  tripwire: 'A cloud request during a private step',
};

const CHECK_URL = 'https://github.com/hesham88/envoy/blob/main/docs/SECURITY.md#wiretap-check';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The document as the person sees it, every real value marked: these stay on this device. */
function markValues(text: string, values: readonly string[]): ReactNode[] {
  const vals = [...new Set(values.filter((v) => v.trim().length > 1))].sort(
    (a, b) => b.length - a.length,
  );
  if (!vals.length) return [text];
  const re = new RegExp(`(${vals.map(escape).join('|')})`, 'g');
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="envoy-real">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/** Text on the wire, every [TAG], [...] and {{EXPR}} marked. */
function markWire(text: string): ReactNode[] {
  return text.split(/(\[[A-Z][A-Z0-9_]*\]|\[…\]|\{\{[^{}]*\}\})/).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="envoy-wire-tag">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

const fmt = (n: number) => n.toLocaleString('en-US');

function Card({ card }: { card: WiretapCard }) {
  switch (card.kind) {
    case 'device':
      return (
        <li className="envoy-wire-card">
          <details className="group rounded-[10px] border border-line/70 px-3 py-2 text-[13px]">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-muted">
              <Cpu size={14} className="text-device" aria-hidden="true" />
              <span>
                <span className="text-device-on-tint">Stayed on this device:</span>{' '}
                {STEP_LABEL[card.step] ?? card.step}
              </span>
            </summary>
            <pre className="m-0 mt-2 max-h-40 overflow-auto font-mono text-[11.5px] whitespace-pre-wrap text-muted">
              {card.payload}
            </pre>
          </details>
        </li>
      );
    case 'blocked':
      return (
        <li className="envoy-wire-card flex items-start gap-2 rounded-[10px] border border-danger/50 bg-danger-tint px-3 py-2 text-[13px] text-ink">
          <ShieldAlert size={15} className="mt-0.5 flex-none text-danger" aria-hidden="true" />
          <span>
            Blocked by Envoy before it left: {STEP_LABEL[card.step] ?? card.step}. Nothing was sent.
          </span>
        </li>
      );
    case 'out':
      return (
        <li className="envoy-wire-card min-w-0 rounded-[12px] border border-cloud/50 bg-cloud-tint/40 p-3">
          <p className="m-0 mb-2 flex items-center gap-2 text-[13px] font-semibold text-cloud-on-tint">
            <ArrowUpRight size={15} aria-hidden="true" />
            Sent to {card.model}
            {card.refused && (
              <span className="font-normal text-muted">
                : refused (quota or busy), so it was asked again below
              </span>
            )}
          </p>
          {card.instructions && (
            <details className="mb-2 text-[12px]">
              <summary className="cursor-pointer text-muted">
                Envoy's fixed instructions, sent with every question
              </summary>
              <pre className="m-0 mt-1 font-mono text-[11.5px] whitespace-pre-wrap text-muted">
                {card.instructions}
              </pre>
            </details>
          )}
          <pre
            data-wiretap-out=""
            className="m-0 max-h-72 min-w-0 overflow-auto font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink"
          >
            {markWire(card.payload)}
          </pre>
        </li>
      );
    case 'in':
      return (
        <li className="envoy-wire-card min-w-0 rounded-[12px] border border-cloud/30 p-3">
          <p className="m-0 mb-2 flex items-center gap-2 text-[13px] font-semibold text-cloud-on-tint">
            <ArrowDownLeft size={15} aria-hidden="true" />
            Came back from the cloud
          </p>
          <pre className="m-0 max-h-56 min-w-0 overflow-auto font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink">
            {markWire(card.payload)}
          </pre>
        </li>
      );
    case 'worked':
      return (
        <li
          data-testid="wiretap-worked"
          className="envoy-wire-card flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] border border-device/40 bg-device-tint/40 px-3 py-2 text-[13px]"
        >
          <Check size={14} className="text-device" aria-hidden="true" />
          <code className="font-mono text-[12px] text-cloud-on-tint">{card.expr}</code>
          {card.value === null ? (
            <span className="text-muted">
              Not worked out: the cloud named an amount this document doesn't have.
            </span>
          ) : (
            <>
              <span className="text-muted">worked out here:</span>
              <strong className="envoy-restore rounded px-1 text-device-on-tint">
                {card.value}
              </strong>
            </>
          )}
        </li>
      );
  }
}

/**
 * The wiretap: the real document on one side of the device boundary, and on the other, exactly
 * what left (and what came back). Everything here comes from the in-memory network log.
 */
export function WiretapPane({
  doc,
  values,
  view,
  open,
  onClose,
  overlay,
}: {
  doc: SessionDoc | null;
  /** The real private values found this turn, highlighted in the document. */
  values: readonly string[];
  view: WiretapView;
  open: boolean;
  onClose: () => void;
  /** Over the thread (narrow screens, side panel) rather than beside it. */
  overlay: boolean;
}) {
  const seeId = useId();
  const leavesId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open || !overlay) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, overlay, onClose]);
  if (!open) return null;

  const share = view.docChars ? Math.min(1, view.sentChars / view.docChars) : 0;
  return (
    <aside
      aria-label="Wiretap: what you see and what leaves"
      className={
        overlay
          ? 'fixed inset-y-0 right-0 z-40 flex w-full max-w-[460px] flex-col border-l border-line bg-uv-deep shadow-[0_0_60px_-20px_rgba(0,0,0,0.8)]'
          : 'sticky top-0 flex h-screen w-[440px] flex-none flex-col border-l border-line bg-uv-deep'
      }
    >
      <section
        aria-labelledby={seeId}
        className="flex max-h-[40%] min-h-0 flex-col gap-2 px-5 pt-5 pb-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id={seeId}
              className="m-0 font-display text-[1.3rem] leading-tight font-[560] text-ink"
            >
              What you see
            </h2>
            <p className="m-0 text-[12.5px] text-muted">
              {doc ? `${doc.title}. ` : ''}Highlighted values stay on this device.
            </p>
          </div>
          {overlay && (
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close What leaves"
              className="grid size-9 flex-none place-items-center rounded-[10px] border border-line text-muted hover:text-ink"
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="min-h-0 overflow-auto rounded-[10px] border border-line/70 bg-uv-dark/60 px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
          {doc ? (
            markValues(doc.text, values)
          ) : (
            <span className="text-muted">Pick a sample or attach a document to see it here.</span>
          )}
        </div>
      </section>

      <div className="px-5" aria-hidden="true">
        <div className="envoy-wire-boundary" />
        <div className="mt-1 flex justify-between text-[11.5px]">
          <span className="text-device-on-tint">This device</span>
          <span className="text-cloud-on-tint">The wire</span>
        </div>
      </div>

      <section
        aria-labelledby={leavesId}
        className="flex min-h-0 flex-1 flex-col gap-3 px-5 pt-3 pb-5"
      >
        <div>
          <h2
            id={leavesId}
            className="m-0 font-display text-[1.3rem] leading-tight font-[560] text-ink"
          >
            What leaves
          </h2>
          <p className="m-0 text-[12.5px] text-muted">
            The exact text Envoy handed to Firebase AI Logic.
          </p>
        </div>
        {view.docChars > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="m-0 text-[13px] text-ink">
              {fmt(view.sentChars)} of {fmt(view.docChars)} characters of your document left this
              device, masked
            </p>
            <div className="h-1.5 overflow-clip rounded-full bg-device/25" aria-hidden="true">
              <div className="h-full rounded-full bg-cloud" style={{ width: `${share * 100}%` }} />
            </div>
          </div>
        )}
        {view.nothingLeft && (
          <p className="m-0 flex items-center gap-2 rounded-[10px] border border-device/40 bg-device-tint/30 px-3 py-2.5 text-[13.5px] text-device-on-tint">
            <Check size={15} aria-hidden="true" />
            Nothing has left this device.
          </p>
        )}
        <ol className="m-0 flex min-h-0 list-none flex-col gap-2 overflow-auto p-0">
          {view.cards.map((c, i) => (
            <Card key={i} card={c} />
          ))}
        </ol>
        <a
          href={CHECK_URL}
          target="_blank"
          rel="noopener"
          className="mt-auto text-[12.5px] text-muted underline underline-offset-4 hover:text-ink"
        >
          How we know this is what left
        </a>
      </section>
    </aside>
  );
}

/**
 * The landing hero's live demo: a text box under Envoy's UV lamp. It runs the real rules engine
 * (@envoy/core scanText: no model, no network), so it works the same for everyone, with or without
 * the on-device model. Switch Envoy off and the box is an ordinary text box again.
 */
import { useDeferredValue, useId, useMemo, useRef, useState } from 'react';
import {
  maskFindings,
  scanText,
  validateCustomRule,
  type CustomRule,
  type Finding,
} from '@envoy/core';
import { UvRing } from '@envoy/ui';

// Fictional people and numbers. The key is assembled at runtime so no key-shaped literal sits in the repo.
const SAMPLE = [
  "Hi! I'm Mona Adel. My landlord wants rent of EGP 8,500 paid to EG38 0019 0005 0000 0000 2631 8000 2 by 1 March 2026.",
  'Reach me at mona.adel@example.com or +20 100 555 0192.',
  `Our deploy key is ${'AKIA' + 'EXAMPLEENVOYDEMO'}, and Project Falcon launches in May.`,
  'Can you draft a polite reply asking to keep the rent the same?',
].join(' ');

const KIND: Partial<Record<Finding['type'], string>> = {
  PERSON: 'Name',
  EMAIL: 'Email',
  PHONE: 'Phone',
  IBAN: 'Bank account',
  ACCOUNT: 'Account number',
  CARD: 'Card',
  MONEY: 'Amount',
  DATE: 'Date',
  SECRET: 'Secret key',
  NATIONAL_ID: 'National ID',
  ADDRESS: 'Address',
  CUSTOM: 'Your rule',
};

/** Splits text into plain runs and found values, for the highlight layer behind the textarea. */
function runs(text: string, findings: Finding[]) {
  const out: { text: string; f?: Finding }[] = [];
  let at = 0;
  for (const f of findings) {
    if (f.start > at) out.push({ text: text.slice(at, f.start) });
    out.push({ text: text.slice(f.start, f.end), f });
    at = f.end;
  }
  out.push({ text: text.slice(at) });
  return out;
}

export function UvDemo() {
  const [text, setText] = useState(SAMPLE);
  const [on, setOn] = useState(true);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [words, setWords] = useState<string[]>(['Project Falcon']);
  const [draft, setDraft] = useState('');
  const backdrop = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const outId = useId();

  const deferred = useDeferredValue(text);
  const rules: CustomRule[] = useMemo(
    () => (words.length ? [{ label: 'PRIVATE', terms: words }] : []),
    [words],
  );
  const scan = useMemo(() => scanText(deferred, { custom: rules }), [deferred, rules]);
  const findings = scan.findings;
  const masked = useMemo(() => maskFindings(deferred, scan, keep), [deferred, scan, keep]);
  const open = findings.filter((f) => !keep.has(f.tag));

  function addWord() {
    const w = draft.trim();
    if (!w || validateCustomRule({ label: 'PRIVATE', terms: [w] })) return;
    setWords((xs) => (xs.includes(w) ? xs : [...xs, w]));
    setDraft('');
  }

  function toggleKeep(tag: string) {
    setKeep((s) => {
      const n = new Set(s);
      if (n.has(tag)) n.delete(tag);
      else n.add(tag);
      return n;
    });
  }

  const fieldClass =
    'block w-full resize-none rounded-[14px] p-5 text-[16px] leading-[1.75] font-sans';

  return (
    <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={fieldId} className="text-[15px] text-uv-muted">
            Your message, before it goes to any AI
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => setOn((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[14px] font-medium transition-colors ${on ? 'border-uv-green/60 bg-uv-green/10 text-uv-green' : 'border-uv-line text-uv-muted'}`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${on ? 'bg-uv-green shadow-[0_0_10px_var(--uv-green)]' : 'bg-uv-muted/50'}`}
            />
            Envoy {on ? 'on' : 'off'}
          </button>
        </div>

        <UvRing on={on} tone={open.length ? 'found' : 'device'} radius={14}>
          <div className="relative rounded-[14px] bg-uv-deep">
            {on && (
              <div
                ref={backdrop}
                aria-hidden="true"
                className={`${fieldClass} pointer-events-none absolute inset-0 overflow-hidden break-words whitespace-pre-wrap text-transparent`}
              >
                {runs(text, findings).map((r, i) =>
                  r.f ? (
                    <mark
                      key={i}
                      className={`rounded-[4px] text-transparent ${keep.has(r.f.tag) ? 'bg-uv-blue/20 shadow-[inset_0_-2px_0_var(--uv-blue)]' : 'bg-uv-amber/25 shadow-[0_0_14px_rgba(255,181,71,0.45),inset_0_-2px_0_var(--uv-amber)]'}`}
                    >
                      {r.text}
                    </mark>
                  ) : (
                    <span key={i}>{r.text}</span>
                  ),
                )}
                {'\n'}
              </div>
            )}
            <textarea
              id={fieldId}
              value={text}
              rows={7}
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
              onScroll={(e) => {
                if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop;
              }}
              aria-describedby={on ? outId : undefined}
              className={`${fieldClass} relative min-h-[236px] border bg-transparent text-uv-text caret-uv-green outline-none ${on ? 'border-transparent' : 'border-uv-line focus:border-uv-muted'}`}
            />
          </div>
        </UvRing>

        {on && (
          <form
            className="flex flex-wrap items-center gap-2 text-[14px]"
            onSubmit={(e) => {
              e.preventDefault();
              addWord();
            }}
          >
            <span className="text-uv-muted">Also protect:</span>
            {words.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWords((xs) => xs.filter((x) => x !== w))}
                className="rounded-full border border-uv-line px-2.5 py-0.5 text-uv-text hover:border-uv-danger/70"
                aria-label={`Stop protecting ${w}`}
              >
                {w} <span aria-hidden="true">×</span>
              </button>
            ))}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="a word only you know is private"
              aria-label="Add a word to protect"
              className="min-w-[13rem] flex-1 rounded-full border border-uv-line bg-transparent px-3 py-1 text-uv-text placeholder:text-uv-muted/70 focus:border-uv-green/60 focus:outline-none"
            />
          </form>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <p id={outId} className="m-0 text-[15px] text-uv-muted" aria-live="polite">
          {on
            ? open.length
              ? `What the AI receives: ${open.length} private ${open.length === 1 ? 'detail' : 'details'} replaced`
              : 'What the AI receives: nothing private'
            : 'Envoy is off: the AI receives exactly what you typed'}
        </p>
        <div className="min-h-[236px] rounded-[14px] border border-uv-line bg-uv-panel/70 p-5 text-[16px] leading-[1.75] break-words whitespace-pre-wrap text-uv-text">
          {on ? <Masked text={masked} /> : text}
        </div>
        {on && findings.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Found on this device">
            {findings
              .filter((f, i, a) => a.findIndex((x) => x.tag === f.tag) === i)
              .map((f) => {
                const kept = keep.has(f.tag);
                return (
                  <li key={f.tag}>
                    <button
                      type="button"
                      onClick={() => toggleKeep(f.tag)}
                      aria-pressed={kept}
                      title={
                        kept
                          ? 'Sent as written. Select to hide it again.'
                          : 'Hidden. Select to send it as written.'
                      }
                      className={`flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-left text-[13px] ${kept ? 'border-uv-blue/60 text-uv-blue' : 'border-uv-green/40 text-uv-text'}`}
                    >
                      <span className="text-uv-muted">
                        {f.type === 'CUSTOM' ? KIND.CUSTOM : (KIND[f.type] ?? f.type)}
                      </span>
                      <span className="font-mono text-[12px] text-uv-green">{f.tag}</span>
                      <span className="text-uv-muted">{kept ? 'sent' : 'hidden'}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Renders masked text with each [TAG] glowing like UV ink. */
function Masked({ text }: { text: string }) {
  const parts = text.split(/(\[[A-Z][A-Z0-9_]*\])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[[A-Z][A-Z0-9_]*\]$/.test(p) ? (
          <span
            key={i}
            className="envoy-uvtag rounded-[5px] border border-uv-green/50 bg-uv-green/10 px-1 font-mono text-[13px] text-uv-green [text-shadow:0_0_10px_rgba(61,255,176,0.7)]"
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

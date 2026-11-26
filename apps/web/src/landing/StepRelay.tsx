/**
 * The "Five steps. Only one touches the cloud." walkthrough: this device on one side, the cloud on
 * the other, the guard between them. A sample lease question travels through Envoy's five steps,
 * one at a time: details are found, become tags, the excerpt is trimmed and approved, only tags
 * cross the guard (a raw IBAN is turned back), and the answer returns with real values restored.
 *
 * It plays only while on screen, pauses with a visible button (WCAG 2.2.2), and every step can be
 * opened directly. With reduced motion it doesn't play by itself and shows the finished state;
 * changes are then opacity and colour only (relay.css).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import './relay.css';

export interface RelayStep {
  key: string;
  title: string;
  where: string;
  body: string;
}

const STEP_MS = 3400;
const APPROVE_AFTER_MS = 1300;
/** Exactly the text that crosses the guard in this walkthrough. */
const SENT = '7. Rent is [RENT] a month. It may rise once a year, by no more than 10%.';
const HOLD_LAST_MS = 5200;

type TokState = 'raw' | 'found' | 'tag';
const TOKENS = {
  landlord: { raw: 'Karim Fathy', tag: '[LANDLORD]' },
  tenant: { raw: 'Mona Adel', tag: '[TENANT]' },
  phone: { raw: '+20 100 555 0192', tag: '[PHONE]' },
  rent: { raw: 'EGP 8,500', tag: '[RENT]' },
  account: { raw: 'EG38 0019 0005…', tag: '[ACCOUNT]' },
} as const;

function Tok({ k, state }: { k: keyof typeof TOKENS; state: TokState }) {
  const t = TOKENS[k];
  return (
    <span className="relay-tok" data-state={state}>
      <span className="relay-raw">{t.raw}</span>
      <span className="relay-tag" aria-hidden="true">
        {t.tag}
      </span>
    </span>
  );
}

function whereKey(where: string) {
  return where === 'Cloud' ? 'cloud' : where === 'You' ? 'you' : 'device';
}

export function StepRelay({ steps }: { steps: RelayStep[] }) {
  const reduce = useReducedMotion();
  const last = steps.length - 1;
  const [step, setStep] = useState(reduce ? last : 0);
  const [paused, setPaused] = useState(!!reduce);
  const [visible, setVisible] = useState(false);
  // Step 3 has two beats: the excerpt appears, then you approve it.
  const [approved, setApproved] = useState(false);
  useEffect(() => {
    setApproved(false);
    if (step !== 2) return;
    const id = setTimeout(() => setApproved(true), APPROVE_AFTER_MS);
    return () => clearTimeout(id);
  }, [step]);
  const root = useRef<HTMLElement>(null);

  // Play only while the walkthrough is on screen.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), {
      threshold: 0.35,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const playing = visible && !paused;
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(
      () => setStep((s) => (s >= last ? 0 : s + 1)),
      step === last ? HOLD_LAST_MS : STEP_MS,
    );
    return () => clearTimeout(id);
  }, [playing, step, last]);

  const tok: TokState = step === 0 ? 'found' : 'tag';
  const lineState = (kept: boolean) => (step === 0 ? 'plain' : kept ? 'kept' : 'left');
  const sent = step >= 3;
  const current = steps[step];

  return (
    <figure
      ref={root}
      className="relay m-0"
      data-playing={playing}
      style={{ '--step-ms': `${step === last ? HOLD_LAST_MS : STEP_MS}ms` } as CSSProperties}
      aria-labelledby="relay-caption"
    >
      <div className="relay-stage" aria-hidden="true">
        {/* ---------- this device ---------- */}
        <div className="relay-zone relay-zone--device">
          <div className="relay-zone-label">
            <span>This device</span>
            <span className="relay-bytes">Chrome&apos;s on-device model</span>
          </div>
          <div className="relay-q">Can my landlord raise the rent 20% this year?</div>
          <div className="relay-doc" data-dim={step >= 2}>
            <div className="relay-doc-title">RESIDENTIAL LEASE · CAIRO</div>
            <div className="relay-line" data-state={lineState(false)}>
              1. <Tok k="landlord" state={tok} /> leases to <Tok k="tenant" state={tok} />.
            </div>
            <div className="relay-line" data-state={lineState(false)}>
              Phone <Tok k="phone" state={tok} />.
            </div>
            <div className="relay-line" data-state={lineState(true)}>
              7. Rent is <Tok k="rent" state={tok} /> a month. It may rise once a year, by no more
              than 10%.
            </div>
            <div className="relay-line" data-state={lineState(false)}>
              8. Pay to <Tok k="account" state={tok} />.
            </div>
          </div>
          <div className="grid">
            <div
              className="relay-card relay-packet"
              style={{ gridArea: '1 / 1' }}
              data-on={step === 2}
              data-gone={step >= 3}
            >
              <div className="relay-card-head">What the cloud will see</div>
              7. Rent is <span className="relay-chip">[RENT]</span> a month. It may rise once a
              year, by no more than 10%.
              <div>
                <span className="relay-approve" data-done={approved}>
                  {approved ? 'Approved ✓' : 'Approve and send'}
                </span>
              </div>
            </div>
            <div
              className="relay-intruder"
              style={{ gridArea: '1 / 1', alignSelf: 'start' }}
              data-on={step === 3}
            >
              EG38 0019 0005… blocked at the guard
            </div>
            <div
              className="relay-card relay-answer"
              style={{ gridArea: '1 / 1' }}
              data-on={step === 4}
            >
              <div className="relay-card-head">Answer, restored on this device</div>
              <strong>Not by 20%.</strong> Your rent can rise to at most{' '}
              <span className="relay-restored">EGP 9,350</span> (your{' '}
              <span className="relay-restored">EGP 8,500</span> plus 10%, worked out here).
            </div>
          </div>
        </div>

        {/* ---------- the guard ---------- */}
        <div className="relay-guard" data-state={step === 3 ? 'pass' : 'idle'}>
          <span className="relay-guard-label">GUARD</span>
        </div>

        {/* ---------- the cloud ---------- */}
        <div className="relay-zone relay-zone--cloud">
          <div className="relay-zone-label">
            <span>Cloud · Gemini</span>
            <span className="relay-bytes" data-on={sent}>
              {sent ? `${SENT.length} characters received, tags only` : 'Nothing received'}
            </span>
          </div>
          <div className="grid flex-1">
            <p className="relay-empty" style={{ gridArea: '1 / 1' }} data-on={!sent}>
              Nothing has left your device yet.
            </p>
            <div style={{ gridArea: '1 / 1' }} className="flex flex-col gap-3">
              <div className="relay-card relay-arrive" data-on={sent}>
                <div className="relay-card-head">Received</div>
                7. Rent is <span className="relay-chip">[RENT]</span> a month. It may rise once a
                year, by no more than 10%.
              </div>
              <div className="relay-card relay-arrive" data-on={sent}>
                <div className="relay-card-head">Gemini&apos;s answer, over tags</div>
                Not by 20%. Your rent can rise to at most{' '}
                <span className="relay-expr">{'{{RENT * 1.10}}'}</span>.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relay-controls">
        <ol className="relay-steps" aria-label="The five steps">
          {steps.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                className="relay-step"
                data-where={whereKey(s.where)}
                aria-current={i === step ? 'step' : undefined}
                onClick={() => {
                  setStep(i);
                  setPaused(true);
                }}
              >
                <span className="relay-step-where">
                  {i + 1}
                  <span className="relay-sr"> of 5:</span> {s.where}
                </span>
                <span className="relay-step-title">{s.title}</span>
                <span className="relay-step-progress" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="relay-play"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? 'Play the walkthrough' : 'Pause the walkthrough'}
        >
          {paused ? 'Play' : 'Pause'}
        </button>
      </div>
      <figcaption id="relay-caption" className="relay-caption" aria-live={paused ? 'polite' : 'off'}>
        <strong>{current?.title}</strong>{' '}
        <span className={current?.where === 'Cloud' ? 'text-uv-blue' : current?.where === 'You' ? 'text-uv-amber' : 'text-uv-green'}>
          ({current?.where === 'Cloud' ? 'in the cloud' : current?.where === 'You' ? 'your call' : 'on this device'})
        </span>{' '}
        {current?.body}
      </figcaption>
    </figure>
  );
}

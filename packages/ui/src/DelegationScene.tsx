/**
 * DelegationScene — Envoy's hero motion graphic, in 2.5D (CSS 3D planes, no canvas, no images).
 *
 * Three stacked planes: THIS DEVICE (green) carries the contract page; the GUARD membrane sits above it;
 * the CLOUD (blue) is on top. One 10 s timeline: scan → details light up → they become tags → unneeded
 * clauses fade → a sealed packet of tags rises through the guard → a raw IBAN tries, is blocked and drops
 * back → the answer comes down and real values return in green.
 *
 * `frame` (0–1) freezes the timeline at that point (for stills, contact sheets and the README).
 * Pointer tilts the stage; reduced motion shows the finished, still composition.
 */
import { useMemo, useRef, type CSSProperties, type PointerEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { LOGO_PATHS } from './Logo';
import { ringBand, waveBand } from './guilloche';

const DURATION = 10; // seconds

type Token = { raw: string; tag: string; line: number; i: number };
const LINES: { text: (t: (k: number) => React.ReactNode) => React.ReactNode; keep: boolean }[] = [
  {
    text: (t) => (
      <>
        1. Parties. {t(0)} leases to {t(1)},
      </>
    ),
    keep: false,
  },
  {
    text: (t) => (
      <>
        phone {t(2)}, national ID {t(3)}.
      </>
    ),
    keep: false,
  },
  { text: () => <>2. Term. Three years from 1 September.</>, keep: false },
  { text: () => <>…</>, keep: false },
  { text: (t) => <>7. Rent. The monthly rent is {t(4)}.</>, keep: true },
  { text: () => <>The Landlord may raise it once a year</>, keep: true },
  { text: () => <>by no more than 10%, with 60 days' notice.</>, keep: true },
  { text: (t) => <>8. Payment to account {t(5)}.</>, keep: false },
];
const TOKENS: Token[] = [
  { raw: 'Karim Fathy', tag: '[LANDLORD]', line: 0, i: 0 },
  { raw: 'Mona Adel', tag: '[TENANT]', line: 0, i: 1 },
  { raw: '+20 100 555 0192', tag: '[PHONE]', line: 1, i: 2 },
  { raw: '2950 3140 1012 34', tag: '[NATIONAL_ID]', line: 1, i: 3 },
  { raw: 'EGP 8,500', tag: '[RENT]', line: 4, i: 4 },
  { raw: 'EG38 0019 …', tag: '[ACCOUNT]', line: 7, i: 5 },
];

function Plane({
  z,
  shift = 0,
  tone,
  label,
  children,
}: {
  z: number;
  shift?: number;
  tone: 'device' | 'cloud' | 'guard';
  label: string;
  children?: React.ReactNode;
}) {
  const ring = useMemo(
    () => waveBand({ x: 0, y: 6, width: 560, amplitude: 4, period: 18, strands: 4 }),
    [],
  );
  const color =
    tone === 'device' ? 'var(--device)' : tone === 'cloud' ? 'var(--cloud)' : 'var(--ink)';
  return (
    <div
      className="absolute top-1/2 left-1/2 h-[380px] w-[560px]"
      style={
        {
          transform: `translate(-50%, -50%) translateY(${shift}px) translateZ(${z}px)`,
          transformStyle: 'preserve-3d',
        } as CSSProperties
      }
    >
      <div
        className={`absolute inset-0 rounded-[18px] border ${tone === 'guard' ? 'envoy-guard border-ink/25 bg-surface/30' : tone === 'device' ? 'border-device/40 bg-device-tint/70' : 'border-cloud/40 bg-cloud-tint/55'}`}
      />
      <svg
        className="absolute top-2 left-0 h-3 w-full"
        viewBox="0 0 560 12"
        preserveAspectRatio="none"
        aria-hidden="true"
        fill="none"
      >
        <g stroke={color} strokeWidth="0.6" opacity="0.7">
          {ring.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </svg>
      <span
        className="absolute right-5 bottom-3 font-mono text-[12px] font-semibold tracking-[0.22em]"
        style={{ color }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export function DelegationScene({ frame, className = '' }: { frame?: number; className?: string }) {
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const seal = useMemo(
    () => ringBand({ cx: 20, cy: 20, radius: 15, amplitude: 1.6, waves: 18, strands: 3 }),
    [],
  );
  // A frozen frame (or reduced motion) pauses every animation at the same point of the timeline.
  const still = frame !== undefined || reduce;
  const at = frame ?? (reduce ? 0.97 : 0);
  const timeline = {
    '--envoy-delay': `${-at * DURATION}s`,
    '--envoy-state': still ? 'paused' : 'running',
    '--envoy-dur': `${DURATION}s`,
  } as CSSProperties;

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (still || !root.current) return;
    const b = root.current.getBoundingClientRect();
    root.current.style.setProperty('--tilt-x', `${((e.clientY - b.top) / b.height - 0.5) * -8}deg`);
    root.current.style.setProperty('--tilt-z', `${((e.clientX - b.left) / b.width - 0.5) * 10}deg`);
  }

  const token = (k: number) => {
    const t = TOKENS[k]!;
    return (
      <span
        key={k}
        className="relative inline-block align-baseline"
        style={{ '--i': t.i } as CSSProperties}
      >
        <span className="envoy-raw rounded-[3px] px-0.5">{t.raw}</span>
        <span className="envoy-tag absolute top-1/2 left-0 rounded bg-ink px-1 font-mono text-[10px] leading-[1.6] whitespace-nowrap text-paper">
          {t.tag}
        </span>
      </span>
    );
  };

  return (
    <div
      ref={root}
      role="img"
      aria-label="Envoy on one page: the contract is read on this device, personal details become tags, only a sealed excerpt of tags passes the guard to the cloud, a raw bank account is blocked, and the answer comes back with the real values restored on the device."
      onPointerMove={onMove}
      onPointerLeave={() => {
        root.current?.style.setProperty('--tilt-x', '0deg');
        root.current?.style.setProperty('--tilt-z', '0deg');
      }}
      className={`envoy-scene relative h-[620px] w-full overflow-hidden select-none ${className}`}
      style={{ ...timeline, perspective: '1600px' } as CSSProperties}
    >
      <div
        className="absolute inset-0 transition-transform duration-700 ease-out"
        style={{
          transformStyle: 'preserve-3d',
          transform:
            'translateY(64px) scale(0.94) rotateX(calc(52deg + var(--tilt-x, 0deg))) rotateZ(calc(-28deg + var(--tilt-z, 0deg)))',
        }}
      >
        <Plane z={0} shift={70} tone="device" label="THIS DEVICE">
          {/* the contract page */}
          <div className="absolute top-7 left-7 h-[318px] w-[350px] overflow-hidden rounded-[6px] border border-line bg-surface p-4 font-sans text-[12.5px] leading-[1.95] text-ink shadow-[0_1px_0_var(--line)]">
            <div className="mb-1 font-mono text-[8px] tracking-[0.2em] text-muted">
              RESIDENTIAL LEASE · CAIRO
            </div>
            {LINES.map((l, n) => (
              <div key={n} className={l.keep ? 'envoy-keep' : 'envoy-fade'}>
                {l.text(token)}
              </div>
            ))}
            <div className="envoy-scan absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-transparent via-device/25 to-transparent" />
          </div>
          {/* the sealed packet: only tags travel */}
          <div className="envoy-packet absolute top-[150px] left-[380px] w-[150px] rounded-[8px] border border-cloud/50 bg-surface p-2 font-mono text-[9px] leading-[1.5] text-ink">
            <div className="flex items-center gap-1.5">
              <svg width="22" height="22" viewBox="0 0 40 40" aria-hidden="true" fill="none">
                <g stroke="var(--device)" strokeWidth="0.7">
                  {seal.map((d, i) => (
                    <path key={i} d={d} />
                  ))}
                </g>
                <g
                  transform="translate(11 11) scale(0.75)"
                  stroke="var(--ink)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={LOGO_PATHS.seal} />
                </g>
              </svg>
              <span className="font-semibold">sealed · approved</span>
            </div>
            <div className="mt-1">
              Clause 7: rent is <span className="rounded bg-ink px-1 text-paper">[RENT]</span>; may
              rise ≤10%.
            </div>
          </div>
          {/* a raw value that tries to leave */}
          <div className="envoy-intruder absolute top-[250px] left-[390px] rounded-[6px] border border-danger bg-danger-tint px-2 py-1 font-mono text-[9px] text-danger">
            EG38 0019 0005 …
          </div>
          {/* the answer that comes back */}
          <div className="envoy-answer absolute top-[60px] left-[380px] w-[160px] rounded-[8px] border border-device/50 bg-surface p-2 text-[9.5px] leading-[1.5] text-ink">
            <strong>Not by 20%.</strong> Rent can rise to{' '}
            <span className="rounded bg-restored px-0.5">EGP 9,350</span> at most.
          </div>
        </Plane>

        <Plane z={135} shift={-10} tone="guard" label="GUARD · RAW DETAILS BLOCKED" />

        <Plane z={265} shift={-120} tone="cloud" label="CLOUD · SEES TAGS ONLY">
          <div className="envoy-arrive absolute top-[150px] left-[380px] w-[150px] rounded-[8px] border border-cloud/50 bg-surface p-2 font-mono text-[9px] leading-[1.5] text-ink">
            <span className="rounded bg-ink px-1 text-paper">[RENT]</span> × 1.10 ={' '}
            <span className="text-cloud-on-tint">{'{{RENT * 1.10}}'}</span>
          </div>
        </Plane>
      </div>
    </div>
  );
}

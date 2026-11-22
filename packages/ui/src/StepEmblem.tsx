/** A small security-printed emblem per pipeline step: its own rosette, coloured by where the step runs. */
import { useMemo } from 'react';
import { CheckCheck, Cloud, ScanSearch, Scissors, Undo2 } from 'lucide-react';
import { hypotrochoid, ringBand } from './guilloche';

export const STEP_EMBLEMS = [
  { key: 'detect', name: 'Detect', where: 'device', Icon: ScanSearch, R: 60, r: 21, d: 30 },
  { key: 'minimize', name: 'Minimize', where: 'device', Icon: Scissors, R: 60, r: 28, d: 20 },
  { key: 'approve', name: 'Approve', where: 'you', Icon: CheckCheck, R: 60, r: 27, d: 33 },
  { key: 'reason', name: 'Reason', where: 'cloud', Icon: Cloud, R: 60, r: 33, d: 22 },
  { key: 'restore', name: 'Restore', where: 'device', Icon: Undo2, R: 60, r: 22, d: 31 },
] as const;

const TONE = { device: 'var(--device)', cloud: 'var(--cloud)', you: 'var(--ink)' } as const;

export function StepEmblem({ step, size = 132 }: { step: (typeof STEP_EMBLEMS)[number]; size?: number }) {
  const art = useMemo(
    () => ({
      ring: ringBand({ cx: 100, cy: 100, radius: 88, amplitude: 4, waves: 30, strands: 5 }),
      rosette: hypotrochoid({ cx: 100, cy: 100, R: step.R, r: step.r, d: step.d, samplesPerTurn: 160 }),
    }),
    [step],
  );
  const tone = TONE[step.where];
  return (
    <figure className="m-0 flex flex-col items-center gap-2">
      <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={`${step.name}: runs ${step.where === 'you' ? 'with you' : `on ${step.where === 'device' ? 'this device' : 'the cloud'}`}`} fill="none">
        <g stroke="var(--ink)" strokeWidth="0.6" opacity="0.55">
          {art.ring.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <path d={art.rosette} stroke={tone} strokeWidth="0.75" />
        <circle cx="100" cy="100" r="25" fill="var(--surface)" stroke={tone} strokeWidth="1.2" />
        <step.Icon x={86} y={86} width={28} height={28} strokeWidth={1.75} color={tone} />
      </svg>
      <figcaption className="text-center">
        <span className="block text-sm font-semibold">{step.name}</span>
        <span className="block font-mono text-[11px] tracking-wider text-muted uppercase">{step.where === 'you' ? 'you' : step.where === 'device' ? 'on device' : 'cloud'}</span>
      </figcaption>
    </figure>
  );
}

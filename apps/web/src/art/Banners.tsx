/**
 * /studio/banners — README section banners (1600 × 300), rendered from the security-print system.
 * Each is a fixed-size frame with data-banner="<slug>" so scripts/render-brand.mjs can screenshot it.
 */
import { useMemo } from 'react';
import { EnvoySeal, hypotrochoid, ringBand, STEP_EMBLEMS, StepEmblem, waveBand } from '@envoy/ui';

type Tone = 'device' | 'cloud' | 'ink';
export const BANNERS: { slug: string; eyebrow: string; title: string; sub: string; tone: Tone; art: 'seal' | 'rosette' | 'emblems' | 'bands' }[] = [
  { slug: 'promise', eyebrow: 'The promise', title: 'Ask the cloud. Keep your secrets.', sub: 'On-device AI decides what the cloud needs to know. You approve it.', tone: 'device', art: 'seal' },
  { slug: 'how', eyebrow: 'How it works', title: 'Five steps. One touches the cloud.', sub: 'Detect, minimize, approve, reason, restore.', tone: 'ink', art: 'emblems' },
  { slug: 'hybrid', eyebrow: 'Firebase AI Logic', title: 'Hybrid inference, chosen per step.', sub: 'ONLY_ON_DEVICE for private steps. PREFER_IN_CLOUD for reasoning.', tone: 'cloud', art: 'rosette' },
  { slug: 'guard', eyebrow: 'The guard', title: "We don't trust the default.", sub: 'Every private step is checked, fenced and verified on the device.', tone: 'device', art: 'bands' },
  { slug: 'measured', eyebrow: 'Measured', title: 'What actually leaves the device.', sub: 'Real runs through the real pipeline, model named on every number.', tone: 'ink', art: 'rosette' },
  { slug: 'judges', eyebrow: 'Judges: try it', title: 'Open it. Paste a contract. Watch.', sub: 'Works without the on-device model too: Basic protection.', tone: 'cloud', art: 'seal' },
  { slug: 'open', eyebrow: 'Open source', title: 'Apache-2.0. Read every line.', sub: 'Inspired by PAPILLON (Li et al., NAACL 2025).', tone: 'ink', art: 'bands' },
];

function Rosette({ tone }: { tone: Tone }) {
  const art = useMemo(
    () => ({
      ring: ringBand({ cx: 150, cy: 150, radius: 132, amplitude: 7, waves: 44, strands: 7, harmonic: 0.3 }),
      a: hypotrochoid({ cx: 150, cy: 150, R: 110, r: 41, d: 66 }),
      b: hypotrochoid({ cx: 150, cy: 150, R: 110, r: 37, d: 52 }),
    }),
    [],
  );
  return (
    <svg viewBox="0 0 300 300" width={260} height={260} aria-hidden="true" fill="none">
      <g stroke="var(--ink)" strokeWidth="0.6" opacity="0.55">
        {art.ring.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <path d={art.a} stroke={`var(--${tone === 'ink' ? 'device' : tone})`} strokeWidth="0.7" />
      <path d={art.b} stroke={`var(--${tone === 'cloud' ? 'device' : 'cloud'})`} strokeWidth="0.5" opacity="0.6" />
    </svg>
  );
}

function Bands({ tone }: { tone: Tone }) {
  const rows = useMemo(() => [0, 1, 2, 3].map((r) => waveBand({ x: 0, y: 30 + r * 60, width: 620, amplitude: 14 - r * 2, period: 34 + r * 6, strands: 5 })), []);
  return (
    <svg viewBox="0 0 620 260" width={620} height={260} aria-hidden="true" fill="none">
      {rows.map((paths, r) => (
        <g key={r} stroke={`var(--${r % 2 ? 'ink' : tone === 'ink' ? 'device' : tone})`} strokeWidth="0.6" opacity={0.85 - r * 0.12}>
          {paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function Banner({ b }: { b: (typeof BANNERS)[number] }) {
  const top = useMemo(() => waveBand({ x: 0, y: 6, width: 1600, amplitude: 4, period: 22, strands: 4 }), []);
  return (
    <div data-banner={b.slug} className="relative flex h-[300px] w-[1600px] flex-none items-center overflow-hidden border border-line bg-paper">
      <svg className="absolute top-0 left-0 h-3 w-full" viewBox="0 0 1600 12" preserveAspectRatio="none" aria-hidden="true" fill="none">
        <g stroke={`var(--${b.tone === 'ink' ? 'device' : b.tone})`} strokeWidth="0.6" opacity="0.8">
          {top.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </svg>
      <div className="flex flex-1 flex-col gap-3 pl-[72px]">
        <span className={`font-mono text-[15px] tracking-[0.28em] uppercase ${b.tone === 'cloud' ? 'text-cloud-on-tint' : 'text-device-on-tint'}`}>{b.eyebrow}</span>
        <span className="font-display text-[60px] leading-[1.02] font-[600] tracking-[-0.01em] text-ink">{b.title}</span>
        <span className="text-[22px] text-muted">{b.sub}</span>
      </div>
      <div className="flex h-full w-[640px] flex-none items-center justify-center">
        {b.art === 'seal' && <EnvoySeal size={270} interactive={false} title="" />}
        {b.art === 'rosette' && <Rosette tone={b.tone} />}
        {b.art === 'bands' && <Bands tone={b.tone} />}
        {b.art === 'emblems' && (
          <div className="flex gap-3">
            {STEP_EMBLEMS.map((s) => (
              <StepEmblem key={s.key} step={s} size={104} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Banners() {
  return (
    <div className="envoy-uv flex min-h-screen flex-col gap-10 bg-paper p-10">
      {BANNERS.map((b) => (
        <Banner key={b.slug} b={b} />
      ))}
    </div>
  );
}

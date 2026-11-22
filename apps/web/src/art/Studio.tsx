/** /studio — the Envoy visual system as plates: seal, bands, step emblems. Also the source for README stills. */
import { useMemo } from 'react';
import { Logo } from '../components/Logo';
import { EnvoySeal } from './EnvoySeal';
import { waveBand } from './guilloche';
import { STEP_EMBLEMS, StepEmblem } from './StepEmblem';

function Band({ tone, width = 1100 }: { tone: 'device' | 'cloud' | 'ink'; width?: number }) {
  const paths = useMemo(() => waveBand({ x: 0, y: 14, width, amplitude: 9, period: 26, strands: 6 }), [width]);
  return (
    <svg viewBox={`0 0 ${width} 28`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden="true" fill="none">
      <g stroke={`var(--${tone})`} strokeWidth="0.6" opacity="0.8">
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

export function Studio() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="flex items-center justify-between border-b border-line bg-surface px-8 py-5">
        <Logo withWordmark />
        <span className="font-mono text-xs tracking-widest text-muted uppercase">Visual system · plates</span>
      </header>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-16 px-8 py-14">
        <section data-plate="seal" className="flex flex-wrap items-center gap-12">
          <EnvoySeal size={460} />
          <div className="flex max-w-[460px] flex-col gap-4">
            <p className="m-0 font-mono text-xs tracking-[0.2em] text-device-on-tint uppercase">Plate I · The seal</p>
            <h1 className="m-0 text-[44px] leading-[1.05] font-bold tracking-tight">A credential, not a mascot.</h1>
            <p className="m-0 text-lg leading-relaxed text-muted">
              Banknotes, passports and diplomatic papers use guilloche — engraved mathematical lattices that are hard to forge. Envoy's seal is built the same
              way, in code: woven rings, a hypotrochoid rosette, and microtext that states the product's guarantees.
            </p>
            <p className="m-0 text-sm text-muted-2">Green is always this device. Blue is always the cloud. Move the pointer over the seal.</p>
          </div>
        </section>

        <section data-plate="bands" className="flex flex-col gap-3">
          <p className="m-0 font-mono text-xs tracking-[0.2em] text-muted uppercase">Plate II · Bands</p>
          <Band tone="device" />
          <Band tone="ink" />
          <Band tone="cloud" />
        </section>

        <section data-plate="emblems" className="flex flex-col gap-6">
          <p className="m-0 font-mono text-xs tracking-[0.2em] text-muted uppercase">Plate III · The five steps</p>
          <div className="flex flex-wrap justify-between gap-6">
            {STEP_EMBLEMS.map((s) => (
              <StepEmblem key={s.key} step={s} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

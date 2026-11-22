/**
 * The Envoy Seal: a security-printed credential in code. Layers of guilloche at different depths
 * tilt in 2.5D under the pointer; rings counter-rotate slowly; the microtext carries Envoy's actual
 * guarantees. Colours come from tokens (green = this device, blue = cloud). Reduced motion = still.
 */
import { useMemo, useRef, type CSSProperties, type PointerEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { LOGO_PATHS } from './Logo';
import { hypotrochoid, ringBand } from './guilloche';

const MICROTEXT = 'READ ON THIS DEVICE · ONLY WHAT IS NEEDED · APPROVED BY YOU · RESTORED ON THIS DEVICE · NOTHING RAW LEAVES · ';

export function EnvoySeal({ size = 400, interactive = true, title = 'The Envoy seal' }: { size?: number; interactive?: boolean; title?: string }) {
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const art = useMemo(
    () => ({
      outer: ringBand({ cx: 200, cy: 200, radius: 182, amplitude: 9, waves: 54, strands: 9, harmonic: 0.25 }),
      middle: ringBand({ cx: 200, cy: 200, radius: 134, amplitude: 7, waves: 36, strands: 7, harmonic: 0.35 }),
      inner: ringBand({ cx: 200, cy: 200, radius: 104, amplitude: 4, waves: 72, strands: 4 }),
      rosetteA: hypotrochoid({ cx: 200, cy: 200, R: 90, r: 34, d: 56 }),
      rosetteB: hypotrochoid({ cx: 200, cy: 200, R: 90, r: 30, d: 44 }),
    }),
    [],
  );

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (!interactive || reduce || !root.current) return;
    const b = root.current.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5;
    const y = (e.clientY - b.top) / b.height - 0.5;
    root.current.style.setProperty('--ry', `${x * 18}deg`);
    root.current.style.setProperty('--rx', `${-y * 18}deg`);
  }
  function onLeave() {
    root.current?.style.setProperty('--ry', '0deg');
    root.current?.style.setProperty('--rx', '0deg');
  }

  const layer = (z: number, spin: string | null, children: React.ReactNode, key: string) => (
    <div
      key={key}
      className="absolute inset-0"
      style={{ transform: `translateZ(${z}px)`, transformStyle: 'preserve-3d' } as CSSProperties}
    >
      <svg viewBox="0 0 400 400" className={`size-full ${spin && !reduce ? spin : ''}`} aria-hidden="true" fill="none">
        {children}
      </svg>
    </div>
  );
  const draw = (d: string, delay: number, props: React.SVGProps<SVGPathElement>) =>
    reduce ? (
      <path d={d} {...props} />
    ) : (
      <motion.path d={d} {...(props as object)} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay, ease: [0.22, 1, 0.36, 1] }} />
    );

  return (
    <div
      ref={root}
      role="img"
      aria-label={title}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className="relative select-none"
      style={{ width: size, height: size, perspective: '900px' } as CSSProperties}
    >
      <div
        className="absolute inset-0 transition-transform duration-500 ease-out"
        style={{ transformStyle: 'preserve-3d', transform: 'rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))' } as CSSProperties}
      >
        {layer(
          -40,
          'envoy-spin-slow',
          <g stroke="var(--cloud)" strokeWidth="0.6" opacity="0.75">
            {art.outer.map((d, i) => draw(d, i * 0.05, {}))}
          </g>,
          'outer',
        )}
        {layer(
          -20,
          'envoy-spin-rev',
          <>
            <defs>
              <path id="envoy-micro" d="M200,200 m-160,0 a160,160 0 1,1 320,0 a160,160 0 1,1 -320,0" />
            </defs>
            <text fill="var(--ink)" fontFamily="var(--font-mono)" fontSize="7.4" letterSpacing="1.6" opacity="0.8">
              <textPath href="#envoy-micro">{MICROTEXT.repeat(2)}</textPath>
            </text>
            <circle cx="200" cy="200" r="151" stroke="var(--ink)" strokeWidth="0.5" opacity="0.5" />
            <circle cx="200" cy="200" r="169" stroke="var(--ink)" strokeWidth="0.5" opacity="0.5" />
          </>,
          'micro',
        )}
        {layer(
          0,
          'envoy-spin-slow',
          <g stroke="var(--ink)" strokeWidth="0.55" opacity="0.7">
            {art.middle.map((d, i) => draw(d, 0.3 + i * 0.05, {}))}
            {art.inner.map((d, i) => draw(d, 0.5 + i * 0.05, { opacity: 0.6 }))}
          </g>,
          'middle',
        )}
        {layer(
          22,
          'envoy-spin-rev',
          <g stroke="var(--device)" strokeWidth="0.7">
            {draw(art.rosetteA, 0.6, {})}
            {draw(art.rosetteB, 0.8, { opacity: 0.55 })}
          </g>,
          'rosette',
        )}
        {layer(
          44,
          null,
          <g>
            <circle cx="200" cy="200" r="46" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1" />
            <circle cx="200" cy="200" r="41" stroke="var(--device)" strokeWidth="0.6" strokeDasharray="1.5 2.5" />
            <g transform="translate(176 176) scale(2)" stroke="var(--ink)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d={LOGO_PATHS.seal} />
              <path d={LOGO_PATHS.flap} />
              <path d={LOGO_PATHS.chevron} />
            </g>
          </g>,
          'core',
        )}
      </div>
    </div>
  );
}

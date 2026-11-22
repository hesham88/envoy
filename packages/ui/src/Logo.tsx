/**
 * The Envoy mark: a seal-shaped shield carrying a sealed envelope flap and a forward chevron —
 * a trusted messenger taking a sealed message onward. Original geometry, 24×24 grid, strokes only,
 * legible at 16px.
 */
import { motion, useReducedMotion } from 'motion/react';

export const LOGO_PATHS = {
  seal: 'M12 2.75 19.25 5.6v5.65c0 4.55-3.05 8.35-7.25 9.95-4.2-1.6-7.25-5.4-7.25-9.95V5.6Z',
  flap: 'M6.9 7.4 12 10.9l5.1-3.5',
  chevron: 'M10.4 13.3 13.4 15.75 10.4 18.2',
} as const;

interface LogoProps {
  size?: number;
  animated?: boolean;
  withWordmark?: boolean;
  className?: string;
}

export function Logo({ size = 28, animated = false, withWordmark = false, className }: LogoProps) {
  const reduce = useReducedMotion();
  const draw = animated && !reduce;
  const path = (d: string, delay: number) =>
    draw ? (
      <motion.path
        d={d}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      />
    ) : (
      <path d={d} />
    );

  const mark = (
    <svg
      role="img"
      aria-label="Envoy"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={withWordmark ? undefined : className}
    >
      {path(LOGO_PATHS.seal, 0)}
      {path(LOGO_PATHS.flap, 0.25)}
      {path(LOGO_PATHS.chevron, 0.4)}
    </svg>
  );

  if (!withWordmark) return mark;
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      {mark}
      <span aria-hidden="true" className="text-xl font-bold tracking-tight">
        Envoy
      </span>
    </span>
  );
}

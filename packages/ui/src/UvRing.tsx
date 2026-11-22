/**
 * UvRing — Envoy's "protection on" signal around any field: a fluorescent ring (green = this device,
 * blue = cloud) that draws itself in and then slowly circulates, like security ink under a UV lamp.
 *
 * Off means off: no ring, no colour, no animation, and no extra elements, only the field itself.
 * Reduced motion: the ring appears at once and stays still.
 */
import type { ReactNode } from 'react';

export interface UvRingProps {
  on: boolean;
  children: ReactNode;
  /** Corner radius of the field in px (default 14). */
  radius?: number;
  /** 'found' tints the ring amber while there are unmasked private values in the field. */
  tone?: 'device' | 'found';
  className?: string;
}

export function UvRing({
  on,
  children,
  radius = 14,
  tone = 'device',
  className = '',
}: UvRingProps) {
  if (!on) return <div className={className}>{children}</div>;
  return (
    <div
      className={`envoy-uvring relative ${className}`}
      data-tone={tone}
      style={{ ['--uv-r' as string]: `${radius}px` }}
    >
      <span aria-hidden="true" className="envoy-uvring-glow" />
      <span aria-hidden="true" className="envoy-uvring-line" />
      {children}
    </div>
  );
}

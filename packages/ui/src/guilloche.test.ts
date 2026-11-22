import { describe, expect, it } from 'vitest';
import { hypotrochoid, ringBand, waveBand } from './guilloche';

const points = (d: string) =>
  [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe('guilloche geometry', () => {
  it('ringBand draws one closed polar curve per strand, phase-shifted around the ring', () => {
    const paths = ringBand({ cx: 0, cy: 0, radius: 100, amplitude: 8, waves: 24, strands: 6 });
    expect(paths).toHaveLength(6);
    for (const d of paths) {
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
      for (const [x, y] of points(d)) {
        const r = Math.hypot(x!, y!);
        expect(r).toBeGreaterThan(100 - 8 - 0.01);
        expect(r).toBeLessThan(100 + 8 + 0.01);
      }
    }
    expect(paths[0]).not.toBe(paths[1]);
  });

  it('hypotrochoid closes after the right number of turns', () => {
    const d = hypotrochoid({ cx: 0, cy: 0, R: 90, r: 35, d: 60 });
    const pts = points(d);
    const [x0, y0] = pts[0]!;
    const [xn, yn] = pts.at(-1)!;
    expect(Math.hypot(xn! - x0!, yn! - y0!)).toBeLessThan(0.5);
  });

  it('waveBand draws interlaced strands across a width', () => {
    const paths = waveBand({ x: 0, y: 50, width: 400, amplitude: 10, period: 40, strands: 5 });
    expect(paths).toHaveLength(5);
    for (const d of paths) {
      const xs = points(d).map(([x]) => x!);
      expect(Math.min(...xs)).toBeCloseTo(0, 1);
      expect(Math.max(...xs)).toBeCloseTo(400, 1);
    }
  });

  it('is deterministic (same input, same path) so stills and exports match', () => {
    const a = ringBand({ cx: 10, cy: 10, radius: 50, amplitude: 4, waves: 12, strands: 3 });
    const b = ringBand({ cx: 10, cy: 10, radius: 50, amplitude: 4, waves: 12, strands: 3 });
    expect(a).toEqual(b);
  });
});

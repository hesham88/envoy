/**
 * Guilloche: the interlaced curves of banknotes, passports and diplomatic credentials.
 * Security printers engrave them because exact mathematical lattices are hard to forge —
 * the right visual language for a privacy envoy. Pure functions returning SVG path data.
 */

const f = (n: number) => (Math.abs(n) < 1e-9 ? 0 : Math.round(n * 100) / 100);
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Strands of a sinusoidal ring: r(t) = R + A·sin(waves·t + phase), each strand phase-shifted. */
export function ringBand(o: {
  cx: number;
  cy: number;
  radius: number;
  amplitude: number;
  waves: number;
  strands: number;
  /** Optional second harmonic for a woven look (fraction of amplitude). */
  harmonic?: number;
  samples?: number;
}): string[] {
  const samples = o.samples ?? Math.max(360, o.waves * 24);
  const out: string[] = [];
  for (let k = 0; k < o.strands; k++) {
    const phase = (k * 2 * Math.PI) / o.strands;
    let d = '';
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * 2 * Math.PI;
      const r =
        o.radius +
        o.amplitude *
          ((1 - (o.harmonic ?? 0)) * Math.sin(o.waves * t + phase) +
            (o.harmonic ?? 0) * Math.sin(o.waves * 2 * t - phase));
      d += `${i === 0 ? 'M' : 'L'}${f(o.cx + r * Math.cos(t))},${f(o.cy + r * Math.sin(t))}`;
    }
    out.push(d + 'Z');
  }
  return out;
}

/** Hypotrochoid rosette (the spirograph of security printing); closes after r/gcd(R,r) turns. */
export function hypotrochoid(o: {
  cx: number;
  cy: number;
  R: number;
  r: number;
  d: number;
  samplesPerTurn?: number;
}): string {
  const turns = o.r / gcd(Math.round(o.R), Math.round(o.r));
  const total = Math.ceil(turns * (o.samplesPerTurn ?? 240));
  const k = (o.R - o.r) / o.r;
  let path = '';
  for (let i = 0; i <= total; i++) {
    const t = (i / total) * turns * 2 * Math.PI;
    const x = o.cx + (o.R - o.r) * Math.cos(t) + o.d * Math.cos(k * t);
    const y = o.cy + (o.R - o.r) * Math.sin(t) - o.d * Math.sin(k * t);
    path += `${i === 0 ? 'M' : 'L'}${f(x)},${f(y)}`;
  }
  return path;
}

/** Horizontal woven band (border/divider): strands y = A·sin(2π x / period + phase). */
export function waveBand(o: {
  x: number;
  y: number;
  width: number;
  amplitude: number;
  period: number;
  strands: number;
  samples?: number;
}): string[] {
  const samples = o.samples ?? Math.max(100, Math.round((o.width / o.period) * 32));
  const out: string[] = [];
  for (let k = 0; k < o.strands; k++) {
    const phase = (k * 2 * Math.PI) / o.strands;
    let d = '';
    for (let i = 0; i <= samples; i++) {
      const x = (i / samples) * o.width;
      const y = o.amplitude * Math.sin((2 * Math.PI * x) / o.period + phase);
      d += `${i === 0 ? 'M' : 'L'}${f(o.x + x)},${f(o.y + y)}`;
    }
    out.push(d);
  }
  return out;
}

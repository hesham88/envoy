/**
 * SecurityFibers — the fluorescent fibres embedded in banknote and passport paper, drawn on a canvas.
 * They drift slowly; the pointer is a UV lamp, and fibres near it glow brighter. Fibres that cross the
 * guard line (a fraction of the height) change from amber (a raw value) to green (a tag), which is
 * Envoy's whole idea in one material.
 *
 * Cheap by design: one canvas, ≤ 160 fibres, DPR capped at 2, paused when off screen or the tab is
 * hidden, and drawn once (still) under reduced motion.
 */
import { useEffect, useRef } from 'react';

type Fibre = {
  x: number;
  y: number;
  len: number;
  bend: number;
  angle: number;
  spin: number;
  vy: number;
  vx: number;
  hue: 'amber' | 'green' | 'blue';
  alpha: number;
};

const INK = {
  amber: [255, 181, 71],
  green: [61, 255, 176],
  blue: [125, 149, 255],
} as const;

export interface SecurityFibersProps {
  /** Fibres per 10,000 px² of canvas (default 0.9). */
  density?: number;
  /** Where the guard sits, as a fraction of the height from the top (default 0.42). Omit the guard with null. */
  guard?: number | null;
  /** Fraction of fibres that are cloud-blue above the guard (default 0.35). */
  cloudShare?: number;
  className?: string;
}

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function SecurityFibers({
  density = 0.9,
  guard = 0.42,
  cloudShare = 0.35,
  className = '',
}: SecurityFibersProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return; // jsdom and very old browsers: nothing to draw

    let w = 0;
    let h = 0;
    let fibres: Fibre[] = [];
    const lamp = { x: -1e4, y: -1e4, on: false };
    const still = reducedMotion();
    let raf = 0;
    let visible = true;
    let last = performance.now();

    const spawn = (anywhere: boolean): Fibre => {
      const y = anywhere ? Math.random() * h : h + 20;
      const above = guard !== null && y < guard * h;
      return {
        x: Math.random() * w,
        y,
        len: 10 + Math.random() * 22,
        bend: (Math.random() - 0.5) * 0.9,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.25,
        vy: -(6 + Math.random() * 14),
        vx: (Math.random() - 0.5) * 4,
        hue: above ? (Math.random() < cloudShare ? 'blue' : 'green') : 'amber',
        alpha: 0.25 + Math.random() * 0.45,
      };
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(160, Math.round(((w * h) / 10000) * density));
      fibres = Array.from({ length: target }, () => spawn(true));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      for (const f of fibres) {
        const d = Math.hypot(f.x - lamp.x, f.y - lamp.y);
        const lit = lamp.on ? Math.max(0, 1 - d / 220) : 0;
        const [r, g, b] = INK[f.hue];
        const a = Math.min(1, f.alpha + lit * 0.7);
        const cos = Math.cos(f.angle);
        const sin = Math.sin(f.angle);
        const hx = (f.len / 2) * cos;
        const hy = (f.len / 2) * sin;
        ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
        ctx.lineWidth = 1 + lit * 0.8;
        ctx.shadowColor = `rgba(${r},${g},${b},${0.5 + lit * 0.5})`;
        ctx.shadowBlur = 4 + lit * 10;
        ctx.beginPath();
        ctx.moveTo(f.x - hx, f.y - hy);
        ctx.quadraticCurveTo(
          f.x - sin * f.len * f.bend,
          f.y + cos * f.len * f.bend,
          f.x + hx,
          f.y + hy,
        );
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      if (guard !== null) {
        const gy = guard * h;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, 'rgba(61,255,176,0)');
        grad.addColorStop(0.5, 'rgba(61,255,176,0.16)');
        grad.addColorStop(1, 'rgba(61,255,176,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, gy, w, 1);
      }
    };

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // clamp the jump after a background tab
      last = now;
      for (let i = 0; i < fibres.length; i++) {
        const f = fibres[i]!;
        const before = f.y;
        f.y += f.vy * dt;
        f.x += f.vx * dt;
        f.angle += f.spin * dt;
        if (guard !== null && before >= guard * h && f.y < guard * h && f.hue === 'amber') {
          f.hue = Math.random() < cloudShare ? 'blue' : 'green'; // crossing the guard: a raw value becomes a tag
        }
        if (f.y < -30 || f.x < -30 || f.x > w + 30) fibres[i] = spawn(false);
      }
      draw();
      if (visible) raf = requestAnimationFrame(step);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      lamp.x = e.clientX - r.left;
      lamp.y = e.clientY - r.top;
      lamp.on = lamp.x >= 0 && lamp.y >= 0 && lamp.x <= r.width && lamp.y <= r.height;
      if (still) draw();
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      if (!still && visible && !document.hidden) raf = requestAnimationFrame(step);
    };

    resize();
    draw();
    start();
    const ro =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => (resize(), draw())) : null;
    ro?.observe(canvas);
    const io =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(([e]) => {
            visible = !!e?.isIntersecting;
            start();
          })
        : null;
    io?.observe(canvas);
    const onVis = () => start();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
    };
  }, [density, guard, cloudShare]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none block h-full w-full ${className}`}
    />
  );
}

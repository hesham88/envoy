/**
 * Envoy's in-page look, for everything the extension draws inside other websites (field chip, ring,
 * findings card, upload dialog). It lives in a closed-off shadow root, so host pages can't restyle it
 * and it can't leak styles into them. UV night: fluorescent green = this device, blue = cloud,
 * amber = a raw private value still in the field. System fonts only (no requests to any host).
 * All motion is transform/opacity, and stops under reduced motion.
 */

export const UV = {
  dark: '#0b0a1c',
  panel: 'rgba(19, 18, 48, 0.92)',
  line: 'rgba(125, 149, 255, 0.22)',
  text: '#ece9ff',
  muted: '#a9a6cc',
  green: '#3dffb0',
  blue: '#7d95ff',
  amber: '#ffb547',
  danger: '#ff5d7a',
} as const;

/** A small guilloche seal: woven ring + rosette, drawn as SVG paths (no images). */
export function sealSvg(size = 18): string {
  const ring: string[] = [];
  for (let s = 0; s < 3; s++) {
    let d = '';
    for (let i = 0; i <= 120; i++) {
      const t = (i / 120) * Math.PI * 2;
      const r = 8.2 + 1.1 * Math.sin(t * 14 + (s * Math.PI * 2) / 3);
      d += `${i ? 'L' : 'M'}${(12 + r * Math.cos(t)).toFixed(2)} ${(12 + r * Math.sin(t)).toFixed(2)}`;
    }
    ring.push(`<path d="${d}Z"/>`);
  }
  return `<svg class="seal" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="0.7">${ring.join('')}</g><path d="M12 7.2 15.6 8.6v3.2c0 2.3-1.6 4.1-3.6 5-2-.9-3.6-2.7-3.6-5V8.6Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
}

export const THEME_CSS = `
:host { all: initial; direction: ltr; text-align: left; } /* 'all' doesn't reset direction: an RTL page would mirror Envoy's English UI */
* { box-sizing: border-box; }
.uv { font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: ${UV.text}; -webkit-font-smoothing: antialiased; }
.mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }

/* ---------- the chip on the field ---------- */
.chip { position: fixed; z-index: 2147483646; display: none; align-items: center; gap: 7px; min-height: 30px; padding: 4px 11px 4px 8px;
  border-radius: 999px; border: 1px solid ${UV.line}; background: ${UV.panel}; color: ${UV.muted};
  font: 600 12px system-ui, sans-serif; cursor: pointer; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 6px 22px -8px rgba(0,0,0,.55); transition: color .2s, border-color .2s, box-shadow .3s; }
.chip:hover { color: ${UV.text}; }
.chip:focus-visible, .uv button:focus-visible, .uv input:focus-visible { outline: 2px solid ${UV.blue}; outline-offset: 2px; }
.chip[data-state="found"] { color: ${UV.amber}; border-color: rgba(255,181,71,.55); box-shadow: 0 0 18px -4px rgba(255,181,71,.6); }
.chip[data-state="safe"] { color: ${UV.green}; border-color: rgba(61,255,176,.5); box-shadow: 0 0 18px -4px rgba(61,255,176,.55); }
.chip .seal { flex: none; }
.chip[data-state="found"] .seal, .chip[data-state="safe"] .seal { animation: seal-turn 9s linear infinite; }
@keyframes seal-turn { to { transform: rotate(360deg); } }

/* ---------- the ring around a protected field ---------- */
/* @property doesn't register inside a shadow root, so the colours circulate by rotating an inner
   layer (.ring > i) that the ring's mask clips to a 2px border. The glow is a box-shadow halo. */
.ring { position: fixed; z-index: 2147483645; display: none; pointer-events: none; padding: 2px; overflow: hidden; --c1: ${UV.green}; --c2: ${UV.blue};
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
  animation: ring-lock .6s cubic-bezier(.2,.8,.2,1) both; }
.ring > i { position: absolute; left: 50%; top: 50%; width: 200vmax; height: 200vmax; margin: -100vmax 0 0 -100vmax;
  background: conic-gradient(var(--c1), var(--c2) 25%, var(--c1) 50%, var(--c2) 75%, var(--c1)); animation: ring-turn 6s linear infinite; }
.halo { position: fixed; z-index: 2147483644; display: none; pointer-events: none; --c1: ${UV.green};
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--c1) 55%, transparent), 0 0 22px 2px color-mix(in srgb, var(--c1) 45%, transparent);
  animation: ring-lock .6s cubic-bezier(.2,.8,.2,1) both; }
.ring[data-tone="found"] { --c1: ${UV.amber}; --c2: ${UV.green}; }
.halo[data-tone="found"] { --c1: ${UV.amber}; }
.halo.locked { animation: halo-pulse .8s ease-out; }
@keyframes ring-turn { to { transform: rotate(360deg); } }
@keyframes ring-lock { from { opacity: 0; transform: scale(1.03); } }
@keyframes halo-pulse { 30% { box-shadow: 0 0 0 2px ${UV.green}, 0 0 34px 6px color-mix(in srgb, ${UV.green} 60%, transparent); } }

/* ---------- cards (findings, upload) ---------- */
.card { position: fixed; z-index: 2147483646; display: none; width: 360px; max-width: calc(100vw - 24px); max-height: min(70vh, 560px); overflow: auto;
  border-radius: 18px; border: 1px solid ${UV.line}; background: ${UV.panel}; color: ${UV.text}; padding: 14px;
  backdrop-filter: blur(16px) saturate(1.2); -webkit-backdrop-filter: blur(16px) saturate(1.2);
  box-shadow: 0 24px 60px -24px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.03) inset; animation: card-in .28s cubic-bezier(.2,.8,.2,1); }
@keyframes card-in { from { opacity: 0; transform: translateY(6px) scale(.985); } }
.card-head { display: flex; align-items: flex-start; gap: 10px; }
.card-head .seal { color: ${UV.green}; margin-top: 2px; }
.card-title { margin: 0; font-size: 14px; font-weight: 650; letter-spacing: -.005em; }
.card-sub { margin: 2px 0 0; color: ${UV.muted}; font-size: 12px; }
.icon-btn { margin-left: auto; flex: none; width: 28px; height: 28px; border-radius: 8px; border: 0; background: transparent; color: ${UV.muted}; cursor: pointer; font-size: 16px; line-height: 1; }
.icon-btn:hover { background: rgba(255,255,255,.06); color: ${UV.text}; }

.list { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.item { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 12px;
  border: 1px solid ${UV.line}; background: rgba(255,255,255,.02); animation: item-in .3s ease-out both; }
@keyframes item-in { from { opacity: 0; transform: translateX(-4px); } }
.item-kind { color: ${UV.muted}; font-size: 11.5px; }
.item-value { display: block; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 210px; }
.item[data-hidden="true"] .item-value { color: ${UV.muted}; text-decoration: line-through; text-decoration-color: rgba(255,181,71,.6); }
.tag { display: inline-block; padding: 0 6px; border-radius: 6px; border: 1px solid rgba(61,255,176,.45); background: rgba(61,255,176,.1);
  color: ${UV.green}; font: 11.5px/1.6 ui-monospace, Consolas, monospace; text-shadow: 0 0 8px rgba(61,255,176,.6); }
.tag.kept { border-color: rgba(125,149,255,.5); background: rgba(125,149,255,.12); color: ${UV.blue}; text-shadow: none; }

/* a switch: hide (masked) / send as written */
.switch { position: relative; width: 34px; height: 20px; flex: none; border-radius: 999px; border: 1px solid ${UV.line}; background: rgba(255,255,255,.06); cursor: pointer; padding: 0; }
.switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: ${UV.muted}; transition: transform .18s, background .18s; }
.switch[aria-checked="true"] { background: rgba(61,255,176,.18); border-color: rgba(61,255,176,.55); }
.switch[aria-checked="true"]::after { transform: translateX(14px); background: ${UV.green}; box-shadow: 0 0 8px ${UV.green}; }
.item-right { display: flex; align-items: center; gap: 8px; }

.diff { margin-top: 12px; display: grid; gap: 6px; }
.diff-label { color: ${UV.muted}; font-size: 11.5px; margin-bottom: 3px; }
.diff-box { max-height: 96px; overflow: auto; padding: 8px 10px; border-radius: 10px; border: 1px solid ${UV.line}; background: rgba(0,0,0,.22);
  font: 12px/1.55 ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
.diff-box.after { border-color: rgba(61,255,176,.35); }
.raw { color: ${UV.amber}; background: rgba(255,181,71,.12); border-radius: 4px; }

.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 12px; }
.btn { min-height: 36px; border-radius: 11px; border: 1px solid ${UV.line}; background: rgba(255,255,255,.04); color: ${UV.text};
  font: 600 12.5px system-ui, sans-serif; cursor: pointer; padding: 6px 10px; transition: border-color .15s, background .15s; }
.btn:hover { border-color: rgba(125,149,255,.5); }
.btn:disabled { opacity: .45; cursor: default; }
.btn.primary { grid-column: 1 / -1; border: 0; background: ${UV.green}; color: ${UV.dark}; box-shadow: 0 0 24px -6px ${UV.green}; }
.btn.primary:hover { filter: brightness(1.08); }
.note { margin: 10px 0 0; color: ${UV.muted}; font-size: 11.5px; }
.deep-status { margin: 10px 0 0; color: ${UV.text}; font-size: 12px; line-height: 1.45; }
.deep-status[data-error="true"] { color: ${UV.amber}; }
.link-btn { border: 0; background: none; padding: 0; color: ${UV.green}; font: inherit; text-decoration: underline; cursor: pointer; }
.spin { display: inline-block; width: 11px; height: 11px; margin-right: 6px; vertical-align: -1px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.2); border-top-color: ${UV.green}; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ---------- the apply moment: values become tags and fly into the field ---------- */
.mote { position: fixed; z-index: 2147483647; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; pointer-events: none;
  background: ${UV.green}; box-shadow: 0 0 10px ${UV.green}, 0 0 2px #fff; animation: mote .75s cubic-bezier(.3,.7,.2,1) forwards; }
.mote.amber { background: ${UV.amber}; box-shadow: 0 0 10px ${UV.amber}; }
@keyframes mote { 0% { opacity: 0; transform: translate(0,0) scale(.6); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1.2); } }

@media (prefers-reduced-motion: reduce) {
  .ring, .ring > i, .halo, .halo.locked, .chip .seal, .card, .item, .spin { animation: none !important; }
  .mote { display: none; }
}
`;

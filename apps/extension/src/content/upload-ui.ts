/* "Upload with Envoy": beside the site's own file input (opt-in sites only).
 * The user picks a file in Envoy's dialog, sees findings, and only the rebuilt
 * file is handed to the site through DataTransfer. */
import type { CustomRule } from '@envoy/core';
import { kindOf, processTextUpload, type UploadReceipt } from '../upload/process';
import { UV } from './theme';

declare const chrome: { runtime: { sendMessage(msg: unknown): Promise<unknown> } };

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function initUploadUi(shadow: ShadowRoot, getRules: () => CustomRule[]): void {
  const style = document.createElement('style');
  // The same UV-night look as the field card (content/theme.ts).
  style.textContent = `
    .up-btn { position: fixed; z-index: 2147483646; display: none; align-items: center; gap: 6px; min-height: 30px; padding: 4px 12px; border-radius: 999px;
      border: 1px solid rgba(61,255,176,.5); background: ${UV.panel}; color: ${UV.green}; font: 600 12px system-ui, sans-serif; cursor: pointer;
      backdrop-filter: blur(10px); box-shadow: 0 0 18px -6px rgba(61,255,176,.6), 0 6px 22px -8px rgba(0,0,0,.55); }
    .up-btn:hover { filter: brightness(1.1); }
    .up-card { position: fixed; z-index: 2147483647; display: none; width: 380px; max-width: calc(100vw - 24px); max-height: 74vh; overflow: auto;
      border-radius: 18px; border: 1px solid ${UV.line}; background: ${UV.panel}; color: ${UV.text}; padding: 14px; font: 13px/1.45 system-ui, sans-serif;
      backdrop-filter: blur(16px) saturate(1.2); box-shadow: 0 24px 60px -24px rgba(0,0,0,.7); animation: card-in .28s cubic-bezier(.2,.8,.2,1); }
    .up-card h3 { margin: 0 0 4px; font-size: 14px; font-weight: 650; } .up-muted { color: ${UV.muted}; font-size: 12px; }
    .up-card button { min-height: 36px; border-radius: 11px; border: 1px solid ${UV.line}; background: rgba(255,255,255,.04); color: ${UV.text};
      font: 600 12.5px system-ui, sans-serif; cursor: pointer; padding: 6px 10px; }
    .up-card button:hover { border-color: rgba(125,149,255,.5); }
    .up-card button.primary { width: 100%; margin-top: 10px; border: 0; background: ${UV.green}; color: ${UV.dark}; box-shadow: 0 0 24px -6px ${UV.green}; }
    .up-card canvas { max-width: 100%; border: 1px solid ${UV.line}; border-radius: 12px; touch-action: none; cursor: crosshair; }
    .up-finding { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px; padding: 7px 10px; border-radius: 12px;
      border: 1px solid ${UV.line}; background: rgba(255,255,255,.02); }
    .up-tag { display: inline-block; padding: 0 6px; border-radius: 6px; border: 1px solid rgba(61,255,176,.45); background: rgba(61,255,176,.1);
      color: ${UV.green}; font: 11.5px/1.6 ui-monospace, Consolas, monospace; }
    .up-card input[type=checkbox] { accent-color: ${UV.green}; }`;
  shadow.appendChild(style);
  const btn = document.createElement('button');
  btn.className = 'up-btn';
  btn.textContent = 'Upload with Envoy';
  const card = document.createElement('section');
  card.className = 'up-card';
  card.setAttribute('aria-label', 'Upload with Envoy');
  shadow.append(btn, card);

  let target: HTMLInputElement | null = null;
  let chosen: File | null = null;
  let boxes: Box[] = [];
  let receipt: UploadReceipt | null = null;
  let outFile: File | null = null;

  function place() {
    if (!target) return;
    const r = target.getBoundingClientRect();
    btn.style.left = `${Math.min(r.right + 8, window.innerWidth - 150)}px`;
    btn.style.top = `${Math.max(8, r.top)}px`;
    card.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - 376)}px`;
    card.style.top = `${Math.min(r.bottom + 10, window.innerHeight - 420)}px`;
  }

  function handOff(file: File) {
    if (!target) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    target.files = dt.files;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function burnImage(file: File): Promise<File> {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    ctx.fillStyle = '#000';
    for (const b of boxes) ctx.fillRect(b.x, b.y, b.w, b.h);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob>((res) => canvas.toBlob((bb) => res(bb!), type, 0.92));
    return new File([blob], file.name.replace(/\.\w+$/, type === 'image/png' ? '.png' : '.jpg'), {
      type,
    });
  }

  function renderFindings() {
    card.querySelectorAll('.up-dynamic').forEach((n) => n.remove());
    const wrap = document.createElement('div');
    wrap.className = 'up-dynamic';
    if (receipt) {
      for (const f of receipt.findings.slice(0, 12)) {
        const row = document.createElement('div');
        row.className = 'up-finding';
        const l = document.createElement('span');
        l.textContent = `${f.type}: ${f.value}`;
        const t = document.createElement('span');
        t.className = 'up-tag';
        t.textContent = f.tag;
        row.append(l, t);
        wrap.append(row);
      }
      const rec = document.createElement('p');
      rec.className = 'up-muted';
      rec.textContent = `Receipt: removed ${receipt.removed} item(s). Will send ${receipt.outBytes} bytes as ${receipt.outType}. ${receipt.note}`;
      wrap.append(rec);
    }
    const send = document.createElement('button');
    send.className = 'primary';
    send.textContent = 'Send this file to the site';
    send.addEventListener('click', () => {
      if (outFile) {
        handOff(outFile);
        card.style.display = 'none';
        btn.style.display = 'none';
      }
    });
    wrap.append(send);
    card.append(wrap);
  }

  async function processChosen() {
    if (!chosen) return;
    const status = document.createElement('p');
    status.className = 'up-muted';
    status.textContent = 'Working on this device…';
    card.append(status);
    const kind = kindOf(chosen);
    try {
      if (kind === 'text' || kind === 'docx') {
        const res = await processTextUpload(chosen, getRules(), new Set());
        outFile = res.file;
        receipt = res.receipt;
      } else if (kind === 'pdf') {
        const buf = new Uint8Array(await chosen.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 8192)
          bin += String.fromCharCode(...buf.subarray(i, i + 8192));
        const res = (await chrome.runtime.sendMessage({
          type: 'envoy:pdf-mask',
          base64: btoa(bin),
          name: chosen.name,
        })) as { ok: true; base64: string; receipt: UploadReceipt } | { ok: false; error: string };
        if (!res.ok) throw new Error(res.error);
        const outBin = atob(res.base64);
        const outBytes = new Uint8Array(outBin.length);
        for (let i = 0; i < outBin.length; i++) outBytes[i] = outBin.charCodeAt(i);
        outFile = new File([outBytes], chosen.name, { type: 'application/pdf' });
        receipt = res.receipt;
      } else if (kind === 'image') {
        outFile = await burnImage(chosen);
        receipt = {
          kind,
          removed: boxes.length,
          findings: [],
          inBytes: chosen.size,
          outBytes: outFile.size,
          outType: outFile.type,
          note: 'Image re-encoded (EXIF/GPS stripped) with your boxes burned into the pixels.',
        };
      } else {
        status.textContent = 'Envoy cannot rebuild this file type yet. Nothing was sent.';
        return;
      }
      status.remove();
      renderFindings();
    } catch (e) {
      status.textContent = `${(e as Error).message} Nothing was sent.`;
    }
  }

  async function setupImageEditor(file: File) {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 328 / bmp.width);
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      for (const b of boxes) ctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
    };
    draw();
    let start: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      start = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!start) return;
      const r = canvas.getBoundingClientRect();
      const end = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
      boxes.push({
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        w: Math.abs(end.x - start.x),
        h: Math.abs(end.y - start.y),
      });
      start = null;
      draw();
    });
    const hint = document.createElement('p');
    hint.className = 'up-muted';
    hint.textContent =
      'Drag on the image to draw black boxes. Sending re-encodes the image, which strips EXIF/GPS.';
    card.append(hint, canvas);
  }

  btn.addEventListener('click', () => {
    card.style.display = 'block';
    card.innerHTML = '';
    boxes = [];
    outFile = null;
    receipt = null;
    chosen = null;
    const h = document.createElement('h3');
    h.textContent = 'Upload with Envoy';
    const sub = document.createElement('p');
    sub.className = 'up-muted';
    sub.textContent =
      'Envoy rebuilds the file on this device. The site receives only the rebuilt file.';
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.setAttribute('aria-label', 'Choose a file for Envoy');
    picker.addEventListener('change', async () => {
      chosen = picker.files?.[0] ?? null;
      if (!chosen) return;
      if (kindOf(chosen) === 'image') await setupImageEditor(chosen);
      await processChosen();
    });
    const close = document.createElement('button');
    close.textContent = 'Close';
    close.addEventListener('click', () => {
      card.style.display = 'none';
    });
    card.append(h, sub, picker, close);
    place();
  });

  document.addEventListener('focusin', () => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement && el.type === 'file') {
      target = el;
      btn.style.display = 'block';
      place();
    }
  });
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.type === 'file') {
        target = el;
        btn.style.display = 'block';
        place();
      }
    },
    true,
  );
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
}

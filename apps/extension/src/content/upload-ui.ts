/* "Upload with Envoy": beside the site's own file input (opt-in sites only).
 * The user picks a file in Envoy's dialog, sees findings, and only the rebuilt
 * file is handed to the site through DataTransfer. */
import type { CustomRule, MaskBox } from '@envoy/core';
import { boxLabel, summarize, toggle, toImageBox } from '../upload/boxes';
import { kindOf, processTextUpload, type UploadReceipt } from '../upload/process';
import { UV } from './theme';

declare const chrome: { runtime: { sendMessage(msg: unknown): Promise<unknown> } };

const toBase64 = (buf: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < buf.length; i += 8192)
    bin += String.fromCharCode(...buf.subarray(i, i + 8192));
  return btoa(bin);
};

/** Where Envoy is working: the protected text field and Envoy's own chip above it. */
export interface UploadAnchor {
  field: HTMLElement | null;
  chip: HTMLElement;
}

export function initUploadUi(
  shadow: ShadowRoot,
  getRules: () => CustomRule[],
  getAnchor: () => UploadAnchor,
): { place(): void } {
  const style = document.createElement('style');
  // The same UV-night look as the field card (content/theme.ts).
  style.textContent = `
    .up-btn { position: fixed; z-index: 2147483646; display: none; align-items: center; gap: 6px; min-height: 30px; padding: 4px 12px; border-radius: 999px;
      border: 1px solid rgba(61,255,176,.5); background: ${UV.panel}; color: ${UV.green}; font: 600 12px system-ui, sans-serif; cursor: pointer;
      backdrop-filter: blur(10px); box-shadow: 0 0 18px -6px rgba(61,255,176,.6), 0 6px 22px -8px rgba(0,0,0,.55); }
    .up-btn:hover { filter: brightness(1.1); }
    .up-card { position: fixed; z-index: 2147483647; display: none; width: 380px; max-width: calc(100vw - 24px); max-height: 74vh; overflow: auto; overflow-x: hidden;
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
    .up-card input[type=checkbox] { accent-color: ${UV.green}; }
    .up-card.up-wide { width: 720px; }
    .up-photo { position: relative; margin-top: 8px; overflow: clip; border-radius: 12px; cursor: crosshair; touch-action: none; }
    .up-photo canvas { display: block; max-width: none; height: auto; border: 0; border-radius: 12px; }
    .up-layer { position: absolute; inset: 0; }
    /* A mask over one private detail: solid while it hides it, dashed amber when kept visible. */
    .up-card .up-mask { position: absolute; min-height: 0; padding: 0 3px; margin: 0; border-radius: 3px; display: flex; align-items: center;
      background: #04050b; border: 1px solid rgba(61,255,176,.8); color: ${UV.green}; font: 600 9.5px/1 system-ui, sans-serif;
      overflow: hidden; white-space: nowrap; cursor: pointer; box-shadow: 0 0 10px -3px rgba(61,255,176,.7); }
    .up-card .up-mask[aria-pressed=false] { background: transparent; border-style: dashed; border-color: rgba(255,181,71,.9); color: #ffb547; box-shadow: none; }
    .up-card .up-mask[aria-pressed=false] span { background: rgba(4,5,11,.75); padding: 0 2px; border-radius: 2px; }
    .up-card .up-mask:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
    .up-scan { position: absolute; inset: 0; pointer-events: none; transform: translateY(-100%);
      background: linear-gradient(to bottom, transparent calc(100% - 26px), rgba(61,255,176,.16) calc(100% - 2px), ${UV.green} calc(100% - 2px)); }
    @media (prefers-reduced-motion: no-preference) {
      .up-scan { animation: up-scan 1.5s cubic-bezier(.45,0,.55,1) infinite; }
      .up-card .up-mask.up-in { animation: up-mask-in 180ms cubic-bezier(.2,.8,.2,1) both; }
    }
    @media (prefers-reduced-motion: reduce) { .up-scan { display: none; } }
    @keyframes up-scan { to { transform: translateY(0); } }
    @keyframes up-mask-in { from { opacity: 0; transform: scale(.96); } }`;
  shadow.appendChild(style);
  const btn = document.createElement('button');
  btn.className = 'up-btn';
  btn.textContent = 'Upload with Envoy';
  const card = document.createElement('section');
  card.className = 'up-card';
  card.setAttribute('aria-label', 'Upload with Envoy');
  shadow.append(btn, card);

  let target: HTMLInputElement | null = null;
  // The last element the person pressed outside Envoy (the "Add files" item that opened a hidden input).
  let lastPointer: Element | null = null;
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target;
      if (t instanceof Element && !t.closest('#envoy-field-ui')) lastPointer = t;
    },
    true,
  );
  let chosen: File | null = null;
  let boxes: MaskBox[] = [];
  let receipt: UploadReceipt | null = null;
  let outFile: File | null = null;

  let cardOpen = false;

  /** Really on screen: has a box, isn't hidden or transparent, and isn't covered (a closed menu). */
  function onScreen(el: Element | null | undefined): DOMRect | null {
    if (!el?.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.right <= 0) return null;
    if (r.top >= window.innerHeight || r.left >= window.innerWidth) return null;
    const check = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
    if (check && !check.call(el, { opacityProperty: true, visibilityProperty: true })) return null;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) return null;
    return r;
  }

  /** The site's file input Envoy hands the file to: the one clicked, else the one nearest the field. */
  function fileInput(field: HTMLElement | null): HTMLInputElement | null {
    if (target?.isConnected) return target;
    const all = [...document.querySelectorAll<HTMLInputElement>('input[type=file]')];
    if (!all.length) return null;
    if (!field) return all[0]!;
    const depth = (n: Node) => {
      let d = 0;
      for (let p: Node | null = n; p; p = p.parentNode) d++;
      return d;
    };
    const shared = (a: Node, b: Node) => {
      let p: Node | null = a;
      while (p && !p.contains(b)) p = p.parentNode;
      return p ? depth(p) : 0;
    };
    return all.reduce((best, el) => (shared(el, field) > shared(best, field) ? el : best));
  }

  /**
   * One fixed place, tied to the field Envoy is protecting: the button sits on the chip's row, just
   * left of Envoy's chip, so it moves only when the field moves. With no field in use (the person
   * clicked a file input directly), it sits beside that input, or beside the "+" that opened it
   * while that is really on screen, else in the bottom-right corner. The card opens above or below
   * the field, whichever has more room, sized to that room and scrolling inside it.
   */
  function place() {
    const { field, chip } = getAnchor();
    const chipShown = !!field && chip.style.display !== 'none';
    const input = fileInput(chipShown ? field : null);
    // Chat composers (Google's AI Mode, ChatGPT, Gemini…) often have no file input in the page
    // until their own "+" menu opens, so a composer always gets the button: Envoy hands the file
    // over by drop or paste, the way a person would drag it in.
    const offer = (chipShown && (isComposer(field) || !!input)) || !!target || cardOpen;
    if (!offer) {
      btn.style.display = 'none';
      if (!cardOpen) return;
    } else {
      // With the card open and the chip hidden, the button has nothing to do: hide it rather than
      // leave it in a corner.
      btn.style.display = cardOpen && !chipShown ? 'none' : 'block';
    }
    const bw = btn.offsetWidth || 140;
    const bh = btn.offsetHeight || 30;
    let anchor: DOMRect | null;
    if (chipShown) {
      const c = chip.getBoundingClientRect();
      btn.style.left = `${Math.max(8, c.left - bw - 8)}px`;
      btn.style.top = `${c.top + (c.height - bh) / 2}px`;
      anchor = field!.getBoundingClientRect();
    } else {
      anchor = onScreen(target) ?? onScreen(lastPointer);
      if (anchor) {
        btn.style.left = `${Math.min(anchor.right + 8, window.innerWidth - bw - 8)}px`;
        btn.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - bh - 8))}px`;
      } else {
        btn.style.left = `${window.innerWidth - bw - 16}px`;
        btn.style.top = `${window.innerHeight - bh - 16}px`;
      }
    }
    if (!cardOpen) return;
    // While the card is open it stays with the message box it was opened from, even if focus has
    // moved into the card and Envoy's chip has hidden (otherwise it jumped to a corner).
    if (workField?.isConnected) anchor = workField.getBoundingClientRect();
    const W = Math.min(380, window.innerWidth - 16);
    const gap = 10;
    if (!anchor) {
      card.style.maxHeight = `${window.innerHeight - 16}px`;
      const h = Math.min(card.scrollHeight, window.innerHeight - 16);
      card.style.left = `${window.innerWidth - W - 8}px`;
      card.style.top = `${window.innerHeight - h - 8}px`;
      return;
    }
    const below = window.innerHeight - anchor.bottom - gap - 8;
    const above = anchor.top - gap - 8;
    const down = below >= above;
    const room = Math.max(160, down ? below : above);
    card.style.maxHeight = `${room}px`;
    const h = Math.min(card.scrollHeight, room);
    card.style.left = `${Math.min(Math.max(8, anchor.left), window.innerWidth - W - 8)}px`;
    card.style.top = `${Math.max(8, down ? anchor.bottom + gap : anchor.top - gap - h)}px`;
  }
  // The card grows when a preview or findings appear: re-fit it every time.
  new ResizeObserver(() => cardOpen && place()).observe(card);

  /** A file input that shares a container with the message box (not body or html). */
  function nearInput(field: HTMLElement): HTMLInputElement | null {
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type=file]')];
    for (
      let p: HTMLElement | null = field.parentElement;
      p && p !== document.body;
      p = p.parentElement
    ) {
      const hit = inputs.find((i) => p!.contains(i));
      if (hit) return hit;
    }
    return null;
  }

  /** A multi-line box people write messages in (not a one-line search or form field). */
  function isComposer(el: HTMLElement | null): boolean {
    if (!el) return false;
    return (
      el.tagName === 'TEXTAREA' || el.isContentEditable || el.getAttribute('role') === 'textbox'
    );
  }

  const filesOf = (file: File) => {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt;
  };
  function giveToInput(input: HTMLInputElement, file: File) {
    input.files = filesOf(file).files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // When drop and paste are both ignored, the person presses the site's own attach button once:
  // Envoy catches that one file-picker click and hands it the rebuilt file instead of a dialog.
  let armed: File | null = null;
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target;
      if (!armed || !(el instanceof HTMLInputElement) || el.type !== 'file') return;
      e.preventDefault(); // no file dialog: Envoy supplies the file
      const file = armed;
      armed = null;
      giveToInput(el, file);
      showStatus('Attached the rebuilt file through the site’s own button.');
    },
    true,
  );

  /**
   * Hands the rebuilt file to the site, first route that works: the file input the person used,
   * a drop onto the message box, a paste into it; else ask for the site's attach button (above).
   * A route "works" when the site handles the event (cancels it), as sites do when they take a file.
   */
  function handOff(file: File): 'input' | 'drop' | 'paste' | 'armed' {
    const field = workField?.isConnected ? workField : null;
    // Started from a file input (no message box in use): give it back to that input.
    if (!field && target?.isConnected) {
      giveToInput(target, file);
      return 'input';
    }
    if (field) {
      const dt = filesOf(file);
      field.dispatchEvent(
        new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
      field.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
      const dropped = !field.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
      if (dropped) return 'drop';
      const pasted = !field.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: filesOf(file),
        }),
      );
      if (pasted) return 'paste';
    }
    // A file input next to this message box (never just any input elsewhere on the page).
    const input = field ? nearInput(field) : null;
    if (input) {
      giveToInput(input, file);
      return 'input';
    }
    armed = file;
    return 'armed';
  }

  let workField: HTMLElement | null = null;
  let closeTimer: number | undefined;
  function showStatus(text: string) {
    let s = card.querySelector<HTMLParagraphElement>('.up-status');
    if (!s) {
      s = document.createElement('p');
      s.className = 'up-muted up-status';
      s.setAttribute('role', 'status');
      card.append(s);
    }
    s.textContent = text;
    place();
  }

  async function burnImage(file: File): Promise<File> {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    ctx.fillStyle = '#000';
    // Only the boxes still masking: a box the person switched off stays visible.
    for (const b of boxes) if (b.on) ctx.fillRect(b.x, b.y, b.w, b.h);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob>((res) => canvas.toBlob((bb) => res(bb!), type, 0.92));
    return new File([blob], file.name.replace(/\.\w+$/, type === 'image/png' ? '.png' : '.jpg'), {
      type,
    });
  }

  const receiptText = (r: UploadReceipt) =>
    `Receipt: removed ${r.removed} item(s). Will send ${r.outBytes} bytes as ${r.outType}. ${r.note}`;

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
      rec.classList.add('up-receipt');
      rec.textContent = receiptText(receipt);
      wrap.append(rec);
    }
    const send = document.createElement('button');
    send.className = 'primary';
    send.textContent = 'Send this file to the site';
    send.addEventListener('click', async () => {
      // Images: burn the boxes in now, so every box drawn after the file was chosen is applied.
      if (chosen && kindOf(chosen) === 'image') outFile = await burnImage(chosen);
      if (!outFile) return;
      const how = handOff(outFile);
      if (how === 'armed') {
        showStatus(
          'This site didn’t take the file directly. Now press the site’s own attach or "+" button and pick upload: Envoy hands it this rebuilt file, and no file dialog opens.',
        );
        return;
      }
      showStatus(
        how === 'input'
          ? 'Sent: the site received the rebuilt file.'
          : 'Sent: dropped into the message box. Check that the site shows the attachment.',
      );
      closeTimer = window.setTimeout(() => {
        cardOpen = false;
        card.style.display = 'none';
        place();
      }, 1600);
    });
    wrap.append(send);
    card.append(wrap);
  }

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
  async function processChosen() {
    if (!chosen) return;
    const status = document.createElement('p');
    status.className = 'up-muted';
    if (chosen.size > MAX_UPLOAD_BYTES) {
      status.textContent = 'This file is larger than 10 MB. Nothing was sent.';
      card.append(status);
      return;
    }
    status.textContent = 'Working on this device…';
    card.append(status);
    const kind = kindOf(chosen);
    try {
      if (kind === 'text' || kind === 'docx' || kind === 'xlsx' || kind === 'pptx') {
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
          custom: getRules(),
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
          removed: boxes.filter((b) => b.on).length,
          findings: [],
          inBytes: chosen.size,
          outBytes: outFile.size,
          outType: outFile.type,
          note: 'Image re-encoded (EXIF/GPS stripped) with the masked boxes burned into the pixels.',
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

  /**
   * The photo editor: the photo is read on this device (offscreen document: Tesseract.js and
   * zxing-wasm from the extension package), and every private detail found gets a mask already
   * drawn. Each mask is a button: press it to keep that part visible, press again to mask it.
   * Dragging on the photo adds a box of your own.
   */
  async function setupImageEditor(file: File) {
    const bmp = await createImageBitmap(file);
    card.classList.add('up-wide');
    place();
    const maxW = Math.min(692, window.innerWidth - 52);
    const scale = Math.min(1, maxW / bmp.width);
    const wrap = document.createElement('div');
    wrap.className = 'up-photo';
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    // One CSS pixel per canvas pixel, so the masks (placed at photo × scale) sit exactly on it.
    canvas.style.width = `${canvas.width}px`;
    wrap.style.width = `${canvas.width}px`;
    const layer = document.createElement('div');
    layer.className = 'up-layer';
    const scan = document.createElement('div');
    scan.className = 'up-scan';
    scan.setAttribute('aria-hidden', 'true');
    wrap.append(canvas, layer, scan);
    const summary = document.createElement('p');
    summary.className = 'up-muted up-photo-summary';
    summary.setAttribute('role', 'status');
    summary.textContent = 'Reading this photo on your device. Nothing is sent.';
    const hint = document.createElement('p');
    hint.className = 'up-muted';
    hint.textContent =
      'Drag on the photo to add a box. Sending re-encodes the image, which strips EXIF/GPS.';
    card.append(summary, wrap, hint);

    // Keep the summary and the receipt true: each masked box is one item removed when sent.
    const update = () => {
      summary.textContent = summarize(boxes);
      if (receipt) {
        receipt.removed = boxes.filter((b) => b.on).length;
        const r = card.querySelector('.up-receipt');
        if (r) r.textContent = receiptText(receipt);
      }
    };
    const renderMasks = (arriving: boolean) => {
      layer.replaceChildren(
        ...boxes.map((b, i) => {
          const m = document.createElement('button');
          m.type = 'button';
          m.className = arriving ? 'up-mask up-in' : 'up-mask';
          m.style.left = `${b.x * scale}px`;
          m.style.top = `${b.y * scale}px`;
          m.style.width = `${Math.max(6, b.w * scale)}px`;
          m.style.height = `${Math.max(6, b.h * scale)}px`;
          // One after another, so the eye follows the masks landing on the page.
          if (arriving) m.style.animationDelay = `${Math.min(i, 24) * 45}ms`;
          const label = boxLabel(b);
          m.setAttribute('aria-pressed', String(b.on));
          m.setAttribute(
            'aria-label',
            `${label}: ${b.on ? 'masked' : 'kept visible'}. Press to ${b.on ? 'keep it visible' : 'mask it'}.`,
          );
          const tag = document.createElement('span');
          tag.textContent = b.on ? label : `${label} kept`;
          m.append(tag);
          m.addEventListener('pointerdown', (e) => e.stopPropagation());
          m.addEventListener('click', (e) => {
            e.stopPropagation();
            boxes = toggle(boxes, i);
            renderMasks(false);
            update();
            (layer.children[i] as HTMLElement | undefined)?.focus();
          });
          return m;
        }),
      );
    };

    let start: { x: number; y: number } | null = null;
    const at = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    };
    wrap.addEventListener('pointerdown', (e) => {
      start = at(e);
    });
    wrap.addEventListener('pointerup', (e) => {
      if (!start) return;
      const end = at(e);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      if (w * scale > 4 && h * scale > 4) {
        boxes = [
          ...boxes,
          toImageBox({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w, h }),
        ];
        renderMasks(false);
        update();
      }
      start = null;
    });

    const failed = "Couldn't read text in this photo on this device. Drag to draw boxes by hand.";
    try {
      const res = (await chrome.runtime.sendMessage({
        type: 'envoy:ocr-boxes',
        base64: toBase64(new Uint8Array(await file.arrayBuffer())),
        mime: file.type,
        custom: getRules(),
      })) as { ok: true; boxes: MaskBox[] } | { ok: false; error: string };
      scan.remove();
      if (!res?.ok) {
        summary.textContent = failed;
        return;
      }
      boxes = [...res.boxes, ...boxes];
      renderMasks(true);
      update();
    } catch {
      scan.remove();
      summary.textContent = failed;
    }
  }

  // Remember the message box before the click moves focus into Envoy's card.
  btn.addEventListener('pointerdown', () => {
    workField = getAnchor().field;
  });
  btn.addEventListener('click', () => {
    workField = workField?.isConnected ? workField : getAnchor().field;
    armed = null;
    window.clearTimeout(closeTimer); // a new upload: don't let the last one's close timer shut it
    cardOpen = true;
    card.style.display = 'block';
    card.replaceChildren();
    card.classList.remove('up-wide');
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
      cardOpen = false;
      card.style.display = 'none';
      place();
    });
    card.append(h, sub, picker, close);
    place();
  });

  document.addEventListener('focusin', () => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement && el.type === 'file') {
      target = el;
      place();
    }
  });
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.type === 'file') {
        target = el;
        place();
      }
    },
    true,
  );
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  return { place };
}

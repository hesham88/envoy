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
  let boxes: Box[] = [];
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
    for (const b of boxes) ctx.fillRect(b.x, b.y, b.w, b.h);
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
      // Keep the receipt true: each box drawn is one more item removed when the file is sent.
      if (receipt) {
        receipt.removed = boxes.length;
        const r = card.querySelector('.up-receipt');
        if (r) r.textContent = receiptText(receipt);
      }
    });
    const hint = document.createElement('p');
    hint.className = 'up-muted';
    hint.textContent =
      'Drag on the image to draw black boxes. Sending re-encodes the image, which strips EXIF/GPS.';
    card.append(hint, canvas);
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

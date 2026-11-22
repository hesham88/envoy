/* Envoy content script: runs ONLY on origins the user opted into (dynamically
 * registered from the popup). It reads/writes the focused field, scans locally
 * with rules, and asks the extension (never the page) for a deep model check. */
import { maskFindings, scanText, type CustomRule, type Finding, type ScanResult } from '@envoy/core';
import { fieldFromElement, isEnvoyField } from './eligibility';
import { getFieldText, setFieldText } from './field';
import { initUploadUi } from './upload-ui';

declare const chrome: {
  storage: { local: { get(k: string): Promise<Record<string, unknown>> }; onChanged: { addListener(fn: () => void): void } };
  runtime: { sendMessage(msg: unknown): Promise<unknown> };
};

const DEVICE = '#0f7b5f';
const CLOUD = '#2557d6';
let customRules: CustomRule[] = [];
let activeField: HTMLElement | null = null;
let protectionOn = false;
let scan: ScanResult | null = null;
const keep = new Set<string>();
let original: string | null = null;
let deepFindings: { type: string; value: string; tag: string }[] = [];
let deepBusy = false;
let lastDeepHash = '';
let debounce: number | undefined;
let idleTimer: number | undefined;

const host = document.createElement('div');
host.id = 'envoy-field-ui';
const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = `
<style>
  :host { all: initial; }
  .toggle { position: fixed; z-index: 2147483646; display: none; align-items: center; gap: 6px; min-height: 32px;
    padding: 4px 10px; border-radius: 999px; border: 1px solid ${DEVICE}; background: #fff; color: #0b5e48;
    font: 600 12px system-ui, sans-serif; cursor: pointer; box-shadow: 0 2px 10px rgb(0 0 0 / .14); }
  .toggle[aria-pressed="true"] { background: #e3f1ec; }
  .ring { position: fixed; z-index: 2147483645; display: none; pointer-events: none; border: 2px solid ${DEVICE};
    box-shadow: 0 0 0 3px rgb(15 123 95 / .22), 0 0 18px 2px rgb(15 123 95 / .35), inset 0 0 12px rgb(37 87 214 / .18); }
  .ring::after { content: ""; position: absolute; inset: -6px; border-radius: inherit; opacity: .5;
    background: repeating-conic-gradient(from 0deg, ${DEVICE} 0deg 6deg, transparent 6deg 14deg, ${CLOUD} 14deg 18deg, transparent 18deg 30deg);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; padding: 3px;
    animation: envoy-spin 14s linear infinite; }
  @keyframes envoy-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .ring::after { animation: none; } }
  .card { position: fixed; z-index: 2147483646; display: none; width: 340px; max-width: calc(100vw - 24px); max-height: 60vh; overflow: auto;
    background: #fff; color: #16181d; border: 1px solid #e2e2dd; border-radius: 16px; padding: 12px;
    font: 13px/1.45 system-ui, sans-serif; box-shadow: 0 12px 40px rgb(0 0 0 / .18); }
  .card h3 { margin: 0 0 4px; font-size: 14px; }
  .muted { color: #4e5461; font-size: 12px; }
  .finding { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; border-top: 1px solid #e2e2dd; }
  .tag { font-family: ui-monospace, monospace; background: #16181d; color: #f7f7f5; border-radius: 6px; padding: 0 5px; }
  pre { white-space: pre-wrap; font: 11.5px ui-monospace, monospace; background: #f7f7f5; border-radius: 10px; padding: 8px; max-height: 110px; overflow: auto; }
  button.act { min-height: 36px; border-radius: 10px; border: 1px solid #e2e2dd; background: #fff; font-weight: 600; cursor: pointer; padding: 6px 10px; }
  button.primary { background: #16181d; color: #f7f7f5; width: 100%; margin-top: 8px; }
  .row { display: flex; gap: 6px; margin-top: 6px; }
</style>
<button class="toggle" part="toggle" aria-pressed="false">Envoy</button>
<div class="ring" aria-hidden="true"></div>
<section class="card" aria-label="Envoy findings"></section>`;
document.documentElement.appendChild(host);

const toggle = shadow.querySelector('.toggle') as HTMLButtonElement;
const ring = shadow.querySelector('.ring') as HTMLDivElement;
const card = shadow.querySelector('.card') as HTMLElement;

async function loadRules() {
  try {
    const v = await chrome.storage.local.get('envoyRules');
    customRules = Array.isArray(v.envoyRules) ? (v.envoyRules as CustomRule[]) : [];
  } catch { customRules = []; }
}
void loadRules();
chrome.storage.onChanged.addListener(() => void loadRules());

function place() {
  if (!activeField) return;
  const r = activeField.getBoundingClientRect();
  toggle.style.display = 'inline-flex';
  toggle.style.left = `${Math.max(8, r.right - 92)}px`;
  toggle.style.top = `${Math.max(8, r.top - 38)}px`;
  if (protectionOn) {
    ring.style.display = 'block';
    ring.style.left = `${r.left - 3}px`;
    ring.style.top = `${r.top - 3}px`;
    ring.style.width = `${r.width + 2}px`;
    ring.style.height = `${r.height + 2}px`;
    ring.style.borderRadius = getComputedStyle(activeField).borderRadius || '10px';
    card.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - 356)}px`;
    card.style.top = `${Math.min(r.bottom + 10, window.innerHeight - 320)}px`;
  }
}

function currentMasked(): string {
  if (!activeField) return '';
  const text = getFieldText(activeField);
  let out = scan ? maskFindings(text, scan, keep) : text;
  for (const f of [...deepFindings].sort((a, b) => b.value.length - a.value.length)) {
    if (!keep.has(f.tag)) out = out.split(f.value).join(f.tag);
  }
  return out;
}

function renderCard() {
  if (!activeField || !protectionOn) { card.style.display = 'none'; return; }
  const text = getFieldText(activeField);
  const findings: (Finding | { type: string; value: string; tag: string })[] = [...(scan?.findings ?? []), ...deepFindings];
  card.style.display = 'block';
  card.innerHTML = '';
  const h = document.createElement('h3');
  h.textContent = findings.length ? `Envoy found ${findings.length} item${findings.length === 1 ? '' : 's'} on this device` : 'Nothing private found yet';
  const sub = document.createElement('p');
  sub.className = 'muted';
  sub.textContent = 'Rules run as you type. The on-device model checks on pause. Nothing leaves this field until you apply.';
  card.append(h, sub);
  for (const f of findings) {
    const row = document.createElement('label');
    row.className = 'finding';
    const left = document.createElement('span');
    left.textContent = `${f.type}: ${f.value}`;
    const right = document.createElement('span');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !keep.has(f.tag);
    cb.setAttribute('aria-label', `Mask ${f.value} as ${f.tag}`);
    cb.addEventListener('change', () => { if (cb.checked) keep.delete(f.tag); else keep.add(f.tag); renderCard(); });
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = f.tag;
    right.append(cb, tag);
    row.append(left, right);
    card.append(row);
  }
  const before = document.createElement('pre');
  before.textContent = `Site receives now:\n${text.slice(0, 400)}`;
  const after = document.createElement('pre');
  after.textContent = `After Apply:\n${currentMasked().slice(0, 400)}`;
  card.append(before, after);
  const row = document.createElement('div');
  row.className = 'row';
  const deep = document.createElement('button');
  deep.className = 'act';
  deep.textContent = deepBusy ? 'Checking on device…' : 'Check deeply';
  deep.disabled = deepBusy;
  deep.addEventListener('click', () => void runDeepCheck(true));
  const undo = document.createElement('button');
  undo.className = 'act';
  undo.textContent = 'Undo';
  undo.disabled = original === null;
  undo.addEventListener('click', () => { if (activeField && original !== null) { setFieldText(activeField, original); original = null; rescan(); } });
  row.append(deep, undo);
  const apply = document.createElement('button');
  apply.className = 'act primary';
  apply.textContent = 'Apply to field';
  apply.addEventListener('click', () => {
    if (!activeField) return;
    if (original === null) original = getFieldText(activeField);
    setFieldText(activeField, currentMasked());
    rescan();
  });
  card.append(row, apply);
  place();
}

function rescan() {
  if (!activeField) return;
  scan = scanText(getFieldText(activeField), { custom: customRules });
  renderCard();
}

async function runDeepCheck(manual: boolean) {
  if (!activeField || deepBusy) return;
  const text = getFieldText(activeField);
  const hash = `${text.length}:${text.slice(0, 64)}`;
  if (!manual && hash === lastDeepHash) return;
  lastDeepHash = hash;
  deepBusy = true;
  renderCard();
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'envoy:deep-check', text })) as { ok: boolean; findings?: typeof deepFindings; error?: string };
    if (res?.ok && res.findings) {
      const seen = new Set((scan?.findings ?? []).map((f) => f.value));
      deepFindings = res.findings.filter((f) => !seen.has(f.value));
    }
  } catch { /* rules-only is the fallback; the card copy already says so */ }
  deepBusy = false;
  renderCard();
}

function onFieldEvent() {
  window.clearTimeout(debounce);
  window.clearTimeout(idleTimer);
  debounce = window.setTimeout(() => { if (protectionOn) rescan(); }, 150);
  idleTimer = window.setTimeout(() => { if (protectionOn) void runDeepCheck(false); }, 1200);
}

toggle.addEventListener('click', () => {
  protectionOn = !protectionOn;
  toggle.setAttribute('aria-pressed', String(protectionOn));
  ring.style.display = protectionOn ? 'block' : 'none';
  if (protectionOn) { original = null; rescan(); } else { card.style.display = 'none'; }
  place();
});

document.addEventListener('focusin', () => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return;
  if (!isEnvoyField(fieldFromElement(el))) { activeField = null; toggle.style.display = 'none'; ring.style.display = 'none'; card.style.display = 'none'; return; }
  activeField = el;
  place();
});
document.addEventListener('input', (e) => { if (activeField && e.target === activeField) onFieldEvent(); }, true);
window.addEventListener('resize', place);
window.addEventListener('scroll', place, true);
document.addEventListener('focusout', () => {
  window.setTimeout(() => { if (document.activeElement !== activeField) { toggle.style.display = 'none'; } }, 120);
});

initUploadUi(shadow, () => customRules);

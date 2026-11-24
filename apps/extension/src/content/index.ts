/* Envoy content script: runs ONLY on origins the user opted into (dynamically
 * registered from the popup). It reads/writes the focused field, scans locally
 * with rules, and asks the extension (never the page) for a deep model check.
 *
 * Off means off: until the user turns Envoy on for a field, nothing is drawn except a small chip
 * on the focused field. Page text is only ever written with textContent, never as HTML. */
import {
  maskFindings,
  scanText,
  type CustomRule,
  type Finding,
  type ScanResult,
} from '@envoy/core';
import { fieldFromElement, isEnvoyField } from './eligibility';
import { getFieldText, setFieldText } from './field';
import { sealSvg, THEME_CSS } from './theme';
import { initUploadUi } from './upload-ui';

declare const chrome: {
  storage: {
    local: { get(k: string): Promise<Record<string, unknown>> };
    onChanged: { addListener(fn: () => void): void };
  };
  runtime: { sendMessage(msg: unknown): Promise<unknown> };
};

type AnyFinding = Finding | { type: string; value: string; tag: string };

const KIND: Record<string, string> = {
  PERSON: 'Name',
  ORG: 'Organisation',
  ADDRESS: 'Address',
  EMAIL: 'Email',
  PHONE: 'Phone',
  NATIONAL_ID: 'National ID',
  IBAN: 'Bank account',
  ACCOUNT: 'Account number',
  CARD: 'Card number',
  MONEY: 'Amount',
  DATE: 'Date',
  SECRET: 'Secret key',
  CUSTOM: 'Your rule',
};

let customRules: CustomRule[] = [];
let activeField: HTMLElement | null = null;
let protectionOn = false;
let cardOpen = false;
let scan: ScanResult | null = null;
const keep = new Set<string>();
let original: string | null = null;
let deepFindings: { type: string; value: string; tag: string }[] = [];
let deepBusy = false;
/** The last on-device check's outcome, always shown so a check never looks like it did nothing. */
let deepStatus: { ok: true; added: number; ms?: number } | { ok: false; error: string } | null =
  null;
let lastDeepHash = '';
let debounce: number | undefined;
let idleTimer: number | undefined;
let lastCount = 0;

const host = document.createElement('div');
host.id = 'envoy-field-ui';
const shadow = host.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = THEME_CSS;
const root = document.createElement('div');
root.className = 'uv';
shadow.append(style, root);

const chip = document.createElement('button');
chip.className = 'chip';
chip.type = 'button';
chip.setAttribute('role', 'switch');
chip.setAttribute('aria-checked', 'false');
chip.dataset.state = 'off';
chip.innerHTML = sealSvg(16); // static markup only
const chipLabel = document.createElement('span');
chipLabel.textContent = 'Envoy off';
chip.append(chipLabel);

const ring = document.createElement('div');
ring.className = 'ring';
ring.setAttribute('aria-hidden', 'true');
ring.append(document.createElement('i')); // the rotating colour layer
const halo = document.createElement('div');
halo.className = 'halo';
halo.setAttribute('aria-hidden', 'true');

const card = document.createElement('section');
card.className = 'card';
card.setAttribute('aria-label', 'Envoy: private details in this field');

root.append(halo, ring, chip, card);
document.documentElement.appendChild(host);

async function loadRules() {
  try {
    const v = await chrome.storage.local.get('envoyRules');
    customRules = Array.isArray(v.envoyRules) ? (v.envoyRules as CustomRule[]) : [];
  } catch {
    customRules = [];
  }
}
void loadRules();

// Switching Envoy off for this site in the popup unregisters the script for future page loads; the
// copy already running here must stop too, at once. Only an explicit "off" for this origin counts.
let siteOn = true;
async function checkSite() {
  try {
    const v = await chrome.storage.local.get('envoySites');
    const sites = (v.envoySites ?? {}) as Record<string, boolean>;
    siteOn = sites[location.origin] !== false;
  } catch {
    siteOn = true;
  }
  host.style.display = siteOn ? '' : 'none';
  if (!siteOn) {
    if (protectionOn) setProtection(false);
    activeField = null;
    for (const n of [chip, ring, halo, card]) n.style.display = 'none';
  }
}
void checkSite();
chrome.storage.onChanged.addListener(() => {
  void loadRules();
  void checkSite();
});

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function allFindings(): AnyFinding[] {
  const seen = new Set<string>();
  return [...(scan?.findings ?? []), ...deepFindings].filter((f) =>
    seen.has(f.tag) ? false : (seen.add(f.tag), true),
  );
}

/** Findings still in the field as raw text (not kept on purpose). */
function rawCount(): number {
  return allFindings().filter((f) => !keep.has(f.tag)).length;
}

function updateChip() {
  const raw = rawCount();
  const state = !protectionOn ? 'off' : raw > 0 ? 'found' : 'safe';
  chip.dataset.state = state;
  chip.setAttribute('aria-checked', String(protectionOn));
  chipLabel.textContent =
    state === 'off'
      ? 'Envoy off'
      : state === 'found'
        ? `${raw} private ${raw === 1 ? 'detail' : 'details'}`
        : 'Protected';
  chip.title = state === 'off' ? 'Turn Envoy on for this field' : 'Turn Envoy off for this field';
  ring.dataset.tone = state === 'found' ? 'found' : 'safe';
  halo.dataset.tone = ring.dataset.tone;
}

function place() {
  if (!activeField) return;
  const r = activeField.getBoundingClientRect();
  chip.style.display = 'inline-flex';
  const chipW = chip.offsetWidth || 120;
  chip.style.left = `${Math.min(Math.max(8, r.right - chipW), window.innerWidth - chipW - 8)}px`;
  chip.style.top = `${r.top > 44 ? r.top - 38 : r.bottom + 6}px`;
  if (!protectionOn) return;
  const radius = parseFloat(getComputedStyle(activeField).borderTopLeftRadius) || 8;
  for (const layer of [ring, halo]) {
    layer.style.display = 'block';
    layer.style.left = `${r.left - 3}px`;
    layer.style.top = `${r.top - 3}px`;
    layer.style.width = `${r.width + 6}px`;
    layer.style.height = `${r.height + 6}px`;
    layer.style.borderRadius = `${radius + 3}px`;
  }
  if (!cardOpen) return;
  // Never cover the field: beside it when there's room, else above or below, whichever has more
  // space, with the card scrolling inside that space.
  const W = 372;
  const gap = 12;
  const spaceRight = window.innerWidth - r.right - gap - 8;
  const spaceLeft = r.left - gap - 8;
  card.style.maxHeight = '';
  if (spaceRight >= W || spaceLeft >= W) {
    const left = spaceRight >= W ? r.right + gap : r.left - gap - W;
    const h = Math.min(card.scrollHeight || 420, window.innerHeight - 16);
    card.style.left = `${left}px`;
    card.style.top = `${Math.min(Math.max(8, r.top), window.innerHeight - h - 8)}px`;
    card.style.maxHeight = `${window.innerHeight - 16}px`;
    return;
  }
  const spaceBelow = window.innerHeight - r.bottom - gap - 8;
  const spaceAbove = r.top - gap - 8;
  const below = spaceBelow >= spaceAbove;
  const room = Math.max(160, below ? spaceBelow : spaceAbove);
  const h = Math.min(card.scrollHeight || 420, room);
  card.style.maxHeight = `${room}px`;
  card.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - W - 8)}px`;
  card.style.top = `${below ? r.bottom + gap : r.top - gap - h}px`;
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

/** Text with raw values (amber) or tags (green) marked, built from text nodes only. */
function marked(text: string, mode: 'before' | 'after'): DocumentFragment {
  const frag = document.createDocumentFragment();
  const clip = text.length > 600 ? `${text.slice(0, 600)}…` : text;
  if (mode === 'after') {
    for (const part of clip.split(/(\[[A-Z][A-Z0-9_]*\])/g)) {
      if (/^\[[A-Z][A-Z0-9_]*\]$/.test(part)) frag.append(el('span', 'tag', part));
      else if (part) frag.append(document.createTextNode(part));
    }
    return frag;
  }
  const values = allFindings()
    .filter((f) => !keep.has(f.tag))
    .map((f) => f.value)
    .sort((a, b) => b.length - a.length);
  let rest = clip;
  while (rest) {
    let at = -1;
    let hit = '';
    for (const v of values) {
      const i = rest.indexOf(v);
      if (i !== -1 && (at === -1 || i < at)) {
        at = i;
        hit = v;
      }
    }
    if (at === -1) {
      frag.append(document.createTextNode(rest));
      break;
    }
    if (at > 0) frag.append(document.createTextNode(rest.slice(0, at)));
    frag.append(el('span', 'raw', hit));
    rest = rest.slice(at + hit.length);
  }
  return frag;
}

function renderCard() {
  updateChip();
  if (!activeField || !protectionOn || !cardOpen) {
    card.style.display = 'none';
    return;
  }
  const text = getFieldText(activeField);
  const findings = allFindings();
  card.style.display = 'block';
  card.replaceChildren();

  const head = el('div', 'card-head');
  const seal = el('span');
  seal.innerHTML = sealSvg(20); // static markup only
  const titles = el('div');
  const raw = rawCount();
  const onlyTags = !findings.length && /\[[A-Z][A-Z0-9_]*\]/.test(text);
  if (onlyTags) {
    titles.append(
      el('p', 'card-title', 'Protected: only tags are left in this field'),
      el(
        'p',
        'card-sub',
        'The site will receive the tags, not your details. Undo puts your text back.',
      ),
    );
  } else
    titles.append(
      el(
        'p',
        'card-title',
        findings.length
          ? `${findings.length} private ${findings.length === 1 ? 'detail' : 'details'} found on this device`
          : 'Nothing private found yet',
      ),
      el(
        'p',
        'card-sub',
        raw
          ? `${raw} still in the field as written. Replace them before you send.`
          : 'Rules check as you type; the on-device model checks when you pause.',
      ),
    );
  const close = el('button', 'icon-btn', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Hide this card (Envoy stays on)');
  close.addEventListener('click', () => {
    cardOpen = false;
    renderCard();
  });
  head.append(seal, titles, close);
  card.append(head);

  if (findings.length) {
    const list = el('ul', 'list');
    findings.forEach((f, i) => {
      const hidden = !keep.has(f.tag);
      const item = el('li', 'item');
      item.dataset.hidden = String(!hidden);
      item.style.animationDelay = `${i * 35}ms`;
      const left = el('div');
      left.append(
        el('span', 'item-kind', KIND[f.type] ?? f.type),
        el('span', 'item-value', f.value),
      );
      const right = el('div', 'item-right');
      const tag = el('span', hidden ? 'tag' : 'tag kept', hidden ? f.tag : 'as written');
      const sw = el('button', 'switch');
      sw.type = 'button';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(hidden));
      sw.setAttribute(
        'aria-label',
        `${hidden ? 'Hiding' : 'Sending'} ${f.value}. Switch to ${hidden ? 'send it as written' : 'hide it as ' + f.tag}`,
      );
      sw.addEventListener('click', () => {
        if (hidden) keep.add(f.tag);
        else keep.delete(f.tag);
        renderCard();
      });
      right.append(tag, sw);
      item.append(left, right);
      list.append(item);
    });
    card.append(list);

    const diff = el('div', 'diff');
    const b = el('div');
    const bBox = el('div', 'diff-box');
    bBox.append(marked(text, 'before'));
    b.append(el('div', 'diff-label', 'The site receives now'), bBox);
    const a = el('div');
    const aBox = el('div', 'diff-box after');
    aBox.append(marked(currentMasked(), 'after'));
    a.append(el('div', 'diff-label', 'After you replace'), aBox);
    diff.append(b, a);
    card.append(diff);
  }

  const actions = el('div', 'actions');
  const deep = el('button', 'btn');
  deep.type = 'button';
  if (deepBusy) deep.append(el('span', 'spin'), document.createTextNode('Checking on device'));
  else deep.textContent = 'Check with on-device AI';
  deep.disabled = deepBusy;
  deep.title = "Runs Chrome's built-in model on this device. Nothing is sent.";
  deep.addEventListener('click', () => void runDeepCheck(true));
  const undo = el('button', 'btn', 'Undo replace');
  undo.type = 'button';
  undo.disabled = original === null;
  undo.addEventListener('click', () => {
    if (activeField && original !== null) {
      setFieldText(activeField, original);
      original = null;
      rescan();
    }
  });
  actions.append(deep, undo);
  if (findings.length) {
    const apply = el(
      'button',
      'btn primary',
      raw ? `Replace ${raw} in the field` : 'Nothing left to replace',
    );
    apply.type = 'button';
    apply.disabled = raw === 0;
    apply.addEventListener('click', () => {
      if (!activeField) return;
      if (original === null) original = getFieldText(activeField);
      burst(apply);
      setFieldText(activeField, currentMasked());
      rescan();
      halo.classList.remove('locked');
      void halo.offsetWidth; // restart the pulse
      halo.classList.add('locked');
    });
    actions.append(apply);
  }
  const status = deepStatusLine();
  card.append(
    actions,
    ...(status ? [status] : []),
    el(
      'p',
      'note',
      'Nothing leaves this page because of Envoy. It only changes the text in the field, and only when you press Replace.',
    ),
  );
  place();
}

/** One line about the last on-device check: what it found, or why it couldn't run and how to fix it. */
function deepStatusLine(): HTMLElement | null {
  if (deepBusy || !deepStatus) return null;
  const line = el('p', 'deep-status');
  line.setAttribute('role', 'status');
  if (deepStatus.ok) {
    const secs = deepStatus.ms ? ` in ${(deepStatus.ms / 1000).toFixed(1)} s` : '';
    line.textContent =
      deepStatus.added > 0
        ? `On-device check found ${deepStatus.added} more${secs}.`
        : `On-device check done${secs}: nothing more found.`;
    return line;
  }
  line.dataset.error = 'true';
  line.append(
    document.createTextNode(
      `On-device check couldn't run: ${deepStatus.error} Rules still protect this field. `,
    ),
  );
  const fix = el('button', 'link-btn', 'How to turn on private mode');
  fix.type = 'button';
  fix.addEventListener(
    'click',
    () => void chrome.runtime.sendMessage({ type: 'envoy:open-ai-setup' }),
  );
  line.append(fix);
  return line;
}

/** The apply moment: motes fly from the card into the field (skipped under reduced motion via CSS). */
function burst(from: HTMLElement) {
  if (!activeField) return;
  const a = from.getBoundingClientRect();
  const b = activeField.getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const m = el('span', i % 4 === 0 ? 'mote amber' : 'mote');
    const x = a.left + Math.random() * a.width;
    const y = a.top + Math.random() * a.height;
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    m.style.setProperty('--dx', `${b.left + Math.random() * b.width - x}px`);
    m.style.setProperty('--dy', `${b.top + Math.random() * b.height - y}px`);
    m.style.animationDelay = `${i * 18}ms`;
    root.append(m);
    window.setTimeout(() => m.remove(), 1000);
  }
}

function rescan() {
  if (!activeField) return;
  scan = scanText(getFieldText(activeField), { custom: customRules });
  const count = allFindings().length;
  if (count > lastCount) cardOpen = true; // a new finding reopens the card
  lastCount = count;
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
    const res = (await chrome.runtime.sendMessage({ type: 'envoy:deep-check', text })) as {
      ok: boolean;
      findings?: typeof deepFindings;
      error?: string;
      ms?: number;
    };
    if (res?.ok && res.findings) {
      const seen = new Set((scan?.findings ?? []).map((f) => f.value));
      deepFindings = res.findings.filter((f) => !seen.has(f.value));
      deepStatus = { ok: true, added: deepFindings.length, ...(res.ms ? { ms: res.ms } : {}) };
    } else {
      deepStatus = { ok: false, error: res?.error ?? 'no answer from the on-device checker.' };
    }
  } catch (e) {
    deepStatus = { ok: false, error: `${(e as Error).message}.` };
  }
  deepBusy = false;
  renderCard();
}

function onFieldEvent() {
  window.clearTimeout(debounce);
  window.clearTimeout(idleTimer);
  debounce = window.setTimeout(() => {
    if (protectionOn) rescan();
  }, 150);
  idleTimer = window.setTimeout(() => {
    if (protectionOn) void runDeepCheck(false);
  }, 1200);
}

function setProtection(on: boolean) {
  protectionOn = on;
  cardOpen = on;
  halo.classList.remove('locked');
  if (on) {
    original = null;
    keep.clear();
    deepFindings = [];
    deepStatus = null;
    lastCount = 0;
    rescan();
  } else {
    // Off means off: no ring, no card, no colour.
    ring.style.display = 'none';
    halo.style.display = 'none';
    card.style.display = 'none';
    updateChip();
  }
  place();
}

chip.addEventListener('click', () => setProtection(!protectionOn));
chip.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus (and the caret) in the field

shadow.addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Escape' && cardOpen) {
    cardOpen = false;
    renderCard();
    activeField?.focus();
  }
});

document.addEventListener('focusin', () => {
  if (!siteOn) return;
  const t = document.activeElement as HTMLElement | null;
  if (!t || t === document.body || t === host) return;
  if (!isEnvoyField(fieldFromElement(t))) {
    activeField = null;
    chip.style.display = 'none';
    ring.style.display = 'none';
    halo.style.display = 'none';
    card.style.display = 'none';
    return;
  }
  if (t !== activeField) {
    activeField = t;
    if (protectionOn) setProtection(false); // protection is per field: a new field starts off
  }
  updateChip();
  place();
});
document.addEventListener(
  'input',
  (e) => {
    if (siteOn && activeField && e.target === activeField) onFieldEvent();
  },
  true,
);
window.addEventListener('resize', place);
window.addEventListener('scroll', place, true);
document.addEventListener('focusout', () => {
  window.setTimeout(() => {
    const a = document.activeElement;
    if (a !== activeField && a !== host && !protectionOn) chip.style.display = 'none';
  }, 120);
});

const upload = initUploadUi(
  shadow,
  () => customRules,
  () => ({ field: activeField, chip }),
);
// The upload button lives beside the chip: move it whenever the chip moves or hides.
window.addEventListener('resize', () => upload.place());
window.addEventListener('scroll', () => upload.place(), true);
document.addEventListener('focusin', () => upload.place());
document.addEventListener('focusout', () => window.setTimeout(() => upload.place(), 140));

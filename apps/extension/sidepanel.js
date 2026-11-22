/* global chrome, document, window, navigator, self, LanguageModel */
// Prerequisite gate for the Envoy extension. This scaffold deliberately does
// NOT call Firebase or the cloud: integration wires @envoy/core + @envoy/ai
// into `window.__envoyExtension.analyze` (see INTEGRATION.md).
const checksEl = document.getElementById('checks');
const pill = document.getElementById('statusPill');
const enableBtn = document.getElementById('enableBtn');
const enableNote = document.getElementById('enableNote');
const docText = document.getElementById('docText');
const analyzeBtn = document.getElementById('analyzeBtn');

function row(id, label, state, detail) {
  let li = document.getElementById(id);
  if (!li) {
    li = document.createElement('li');
    li.id = id;
    checksEl.appendChild(li);
  }
  const mark = state === 'ok' ? '✓' : state === 'fail' ? '!' : '…';
  li.innerHTML = '';
  const dot = document.createElement('span');
  dot.className = `dot ${state}`;
  dot.textContent = mark;
  const body = document.createElement('span');
  body.innerHTML = `<b></b><small></small>`;
  body.querySelector('b').textContent = label;
  body.querySelector('small').textContent = detail;
  li.append(dot, body);
}

async function deviceAvailability() {
  if (!('LanguageModel' in self)) return 'no-api';
  try {
    return await LanguageModel.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
  } catch {
    return 'unavailable';
  }
}

async function refreshChecks() {
  row('c-chrome', 'Chrome with Side Panel + Prompt API', 'ok', 'Side Panel needs Chrome 114+; the Prompt API in extensions needs Chrome 138+ (web: 148+). You are running this panel, so Side Panel works.');
  const hasLm = 'LanguageModel' in self;
  const avail = await deviceAvailability();
  row('c-nano', 'Gemini Nano on this device', hasLm && avail === 'available' ? 'ok' : hasLm ? 'warn' : 'fail',
    !hasLm ? 'No LanguageModel API. Use Basic protection (local rules only).' : avail === 'available' ? 'Model downloaded and ready. Private steps can run on-device.' : `Model status: ${avail}. Click Enable private mode with a real click to download it.`);
  enableBtn.hidden = !(hasLm && (avail === 'downloadable' || avail === 'downloading'));
  enableNote.hidden = enableBtn.hidden;
  const cores = navigator.hardwareConcurrency || 0;
  row('c-hw', 'Hardware headroom (hint only)', cores >= 4 ? 'ok' : 'warn', `${cores || 'unknown'} CPU cores reported${navigator.deviceMemory ? `, ~${navigator.deviceMemory} GB RAM reported (capped)` : ''}. Google asks for 22 GB free, plus >4 GB VRAM or 16 GB RAM + 4 cores.`);
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    const freeGb = est.quota ? Math.round(est.quota / 1e9) : 0;
    row('c-disk', 'Space for the one-time model download', freeGb >= 22 ? 'ok' : 'warn', est.quota ? `About ${freeGb} GB storage quota reported for this profile.` : 'Storage estimate unavailable.');
  }
  if (hasLm && avail !== 'available') {
    row('c-fix', 'If the download fails instantly ("Update error")', 'warn', 'Known fixes on Windows: enable chrome://flags/#gemma4-for-built-in-ai, free at least ~5 GB in %TEMP% (Chrome checks 2x the package size there, not on the profile drive), and relaunch Chrome with TEMP/TMP pointed at a roomy drive. On older GPUs, the CPU backend flags OnDeviceModelForceCpuBackend,OnDeviceModelCpuBackend avoid shader crashes.');
  }
  const wired = typeof window.__envoyExtension?.analyze === 'function';
  row('c-engine', 'Envoy engine (Firebase AI Logic hybrid inference)', wired ? 'ok' : 'warn', wired ? 'Engine wired.' : 'Not wired yet — integration step. No cloud call is made from this scaffold.');
  pill.textContent = avail === 'available' ? 'Private mode on · Gemini Nano ready' : hasLm ? 'Basic protection' : 'Basic protection · no on-device model';
  pill.classList.toggle('ok', avail === 'available');
  analyzeBtn.disabled = !(wired && docText.value.trim());
  return avail;
}

// Real user gesture required by Chrome when the model is downloadable.
enableBtn.addEventListener('click', async () => {
  enableBtn.disabled = true;
  try {
    const session = await LanguageModel.create({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      monitor(m) { m.addEventListener('downloadprogress', (e) => { pill.textContent = `Downloading on-device model ${Math.round(e.loaded * 100)}%`; }); },
    });
    session.destroy();
  } catch (e) {
    pill.textContent = `Enable failed: ${e.name}`;
  } finally {
    enableBtn.disabled = false;
    void refreshChecks();
  }
});

docText.addEventListener('input', () => void refreshChecks());
// Chrome can purge or hot-swap the model under disk pressure: re-check whenever the panel regains focus.
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshChecks(); });

chrome.storage?.session.get('envoyPendingSelection').then((v) => {
  const text = v?.envoyPendingSelection;
  if (text) {
    docText.value = text;
    chrome.storage.session.remove('envoyPendingSelection');
    void refreshChecks();
  }
}).catch(() => {});

void refreshChecks();

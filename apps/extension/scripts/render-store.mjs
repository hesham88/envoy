/* global console, process, Buffer, WebSocket, fetch, setTimeout */
// Store assets rendered from the REAL extension UI (no mockups), via Chrome DevTools.
// Prereq: Chrome with --remote-debugging-port=9335 --enable-unsafe-extension-debugging
// and the extension built (npm run build -w @envoy/extension).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = 'http://localhost:9335';
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'store');
mkdirSync(outDir, { recursive: true });

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, send };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const version = await fetch(`${base}/json/version`).then((r) => r.json());
const browser = await connect(version.webSocketDebuggerUrl);
const load = await browser.send('Extensions.loadUnpacked', { path: join(dirname(fileURLToPath(import.meta.url)), '..', 'dist') });
const extId = load.result?.id;
if (!extId) { console.error('extension failed to load', JSON.stringify(load)); process.exit(1); }

async function shot(name, url, width, height, waitMs = 3500) {
  const t = await fetch(`${base}/json/new?${url}`, { method: 'PUT' }).then((r) => r.json());
  const page = await connect(t.webSocketDebuggerUrl);
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.enable');
  await sleep(waitMs);
  const cap = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, name), Buffer.from(cap.result.data, 'base64'));
  page.ws.close();
  console.log('wrote', name);
}

await shot('screenshot-1-sidepanel.png', `chrome-extension://${extId}/sidepanel.html`, 1280, 800, 5000);
await shot('screenshot-2-popup.png', `chrome-extension://${extId}/popup.html`, 1280, 800);
await shot('promo-tile-440x280.png', `chrome-extension://${extId}/sidepanel.html`, 440, 280);
await shot('marquee-1400x560.png', `chrome-extension://${extId}/sidepanel.html`, 1400, 560);
browser.ws.close();
console.log('store assets in', outDir);

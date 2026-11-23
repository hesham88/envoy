/* global console, process, URL, window, document */ // window/document: inside page callbacks
/**
 * Chrome Web Store assets, rendered from the REAL built extension (no mockups):
 * the built content script on a stand-in chat page (store/demo-page.html), and the built side panel
 * and popup with a stubbed chrome.* API. Composites use ffmpeg.
 *
 * Usage (from the repo root, after `npm run build -w @envoy/extension`):
 *   node apps/extension/scripts/render-store.mjs
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(EXT, '../..');
const OUT = join(EXT, 'store');
const TMP = join(OUT, '.tmp');
mkdirSync(TMP, { recursive: true });

// Static server: /store/*, /fonts/* and /brand/* map to source folders; everything else to dist/.
const ROOTS = [
  ['store/', join(EXT, 'store')],
  ['fonts/', join(REPO, 'node_modules/@fontsource-variable/fraunces/files')],
  ['brand/', join(REPO, 'docs/img/brand')],
  ['', join(EXT, 'dist')],
];
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/');
  if (path.includes('..')) return void res.writeHead(403).end();
  const [prefix, root] = ROOTS.find(([p]) => path.startsWith(p));
  try {
    const body = await readFile(join(root, path.slice(prefix.length)));
    res
      .writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(5199, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:5199';

const panelStub = () => {
  const noop = () => {};
  const session = {
    envoyPendingSelection:
      'Lease summary. Tenant Mona Adel (mona.adel@example.com, +20 100 555 0192) pays EGP 8,500 a month to her landlord Karim Fathy. Clause 7: the rent may rise once a year by no more than 10%, with 60 days notice.',
  };
  window.chrome = {
    storage: {
      local: { get: async () => ({ envoyRules: [], envoyOnboarded: true }), set: async () => {} },
      session: {
        get: async () => ({ ...session }),
        set: async () => {},
        remove: async (k) => void delete session[k],
      },
      onChanged: { addListener: noop, removeListener: noop },
    },
    runtime: {
      sendMessage: async () => ({ ok: true }),
      onMessage: { addListener: noop },
      getURL: (p) => p,
      id: 'store',
      getManifest: () => ({}),
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://chat.example.com/', windowId: 1 }],
      create: async () => {},
    },
    permissions: { contains: async () => true, request: async () => true },
    scripting: {
      getRegisteredContentScripts: async () => [
        { id: 'envoy', matches: ['https://chat.example.com/*'] },
      ],
      registerContentScripts: async () => {},
      unregisterContentScripts: async () => {},
    },
    sidePanel: { open: async () => {} },
  };
};

const ff = (...args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const shot = async (url, w, h, file, act, init) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('page error', file, e.message.slice(0, 160)));
  if (init) await page.addInitScript(init);
  await page.goto(`${BASE}/${url}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  if (act) await act(page);
  await page.screenshot({ path: file });
  await page.close();
};

// 1 + 2: the text box with protection on (found), then replaced (protected).
const focusAndOn = async (p) => {
  await p.focus('#t');
  await p.locator('#envoy-field-ui .chip').click();
  await p.waitForTimeout(900);
};
await shot('store/demo-page.html', 1280, 800, join(OUT, 'screenshot-1-text-box.png'), focusAndOn);
await shot('store/demo-page.html', 1280, 800, join(OUT, 'screenshot-2-replaced.png'), async (p) => {
  await focusAndOn(p);
  await p.locator('#envoy-field-ui .btn.primary').click();
  await p.waitForTimeout(1400);
});

// 3 + 4: the side panel next to the page: the selection arrives; then a turn with the recorder and approval.
await shot('store/demo-page.html', 860, 800, join(TMP, 'page.png'));
await shot('sidepanel.html', 420, 800, join(TMP, 'panel-start.png'), null, panelStub);
await shot(
  'sidepanel.html',
  420,
  800,
  join(TMP, 'panel-turn.png'),
  async (p) => {
    await p.getByLabel('Message Envoy').fill('Can my landlord raise the rent 20% this year?');
    await p.getByRole('button', { name: 'Send' }).click();
    await p
      .getByRole('button', { name: /Continue in Envoy on the web|Approve and send/ })
      .waitFor({ timeout: 30000 });
    await p
      .getByText('What the cloud will see')
      .first()
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(600);
  },
  panelStub,
);
ff(
  '-i',
  join(TMP, 'page.png'),
  '-i',
  join(TMP, 'panel-start.png'),
  '-filter_complex',
  'hstack=inputs=2',
  join(OUT, 'screenshot-3-side-panel.png'),
);
ff(
  '-i',
  join(TMP, 'page.png'),
  '-i',
  join(TMP, 'panel-turn.png'),
  '-filter_complex',
  'hstack=inputs=2',
  join(OUT, 'screenshot-4-approval.png'),
);

// 5: the popup over the page.
await shot('store/demo-page.html', 1280, 800, join(TMP, 'page-wide.png'));
await shot('popup.html', 340, 470, join(TMP, 'popup.png'), null, panelStub);
ff(
  '-i',
  join(TMP, 'page-wide.png'),
  '-i',
  join(TMP, 'popup.png'),
  '-filter_complex',
  '[1]pad=iw+2:ih+2:1:1:color=0x2a2852[p];[0][p]overlay=W-w-24:12',
  join(OUT, 'screenshot-5-popup.png'),
);

// Promo tile and marquee.
const sizes = (h, p, t) => (page) =>
  page.evaluate(
    ([a, b, c]) => {
      document.body.style.setProperty('--h', a);
      document.body.style.setProperty('--p', b);
      document.body.style.setProperty('--t', c);
    },
    [h, p, t],
  );
await shot('store/promo.html', 440, 280, join(OUT, 'promo-tile-440x280.png'), async (page) => {
  await sizes('30px', '12px', '11px')(page);
  await page.evaluate(() => document.querySelector('.sub')?.remove());
});
await shot(
  'store/promo.html',
  1400,
  560,
  join(OUT, 'marquee-1400x560.png'),
  sizes('86px', '26px', '18px'),
);

await browser.close();
server.close();
rmSync(TMP, { recursive: true, force: true });
console.log('store assets in', OUT);
process.exit(0);

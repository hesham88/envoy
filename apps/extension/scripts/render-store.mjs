/* global console, process, URL, window, document */ // window/document: inside page callbacks
/**
 * Chrome Web Store assets, rendered from the REAL built extension (no mockups):
 * the built content script on a stand-in chat page (store/demo-page.html), and the built side panel
 * and popup with a stubbed chrome.* API. Composites use ffmpeg.
 *
 * Usage (from the repo root, after `npm run build -w @envoy/extension`):
 *   node apps/extension/scripts/render-store.mjs
 */
import '../../../scripts/lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
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
  await page.goto(/^https?:/.test(url) ? url : `${BASE}/${url}`, { waitUntil: 'load' });
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

// 3: Upload with Envoy: a (fictional) ID-card photo, a black box drawn over the ID number.
await shot('store/demo-page.html', 1280, 800, join(OUT, 'screenshot-3-upload.png'), async (p) => {
  await p.focus('#t');
  await p.waitForTimeout(400);
  await p.locator('#envoy-field-ui .up-btn').click();
  await p
    .locator('#envoy-field-ui .up-card input[type=file]')
    .setInputFiles(join(OUT, 'sample-id-card.jpg'));
  await p.locator('#envoy-field-ui .up-card canvas').waitFor();
  await p.waitForTimeout(800);
  const c = await p.locator('#envoy-field-ui .up-card canvas').boundingBox();
  // Over the ID number (the card's second detail line).
  await p.mouse.move(c.x + c.width * 0.37, c.y + c.height * 0.41);
  await p.mouse.down();
  await p.mouse.move(c.x + c.width * 0.64, c.y + c.height * 0.49, { steps: 10 });
  await p.mouse.up();
  await p.locator('#envoy-field-ui .up-card button.primary').waitFor({ timeout: 20000 });
  await p.waitForTimeout(600);
});

// 4: the side panel next to the page: a turn with the recorder and the approval card.
await shot('store/demo-page.html', 860, 800, join(TMP, 'page.png'));
// The release side panel embeds the hosted Envoy chat (apps/extension/src/App.tsx), so that is
// what is shown: the live app at side-panel size, the sample lease, waiting for approval.
await shot(
  'https://envoy-hybrid-ai.web.app/app?embed=extension&sample=lease',
  420,
  800,
  join(TMP, 'panel-turn.png'),
  async (p) => {
    await p.locator('#envoy-composer').click();
    await p.keyboard.press('End');
    await p.keyboard.press('Enter');
    await p.getByRole('button', { name: 'Approve and send' }).last().waitFor({ timeout: 60000 });
    await p
      .getByText('What the cloud will see')
      .last()
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(800);
  },
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
await shot('popup.html', 340, 352, join(TMP, 'popup.png'), null, panelStub);
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

// The store wants 24-bit PNG, no alpha: flatten every asset.
for (const f of [
  'screenshot-1-text-box.png',
  'screenshot-2-replaced.png',
  'screenshot-3-upload.png',
  'screenshot-4-approval.png',
  'screenshot-5-popup.png',
  'promo-tile-440x280.png',
  'marquee-1400x560.png',
]) {
  ff('-i', join(OUT, f), '-pix_fmt', 'rgb24', join(TMP, f));
  ff('-i', join(TMP, f), '-c', 'copy', join(OUT, f));
}

await browser.close();
server.close();
rmSync(TMP, { recursive: true, force: true });
console.log('store assets in', OUT);
process.exit(0);

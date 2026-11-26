/* global console, process, URL, document, setTimeout, Buffer */ // document: inside page callbacks
/**
 * Records the two v7 scenes that are not part of the private take (see record-private.mjs):
 *  - n04-samples: the app's one-click sample cards, in the model Chrome (CDP 9333), so the sidebar
 *    shows the real on-device status. Needs the dev server on 5173.
 *  - n15-photo: the REAL extension (built dist, loaded unpacked in a headless Chrome, as in the E2E)
 *    on a neutral stand-in chat page; the fictional lab-bill photo is read on the device and every
 *    private detail gets a mask before anything is pressed; then one mask is pressed to keep the
 *    email visible.
 *
 * Usage: node video/record-v7.mjs [--only n04-samples|n15-photo]
 * Output: video/out/raw/<id>.mp4 (1600x900) + <id>.marks.json
 */
import { chromium } from 'playwright-core';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const RAW = join(HERE, 'out', 'raw');
const W = 1600;
const H = 900;
mkdirSync(RAW, { recursive: true });
const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chrome's screencast, encoded at a constant 30 fps (each frame held until the next). */
async function screencast(page, id, run) {
  const dir = join(RAW, `.${id}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let stopped = false;
  cdp.on('Page.screencastFrame', (f) => {
    if (stopped) return; // frames still in flight after stop: the folder is about to go
    const name = `f${String(frames.length).padStart(5, '0')}.jpg`;
    writeFileSync(join(dir, name), Buffer.from(f.data, 'base64'));
    frames.push({ name, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: W,
    maxHeight: H,
  });
  const start = Date.now() / 1000;
  const marks = [];
  await run((name) => marks.push({ name, at: Date.now() / 1000 - start }));
  stopped = true;
  await cdp.send('Page.stopScreencast').catch(() => {});
  await cdp.detach().catch(() => {});
  const end = Date.now() / 1000;
  const kept = frames.filter((f, i) => f.t >= start || frames[i + 1]?.t > start);
  const lines = [];
  kept.forEach((f, i) => {
    const next = kept[i + 1]?.t ?? end;
    lines.push(
      `file '${f.name}'`,
      `duration ${Math.max(0.001, next - Math.max(f.t, start)).toFixed(4)}`,
    );
  });
  lines.push(`file '${kept[kept.length - 1].name}'`);
  writeFileSync(join(dir, 'list.txt'), lines.join('\n'));
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    join(dir, 'list.txt'),
    '-vf',
    `fps=30,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0b0a1f,format=yuv420p`,
    '-c:v',
    'libx264',
    '-crf',
    '16',
    '-preset',
    'medium',
    join(RAW, `${id}.mp4`),
  ]);
  rmSync(dir, { recursive: true, force: true });
  writeFileSync(join(RAW, `${id}.marks.json`), JSON.stringify(marks, null, 1));
  console.log(`${id}: ${(end - start).toFixed(1)} s, ${kept.length} frames`);
}

// ---------- n04-samples: the sample cards, in the model Chrome ----------
if (!only || only === 'n04-samples') {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const page = await browser.contexts()[0].newPage();
  await page.setViewportSize({ width: W, height: H });
  await page.goto('http://localhost:5173/app', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.getByText('On-device ready').first().waitFor({ timeout: 60000 });
  await wait(1200);
  // Start at the top: the heading and the lease card.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('*'))
      if (el.scrollHeight > el.clientHeight + 40) el.scrollTop = 0;
  });
  await wait(600);
  const glide = (name) =>
    page
      .getByRole('button', { name })
      .first()
      .evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  const point = async (name) => {
    const b = await page.getByRole('button', { name }).first().boundingBox();
    if (b) await page.mouse.move(b.x + b.width * 0.4, b.y + b.height / 2, { steps: 18 });
  };
  await screencast(page, 'n04-samples', async () => {
    await wait(1800);
    // The lease: one question for the device, one for the cloud.
    await point(/What is my monthly rent/);
    await wait(1500);
    await point(/raise the rent 20%/);
    await wait(1500);
    // Down to the lab card: the same two kinds of question.
    await glide(/HbA1c/);
    await wait(1200);
    await point(/HbA1c/);
    await wait(1400);
    await point(/insurance covers 80%/);
    await wait(1800);
  });
  await page.close();
  await browser.close();
}

// ---------- n15-photo: the real extension masks a photo of a lab bill ----------
if (!only || only === 'n15-photo') {
  const PORT = 5196;
  const CDP = 9338;
  const WORK = join(tmpdir(), `envoy-film-${Date.now()}`);
  const EXT = join(WORK, 'ext');
  cpSync(join(REPO, 'apps/extension/dist'), EXT, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
  manifest.content_scripts = [
    { matches: [`http://127.0.0.1:${PORT}/*`], js: ['content.js'], run_at: 'document_idle' },
  ];
  manifest.host_permissions = [`http://127.0.0.1:${PORT}/*`];
  writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  // The stand-in chat page, without its chrome.* stub: here the real extension runs.
  const standIn = readFileSync(join(HERE, 'scenes/stand-in.html'), 'utf8')
    .replace(/<script>\s*window\.chrome = [\s\S]*?<\/script>/, '')
    .replace('<script src="/content.js"></script>', '')
    .replace('.compose { margin-top: 300px;', '.compose { margin-top: 0;')
    // Compact page for the photo: the upload card opens below the composer and needs the room.
    .replace(
      '</style>',
      '.msg { display: none; } .wrap { padding: 18px 30px; } textarea { height: 64px; padding-bottom: 44px; } </style>',
    );
  const FONTS = join(REPO, 'node_modules/@fontsource/ibm-plex-sans/files');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path.startsWith('/fonts-plex/')) {
      try {
        return void res
          .writeHead(200, { 'content-type': 'font/woff2' })
          .end(readFileSync(join(FONTS, path.slice('/fonts-plex/'.length).replace(/[\\/]/g, ''))));
      } catch {
        return void res.writeHead(404).end();
      }
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end(standIn);
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const chrome = spawn(
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    [
      '--headless=new',
      `--remote-debugging-port=${CDP}`,
      '--enable-unsafe-extension-debugging',
      `--user-data-dir=${join(WORK, 'profile')}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let browser;
  for (let i = 0; i < 40 && !browser; i++) {
    await wait(500);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`).catch(() => undefined);
  }
  try {
    const bcdp = await browser.newBrowserCDPSession();
    await bcdp.send('Extensions.loadUnpacked', { path: EXT });
    const page = await browser.contexts()[0].newPage();
    // A 1100 px wide page at 1.45x: the frames are still 1600x900, and the photo card reads
    // larger on screen (at 1600 CSS px it took under half the frame).
    const pcdp = await page.context().newCDPSession(page);
    await pcdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1100,
      height: 619,
      deviceScaleFactor: W / 1100,
      mobile: false,
    });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.evaluate(() => document.fonts.ready);
    await wait(1500);
    const ui = (sel) => page.locator(`#envoy-field-ui ${sel}`);
    const photo = join(REPO, 'apps/web/public/samples/lab-bill.webp');
    await screencast(page, 'n15-photo', async (mark) => {
      await wait(1200);
      await page.locator('#plus').click();
      await wait(1300);
      await ui('.up-btn').click();
      await wait(900);
      mark('photo-chosen');
      await ui('.up-card input[type=file]').setInputFiles(photo);
      await ui('.up-card .up-mask').first().waitFor({ timeout: 60000 });
      mark('masks');
      await ui('.up-card button.primary').waitFor({ timeout: 45000 });
      await wait(3200);
      // Keep the email visible: press its mask.
      await ui('.up-card .up-mask').filter({ hasText: 'Email' }).first().click();
      mark('kept');
      await wait(2800);
      await ui('.up-card button.primary').scrollIntoViewIfNeeded();
      await wait(2600);
    });
  } finally {
    await browser?.close().catch(() => undefined);
    chrome.kill();
    server.close();
    setTimeout(() => rmSync(WORK, { recursive: true, force: true }), 800);
  }
}
console.log('footage in', RAW);
process.exit(0);

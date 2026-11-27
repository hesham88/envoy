/* global console, process, URL, document, window, setTimeout, DataTransfer, ClipboardEvent, Event, Buffer */ // page callbacks
/**
 * Records the v8 scenes that are not in the private take (record-private.mjs) or on Android
 * (record-android.mjs). Everything runs the real product:
 *  - n13-firebase: the live site's "Built on Firebase, on purpose" section, then the app's About
 *    dialog with the live Firebase stack (App Check, Remote Config fetched, the models).
 *  - n14-intercept: the REAL extension (built dist, loaded unpacked) on the neutral stand-in chat
 *    page: a paste with private details is flagged, Enter is held once, Replace swaps in tags.
 *  - n15-badge: Upload with Envoy on the fictional staff badge: the face, name, email and phone are
 *    boxed on the device before anything is pressed.
 *  - n16r-receipt: the live app (Basic protection in this headless Chrome) answers the lease
 *    question; "Save signed receipt" downloads it, and scripts/verify-receipt.mjs checks it; its
 *    real output is shown.
 *
 * Usage: node video/record-v8.mjs [--only n13-firebase|n14-intercept|n15-badge|n16r-receipt]
 * Output: video/out/raw/<id>.mp4 (1600x900) + <id>.marks.json
 */
import { removeScratch, scratchDir, stopChrome } from '../scripts/lib/scratch.mjs';
import { chromium } from 'playwright-core';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const RAW = join(HERE, 'out', 'raw');
const W = 1600;
const H = 900;
const LIVE = 'https://envoy-hybrid-ai.web.app';
mkdirSync(RAW, { recursive: true });
const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null;
const want = (id) => !only || only === id;
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
    if (stopped) return;
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

/** A CSS viewport of `cssW` px rendered into 1600x900 frames (larger text on screen). */
async function zoom(page, cssW) {
  const pcdp = await page.context().newCDPSession(page);
  await pcdp.send('Emulation.setDeviceMetricsOverride', {
    width: cssW,
    height: Math.round((cssW * H) / W),
    deviceScaleFactor: W / cssW,
    mobile: false,
  });
}
const glideTo = (loc) =>
  loc.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));

// ---------- the live site: Firebase stack and the signed receipt ----------
if (want('n13-firebase') || want('n16r-receipt')) {
  const WORK = scratchDir('envoy-film');
  // A visible window, as in scripts/smoke-hosted.mjs: App Check (reCAPTCHA Enterprise) scores a
  // headless browser as automated and the cloud refuses it (the app says so, in plain words).
  const browser = await chromium.launchPersistentContext(join(WORK, 'profile'), {
    channel: 'chrome',
    headless: false,
    acceptDownloads: true,
    viewport: { width: W, height: H },
  });
  try {
    const ctx = browser;
    if (want('n13-firebase')) {
      const page = await ctx.newPage();
      await zoom(page, 1280);
      await page.goto(LIVE, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#firebase').waitFor();
      await page.evaluate(() => {
        document.getElementById('firebase').scrollIntoView({ block: 'start' });
        window.scrollBy(0, -400);
      });
      await wait(1200);
      await screencast(page, 'n13-firebase', async (mark) => {
        await wait(600);
        await glideTo(page.locator('#firebase'));
        await wait(4200);
        mark('about');
        await page.goto(`${LIVE}/app`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await wait(2500); // Remote Config and App Check settle
        await page.getByRole('button', { name: 'How Envoy protects you' }).first().click();
        const table = page.getByText('The Firebase stack, on purpose');
        await table.waitFor({ timeout: 15000 });
        await wait(600);
        await table.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        await wait(5200);
      });
      await page.close();
    }
    if (want('n16r-receipt')) {
      const page = await ctx.newPage();
      await zoom(page, 1280);
      await page.goto(`${LIVE}/app`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page
        .getByRole('button', { name: /Can my landlord raise the rent 20% this year\?/ })
        .click();
      await page.getByRole('button', { name: 'Approve and send' }).click({ timeout: 60000 });
      const save = page.getByRole('button', { name: 'Save signed receipt' });
      await save.waitFor({ timeout: 90000 });
      await save.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await wait(1500);
      let output = '';
      let fileName = '';
      await screencast(page, 'n16r-receipt', async (mark) => {
        await wait(1400);
        const box = await save.boundingBox();
        if (box)
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 16 });
        await wait(400);
        const [download] = await Promise.all([page.waitForEvent('download'), save.click()]);
        fileName = download.suggestedFilename();
        const local = join(WORK, fileName);
        await download.saveAs(local);
        mark('saved');
        output = execFileSync('node', [join(REPO, 'scripts/verify-receipt.mjs'), local], {
          encoding: 'utf8',
        });
        await wait(1600);
        // The script's real output, typed into a terminal card.
        await page.setContent(terminalPage());
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(
          async ([cmd, out]) => {
            const pre = document.getElementById('out');
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            pre.textContent = '$ ';
            for (const ch of cmd) {
              pre.textContent += ch;
              await sleep(22);
            }
            await sleep(500);
            pre.textContent += '\n';
            for (const line of out.split('\n')) {
              pre.textContent += line + '\n';
              await sleep(160);
            }
          },
          [`node scripts/verify-receipt.mjs ${fileName}`, onScreen(output)],
        );
        mark('verified');
        await wait(3500);
      });
      console.log('verify output:\n' + output);
      await page.close();
    }
  } finally {
    await browser.close();
    removeScratch(WORK);
  }
}

/** The script's summary, then the first lines of the excerpt it checked (the rest is elided). */
function onScreen(output) {
  const [summary, ...sent] = output.trimEnd().split('\n\n--- ');
  if (!sent.length) return summary;
  const lines = `--- ${sent[0]}`.split('\n');
  return `${summary}\n\n${lines.slice(0, 5).join('\n')}${lines.length > 5 ? '\n…' : ''}`;
}

function terminalPage() {
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#0b0a1f;}
  .term{position:absolute;inset:60px 70px;border:1px solid #34314a;border-radius:18px;background:#12111f;padding:26px 30px;box-shadow:0 20px 60px #0008}
  .bar{display:flex;gap:8px;margin-bottom:18px}.bar i{width:12px;height:12px;border-radius:50%;background:#34314a;display:block}
  pre{margin:0;color:#ece9ff;font:500 17px/1.6 "IBM Plex Mono",Consolas,monospace;white-space:pre-wrap}
  </style><div class="term"><div class="bar"><i></i><i></i><i></i></div><pre id="out"></pre></div>`;
}

// ---------- the extension on the stand-in chat page ----------
if (want('n14-intercept') || want('n15-badge')) {
  const PORT = 5196;
  const CDP = 9338;
  const WORK = scratchDir('envoy-film');
  const EXT = join(WORK, 'ext');
  cpSync(join(REPO, 'apps/extension/dist'), EXT, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
  manifest.content_scripts = [
    { matches: [`http://127.0.0.1:${PORT}/*`], js: ['content.js'], run_at: 'document_idle' },
  ];
  manifest.host_permissions = [`http://127.0.0.1:${PORT}/*`];
  writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const base = readFileSync(join(HERE, 'scenes/stand-in.html'), 'utf8')
    .replace(/<script>\s*window\.chrome = [\s\S]*?<\/script>/, '')
    .replace('<script src="/content.js"></script>', '');
  const pages = {
    '/chat': base,
    '/upload': base
      .replace('.compose { margin-top: 300px;', '.compose { margin-top: 0;')
      .replace(
        '</style>',
        '.msg { display: none; } .wrap { padding: 18px 30px; } textarea { height: 64px; padding-bottom: 44px; } </style>',
      ),
  };
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
    res.writeHead(200, { 'content-type': 'text/html' }).end(pages[path] ?? pages['/chat']);
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
  let bcdp;
  try {
    bcdp = await browser.newBrowserCDPSession();
    await bcdp.send('Extensions.loadUnpacked', { path: EXT });
    const ctx = browser.contexts()[0];

    if (want('n14-intercept')) {
      const page = await ctx.newPage();
      await zoom(page, 1280);
      await page.goto(`http://127.0.0.1:${PORT}/chat`);
      await page.evaluate(() => document.fonts.ready);
      await wait(1500);
      const ui = (sel) => page.locator(`#envoy-field-ui ${sel}`);
      // Fictional: the lease's tenant, her email and IBAN.
      const text =
        'Hi, I am Mona Adel (mona.adel@example.com). My landlord wants the deposit sent to EG380019000500000000263180002. Is that normal?';
      await screencast(page, 'n14-intercept', async (mark) => {
        await wait(1000);
        await page.focus('#t');
        await wait(500);
        await page.evaluate((t) => {
          const ta = document.getElementById('t');
          const dt = new DataTransfer();
          dt.setData('text/plain', t);
          ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
          ta.value = t;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }, text);
        mark('pasted');
        await wait(2600);
        await page.keyboard.press('Enter');
        mark('held');
        await ui('.card').waitFor({ timeout: 10000 });
        await wait(3400);
        const replace = ui('.card button')
          .filter({ hasText: /^Replace/ })
          .first();
        const b = await replace.boundingBox();
        if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 });
        await wait(400);
        await replace.click();
        mark('replaced');
        await wait(3800);
      });
      console.log('field after Replace:', await page.inputValue('#t'));
      await page.close();
    }

    if (want('n15-badge')) {
      const page = await ctx.newPage();
      await zoom(page, 1100);
      await page.goto(`http://127.0.0.1:${PORT}/upload`);
      await page.evaluate(() => document.fonts.ready);
      await wait(1500);
      const ui = (sel) => page.locator(`#envoy-field-ui ${sel}`);
      const photo = join(REPO, 'apps/web/public/samples/staff-badge.webp');
      await screencast(page, 'n15-badge', async (mark) => {
        await wait(1000);
        await page.locator('#plus').click();
        await wait(1100);
        await ui('.up-btn').click();
        await wait(700);
        mark('photo-chosen');
        await ui('.up-card input[type=file]').setInputFiles(photo);
        await ui('.up-card .up-mask')
          .filter({ hasText: 'Face' })
          .first()
          .waitFor({ timeout: 90000 });
        mark('face');
        await ui('.up-card button.primary').waitFor({ timeout: 45000 });
        await wait(3000);
        // Down to "Sending re-encodes the image, which strips EXIF/GPS" and the send button.
        await ui('.up-card').evaluate((el) =>
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }),
        );
        await wait(3600);
      });
      await page.close();
    }
  } finally {
    await stopChrome(chrome, bcdp);
    await browser?.close().catch(() => undefined);
    server.close();
    removeScratch(WORK);
  }
}
console.log('footage in', RAW);
process.exit(0);

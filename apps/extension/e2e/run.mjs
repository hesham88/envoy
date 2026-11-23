/* global console, process, document, setTimeout, Buffer, getComputedStyle, createImageBitmap, OffscreenCanvas */
/**
 * End-to-end test of the REAL built extension in Chrome: the text-box widget (textarea and a rich
 * contenteditable editor), password fields left alone, Upload with Envoy for a text file, a photo
 * (EXIF gone, drawn boxes burned in) and a PDF (rebuilt without the raw values), and the side panel.
 *
 * The test copy of the extension is the release build with one change: a static content script
 * for the local test page, because Chrome's per-site permission prompt can't be clicked by a script.
 *
 * Usage (after `npm run build -w @envoy/extension`): node apps/extension/e2e/run.mjs
 */
import { chromium } from 'playwright-core';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(tmpdir(), `envoy-e2e-${Date.now()}`);
const TEST_EXT = join(WORK, 'ext');
const PROFILE = join(WORK, 'profile');
const PORT = 5197;
const CDP = 9337;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

// ---------- the test copy of the extension ----------
mkdirSync(WORK, { recursive: true });
cpSync(join(EXT, 'dist'), TEST_EXT, { recursive: true });
const manifest = JSON.parse(readFileSync(join(TEST_EXT, 'manifest.json'), 'utf8'));
manifest.content_scripts = [
  { matches: [`http://127.0.0.1:${PORT}/*`], js: ['content.js'], run_at: 'document_idle' },
];
manifest.host_permissions = [`http://127.0.0.1:${PORT}/*`];
writeFileSync(join(TEST_EXT, 'manifest.json'), JSON.stringify(manifest, null, 2));

// ---------- fixtures (fictional people) ----------
const RAW = {
  name: 'Mona Adel',
  email: 'mona.adel@example.com',
  iban: 'EG38 0019 0005 0000 0000 2631 8000 2',
  phone: '+20 100 555 0192',
};
const textDoc = `Tenant: ${RAW.name}\nEmail: ${RAW.email}\nPay rent to ${RAW.iban}.\nPhone ${RAW.phone}.`;

function pdfOf(lines) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = [
    'BT',
    '/F1 12 Tf',
    '72 720 Td',
    '16 TL',
    ...lines.map((l) => `(${esc(l)}) Tj T*`),
    'ET',
  ].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >> stream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function jpegWithExif() {
  const base = join(WORK, 'plain.jpg');
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x3a6ea5:s=200x120',
    '-frames:v',
    '1',
    base,
  ]);
  const jpg = readFileSync(base);
  // A minimal EXIF APP1 segment with a camera "Make" tag we can look for afterwards.
  const make = Buffer.from('EnvoyTestCam\0', 'latin1');
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write('II*\0', 0, 'latin1');
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x010f, 10);
  tiff.writeUInt16LE(2, 12);
  tiff.writeUInt32LE(make.length, 14);
  tiff.writeUInt32LE(tiff.length, 18);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, make]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    Buffer.from([(payload.length + 2) >> 8, (payload.length + 2) & 0xff]),
    payload,
  ]);
  return Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]);
}

const files = {
  'lease.txt': Buffer.from(textDoc),
  'lease.pdf': pdfOf([
    'Residential lease',
    `Tenant: ${RAW.name}`,
    `Email: ${RAW.email}`,
    `Account: ${RAW.iban}`,
  ]),
  'photo.jpg': jpegWithExif(),
};
for (const [n, b] of Object.entries(files)) writeFileSync(join(WORK, n), b);

// ---------- the test page ----------
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Test chat</title>
<style>body{font:15px system-ui;background:#f5f5f7;margin:0;padding:40px} .box{display:block;width:700px;margin:0 auto 28px} textarea{width:100%;height:110px;border:1px solid #ccc;border-radius:14px;padding:12px;font:15px system-ui} #rich{min-height:90px;border:1px solid #ccc;border-radius:14px;padding:12px;background:#fff}</style></head>
<body>
<div class="box" style="margin-top:300px"><label>Message <textarea id="ta"></textarea></label></div>
<div class="box"><div id="rich" contenteditable="true" role="textbox" aria-label="Rich editor"></div></div>
<div class="box"><label>Password <input id="pw" type="password"></label></div>
<div class="box"><label>Attach <input id="file" type="file"></label></div>
</body></html>`;
const EDITORS_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Editors</title>
<link href="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css" rel="stylesheet">
<style>body{font:15px system-ui;background:#f5f5f7;margin:0;padding:40px} .box{width:700px;margin:0 auto 28px;background:#fff} #pm .ProseMirror{min-height:90px;border:1px solid #ccc;border-radius:14px;padding:12px;outline:none} #quill{min-height:90px}</style></head>
<body>
<div class="box" style="margin-top:300px"><div id="quill"></div></div>
<div class="box"><div id="pm"></div></div>
<script src="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js"></script>
<script>window.quill = new Quill('#quill', { theme: 'snow' });</script>
<script type="module">
import { EditorState } from 'https://esm.sh/prosemirror-state@1';
import { EditorView } from 'https://esm.sh/prosemirror-view@1';
import { schema } from 'https://esm.sh/prosemirror-schema-basic@1';
import { keymap } from 'https://esm.sh/prosemirror-keymap@1';
import { baseKeymap } from 'https://esm.sh/prosemirror-commands@1';
window.pm = new EditorView(document.querySelector('#pm'), {
  state: EditorState.create({ schema, plugins: [keymap(baseKeymap)] }),
});
</script>
</body></html>`;
const server = createServer((req, res) =>
  res
    .writeHead(200, { 'content-type': 'text/html' })
    .end(req.url?.startsWith('/editors') ? EDITORS_PAGE : PAGE),
);
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// ---------- Chrome with the extension ----------
const chromeExe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(
  chromeExe,
  [
    '--headless=new',
    `--remote-debugging-port=${CDP}`,
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
let browser;
for (let i = 0; i < 40 && !browser; i++) {
  await new Promise((r) => setTimeout(r, 500));
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`).catch(() => undefined);
}
const cdp = await browser.newBrowserCDPSession();
const { id: extId } = await cdp.send('Extensions.loadUnpacked', { path: TEST_EXT });
check('extension loads with the pinned ID', extId === 'ekmjefnebmjbeahkadaheapbgpgkabkd', extId);
const ctx = browser.contexts()[0];

try {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(1500);
  const ui = (sel) => page.locator(`#envoy-field-ui ${sel}`);

  // --- textarea ---
  await page.fill('#ta', `Hi, I'm ${RAW.name}, ${RAW.email}, IBAN ${RAW.iban}. Draft a reply?`);
  await page.focus('#ta');
  await page.waitForTimeout(300);
  check(
    'textarea: chip appears, off by default',
    (await ui('.chip').innerText()).includes('Envoy off'),
  );
  const ringOffShown = await ui('.ring').evaluate((el) => getComputedStyle(el).display !== 'none');
  check('textarea: nothing is drawn while off', !ringOffShown);
  await ui('.chip').click();
  await page.waitForTimeout(700);
  const cardTitle = await ui('.card-title').innerText();
  check(
    'textarea: findings card lists the details',
    /private details? found/.test(cardTitle),
    cardTitle,
  );
  check(
    'textarea: ring is on',
    await ui('.ring').evaluate((el) => getComputedStyle(el).display !== 'none'),
  );
  const cardBox = await ui('.card').boundingBox();
  const fieldBox = await page.locator('#ta').boundingBox();
  const overlap =
    cardBox &&
    fieldBox &&
    !(
      cardBox.x + cardBox.width <= fieldBox.x ||
      cardBox.x >= fieldBox.x + fieldBox.width ||
      cardBox.y + cardBox.height <= fieldBox.y ||
      cardBox.y >= fieldBox.y + fieldBox.height
    );
  check('textarea: card does not cover the field', !overlap);
  await ui('.btn.primary').click();
  await page.waitForTimeout(800);
  const taValue = await page.inputValue('#ta');
  check(
    'textarea: Replace puts tags in the field',
    taValue.includes('[EMAIL]') && !taValue.includes(RAW.email) && !taValue.includes('EG38'),
    taValue,
  );
  check('textarea: chip says Protected', (await ui('.chip').innerText()).includes('Protected'));
  await page.locator('#envoy-field-ui .btn', { hasText: 'Undo replace' }).click();
  await page.waitForTimeout(300);
  check('textarea: Undo restores the text', (await page.inputValue('#ta')).includes(RAW.email));

  // The on-device check always reports back. Headless Chrome has no model, so it must say why,
  // and offer the private-mode guide, instead of silently leaving the card as it was.
  await page.locator('#envoy-field-ui .btn', { hasText: 'Check with on-device AI' }).click();
  const status = ui('.deep-status');
  const shown = await status.waitFor({ timeout: 20000 }).then(
    () => true,
    () => false,
  );
  const statusText = shown ? await status.innerText() : '';
  check(
    'on-device check: the result is always shown (here: why it could not run)',
    shown && /couldn't run|nothing more found|found \d+ more/.test(statusText),
    statusText.replace(/\s+/g, ' ').slice(0, 140),
  );
  check(
    'on-device check: offers the private-mode guide when it cannot run',
    !/couldn't run/.test(statusText) ||
      (await status.getByRole('button', { name: 'How to turn on private mode' }).count()) === 1,
  );

  // Close the card the way a person would (the × button), then move on.
  await ui('.icon-btn').click();
  await page.waitForTimeout(200);

  // --- rich editor (a plain contenteditable) ---
  await page.click('#rich');
  await page.keyboard.type(`Send ${RAW.email} the account ${RAW.iban}`);
  await page.waitForTimeout(300);
  await ui('.chip').click();
  await page.waitForTimeout(700);
  await ui('.btn.primary').click();
  await page.waitForTimeout(800);
  const rich = await page.locator('#rich').innerText();
  check(
    'rich editor: Replace puts tags in the editor',
    rich.includes('[EMAIL]') && !rich.includes(RAW.email),
    rich,
  );
  await ui('.icon-btn').click();
  await page.waitForTimeout(200);

  // --- real editor libraries: ProseMirror (used by many AI chat sites) and Quill ---
  // The check reads each editor's own document model, which is what a site sends, not just the screen.
  const ed = await ctx.newPage();
  await ed.setViewportSize({ width: 1280, height: 900 });
  await ed.goto(`http://127.0.0.1:${PORT}/editors`);
  const editorsReady = await ed
    .waitForFunction(() => globalThis.quill && globalThis.pm, null, { timeout: 30000 })
    .then(
      () => true,
      () => false,
    );
  check('editor libraries load (ProseMirror, Quill)', editorsReady);
  if (editorsReady) {
    const eui = (sel) => ed.locator(`#envoy-field-ui ${sel}`);
    for (const [name, sel, read] of [
      ['Quill', '#quill .ql-editor', () => globalThis.quill.getText()],
      ['ProseMirror', '#pm .ProseMirror', () => globalThis.pm.state.doc.textContent],
    ]) {
      await ed.click(sel);
      await ed.keyboard.type(`Email ${RAW.email} about IBAN ${RAW.iban}`);
      await ed.waitForTimeout(400);
      await eui('.chip').click();
      await ed.waitForTimeout(700);
      await eui('.btn.primary').click();
      await ed.waitForTimeout(800);
      const model = await ed.evaluate(read);
      check(
        `${name}: Replace reaches the editor's own document`,
        model.includes('[EMAIL]') && !model.includes(RAW.email) && !model.includes('EG38'),
        model.trim(),
      );
      await eui('.icon-btn')
        .click()
        .catch(() => undefined);
      await ed.waitForTimeout(200);
    }
  }
  await ed.close();

  // --- password field is never touched ---
  await page.click('#pw');
  await page.waitForTimeout(300);
  check(
    'password field: no chip',
    !(await ui('.chip').evaluate((el) => getComputedStyle(el).display !== 'none')),
  );

  // --- Upload with Envoy: text ---
  async function upload(name, act) {
    await page.click('#file', { force: true, trial: true }).catch(() => undefined);
    await page.focus('#file');
    await page.waitForTimeout(300);
    await ui('.up-btn').click();
    await ui('input[type=file]').setInputFiles(join(WORK, name));
    await page.waitForTimeout(1500);
    if (act) await act();
    const ready = await ui('.up-card button.primary')
      .waitFor({ timeout: 45000 })
      .then(
        () => true,
        () => false,
      );
    const receipt = await ui('.up-card').innerText();
    if (!ready)
      throw new Error(
        `${name}: no Send button. Card: ${(await ui('.up-card').evaluate((el) => el.innerHTML)).replace(/\s+/g, ' ').slice(0, 700)}`,
      );
    await ui('.up-card button.primary').click();
    await page.waitForTimeout(800);
    const handed = await page.evaluate(async () => {
      const f = document.getElementById('file').files[0];
      if (!f) return null;
      const bytes = new Uint8Array(await f.arrayBuffer());
      let latin = '';
      for (const b of bytes) latin += String.fromCharCode(b);
      return { name: f.name, type: f.type, size: f.size, latin };
    });
    return { receipt, handed };
  }
  const t = await upload('lease.txt');
  check(
    'upload text: the site receives a masked file',
    !!t.handed &&
      !t.handed.latin.includes(RAW.email) &&
      !t.handed.latin.includes('EG38') &&
      t.handed.latin.includes('['),
    t.handed?.latin.slice(0, 120),
  );

  // --- Upload with Envoy: photo ---
  const img = await upload('photo.jpg', async () => {
    const canvas = ui('.up-card canvas');
    const b = await canvas.boundingBox();
    await page.mouse.move(b.x + 10, b.y + 10);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
  });
  check(
    'upload photo: EXIF and camera data removed',
    !!img.handed &&
      !img.handed.latin.includes('Exif') &&
      !img.handed.latin.includes('EnvoyTestCam'),
  );
  const boxBlack = await page.evaluate(async () => {
    const f = document.getElementById('file').files[0];
    const bmp = await createImageBitmap(f);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const [r, gg, b] = g.getImageData(
      Math.round(bmp.width * 0.2),
      Math.round(bmp.height * 0.2),
      1,
      1,
    ).data;
    return r + gg + b < 60;
  });
  check('upload photo: the drawn box is burned into the pixels', boxBlack);

  // --- Upload with Envoy: PDF ---
  const pdf = await upload('lease.pdf');
  check(
    'upload PDF: rebuilt without the raw values',
    !!pdf.handed &&
      pdf.handed.latin.startsWith('%PDF') &&
      !pdf.handed.latin.includes(RAW.email) &&
      !pdf.handed.latin.includes('2631'),
    pdf.receipt.slice(0, 160),
  );

  // --- message security ---
  const pageCanMessage = await page.evaluate(
    () => typeof globalThis.chrome?.runtime?.sendMessage === 'function',
  );
  check('security: a web page cannot message the extension', !pageCanMessage);
  const popupP = ctx.waitForEvent('page', { timeout: 15000 });
  await cdp.send('Target.createTarget', { url: `chrome-extension://${extId}/popup.html` });
  const popup = await popupP;
  await popup.waitForLoadState();
  const send = (m) => popup.evaluate((msg) => globalThis.chrome.runtime.sendMessage(msg), m);
  const good = await send({
    type: 'envoy:set-site',
    origin: `http://127.0.0.1:${PORT}`,
    enabled: true,
  });
  check('security: the popup can turn Envoy on for a site', good?.ok === true);
  const bad = await send({ type: 'envoy:set-site', origin: 'javascript:alert(1)', enabled: true });
  check('security: a non-web origin is refused', bad?.ok === false);
  await send({ type: 'envoy:set-site', origin: `http://127.0.0.1:${PORT}`, enabled: false });
  await popup.close();

  // --- side panel ---
  const pageP = ctx.waitForEvent('page', { timeout: 15000 });
  await cdp.send('Target.createTarget', { url: `chrome-extension://${extId}/sidepanel.html` });
  const panel = await pageP;
  await panel.waitForTimeout(9000);
  const frame = panel
    .frames()
    .find((f) => f.url().startsWith('https://envoy-hybrid-ai.web.app/app'));
  check('side panel: embeds the Envoy chat', !!frame);
  if (frame)
    check(
      'side panel: the chat composer is ready',
      (await frame.locator('#envoy-composer').count()) === 1,
    );
} catch (e) {
  check('run completed', false, e.message.split('\n')[0]);
} finally {
  await browser.close().catch(() => undefined);
  chrome.kill();
  server.close();
  setTimeout(() => rmSync(WORK, { recursive: true, force: true }), 500);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

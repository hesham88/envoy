/* global console, process, URL, window, document, setTimeout, Buffer */ // window/document: inside page callbacks
/**
 * Records the film's footage (everything except the private-mode take, see record-private.mjs):
 * the live site, the dev-only 2.5D scene, the problem motion graphic, and the REAL extension content
 * script on a neutral stand-in page. Each page is fully loaded (fonts too) before recording starts,
 * and typing moments are time-stamped (<id>.marks.json) so the film can put keyboard sounds on them.
 *
 * Usage: node video/record.mjs [--only n02-problem,n14-extension]   (dev server on 5173 for n01)
 * Output: video/out/raw/<id>.mp4 (1600x900) + <id>.marks.json
 */
import '../scripts/lib/scratch.mjs'; // Chrome temp files and profiles on the repo's drive, not C:
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const RAW = join(HERE, 'out', 'raw');
const SITE = 'https://envoy-hybrid-ai.web.app';
const DEV = 'http://localhost:5173';
const W = 1600;
const H = 900;
mkdirSync(RAW, { recursive: true });
const only = process.argv.includes('--only')
  ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(','))
  : null;

// Local static server: scenes, fonts, brand art, store pages and the built extension.
const EXT = join(REPO, 'apps/extension');
const ROOTS = [
  ['scenes/', join(HERE, 'scenes')],
  ['fonts-plex/', join(REPO, 'node_modules/@fontsource/ibm-plex-sans/files')],
  ['fonts/', join(REPO, 'node_modules/@fontsource-variable/fraunces/files')],
  ['brand/', join(REPO, 'docs/img/brand')],
  ['store/', join(EXT, 'store')],
  ['', join(EXT, 'dist')],
];
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/');
  if (path.includes('..')) return void res.writeHead(403).end();
  const [prefix, root] = ROOTS.find(([p]) => path.startsWith(p));
  let body;
  try {
    body = await readFile(join(root, path.slice(prefix.length)));
  } catch {
    return void res.writeHead(404).end();
  }
  res
    .writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
    .end(body);
});
await new Promise((r) => server.listen(5198, '127.0.0.1', r));
const LOCAL = 'http://127.0.0.1:5198';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const smooth = (page, y) => page.evaluate((top) => window.scrollTo({ top, behavior: 'smooth' }), y);
const scrollTo = (page, selector, block = 'start') =>
  page
    .locator(selector)
    .first()
    .evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block);

/**
 * Records `run` with Chrome's screencast and encodes it at a constant 30 fps (each frame is held
 * until the next; a static page sends no frames, so the last one is held). `mark(name)` stores the
 * moment for the film (typing sounds), in seconds from the clip's first frame.
 */
export async function screencast(page, id, run) {
  const dir = join(RAW, `.${id}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
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
  await cdp.send('Page.stopScreencast').catch(() => {});
  const end = Date.now() / 1000;
  const kept = frames.filter((f, i) => f.t >= start || frames[i + 1]?.t > start);
  if (!kept.length && frames.length) kept.push({ ...frames[frames.length - 1], t: start });
  const lines = [];
  kept.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    writeFileSync(join(dir, name), Buffer.from(f.data, 'base64'));
    const next = kept[i + 1]?.t ?? end;
    lines.push(
      `file '${name}'`,
      `duration ${Math.max(0.001, next - Math.max(f.t, start)).toFixed(4)}`,
    );
  });
  lines.push(`file 'f${String(kept.length - 1).padStart(5, '0')}.jpg'`);
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
  console.log(`${id}: ${(end - start).toFixed(1)} s, ${kept.length} frames, ${marks.length} marks`);
}

/** Opens `url`, waits until it is fully loaded (fonts included), then records `run`. */
async function scene(id, url, run) {
  if (only && !only.has(id)) return;
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(id, 'page error', e.message.slice(0, 160)));
  await page.goto(url, { waitUntil: url.includes('/app') ? 'domcontentloaded' : 'load' });
  await page.evaluate(() => document.fonts.ready);
  await wait(900);
  await screencast(page, id, (mark) => run(page, mark));
  await ctx.close();
}

/** Types into a field with marks around it, so the film can add keyboard sounds. */
async function type(page, mark, locator, text, delay = 30) {
  mark('type-start');
  await locator.pressSequentially(text, { delay });
  mark('type-end');
}

// A fictional photo of an ID card, with an EXIF block holding a location, for the upload scene.
async function idCardPhoto() {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 560 } });
  const p = await ctx.newPage();
  await p.setContent(`<div style="width:900px;height:560px;background:linear-gradient(135deg,#d9e4f2,#f4efe6);font:22px system-ui;color:#223;position:relative">
    <div style="position:absolute;left:40px;top:40px;width:820px;height:480px;border-radius:24px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.25);padding:36px;box-sizing:border-box">
    <div style="font:700 30px system-ui;color:#2a4d8f">RESIDENT CARD</div><div style="margin-top:6px;color:#667">Specimen · fictional</div>
    <div style="display:flex;gap:30px;margin-top:30px"><div style="width:180px;height:220px;border-radius:14px;background:#c9d3e0"></div>
    <div style="line-height:2"><div>Name: <b>Mona Adel</b></div><div>ID: <b>2750 6120 1048 39</b></div><div>Address: <b>14 Nile Street, Maadi</b></div><div>Born: <b>12 June 1975</b></div></div></div></div></div>`);
  const png = join(RAW, '.idcard.jpg');
  await p.screenshot({ path: png, type: 'jpeg', quality: 92 });
  await ctx.close();
  const jpg = await readFile(png);
  const make = Buffer.from('EnvoyDemoCam\0', 'latin1');
  const tiff = Buffer.alloc(26);
  tiff.write('II*\0', 0, 'latin1');
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x010f, 10);
  tiff.writeUInt16LE(2, 12);
  tiff.writeUInt32LE(make.length, 14);
  tiff.writeUInt32LE(26, 18);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, make]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]),
    payload,
  ]);
  const out = join(RAW, 'id-card-photo.jpg');
  writeFileSync(out, Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]));
  rmSync(png, { force: true });
  return out;
}

// ---------------- the scenes ----------------

// 1. Opening: the real 2.5D delegation scene (device, guard, cloud), dev-only route.
await scene('n01-open', `${DEV}/studio/scene`, async () => wait(9000));

// 2. The problem: everything you paste leaves your device.
await scene('n02-problem', `${LOCAL}/scenes/problem.html`, async () => wait(13500));

// 3. The promise: the landing hero.
await scene('n03-promise', `${SITE}/`, async (p) => {
  await p.mouse.move(W * 0.7, H * 0.35);
  await wait(1500);
  await p.mouse.move(W * 0.3, H * 0.55, { steps: 60 });
  await wait(5500);
});

// 4. Live masking on the landing page.
await scene('n04-live', `${SITE}/`, async (p, mark) => {
  await scrollTo(p, 'textarea', 'center');
  await wait(1400);
  const box = p.locator('textarea').first();
  await box.click();
  await box.fill('');
  await type(
    p,
    mark,
    box,
    "Hi, I'm Mona Adel, mona.adel@example.com, +20 100 555 0192. Rent is EGP 8,500 on 1 March 2026.",
  );
  await wait(3000);
});

// 5. Who it's for: three quick messages in the same live demo.
const key = ['sk', 'proj', 'Q7v2LmX9tR4bN8cK1pW6zA3'].join('-'); // fictional, built at runtime
await scene('n05-usecases', `${SITE}/`, async (p, mark) => {
  await scrollTo(p, 'textarea', 'center');
  await wait(1000);
  const box = p.locator('textarea').first();
  for (const text of [
    'Offer letter for Heba Radwan (heba.radwan@example.com): base salary EGP 80,000, start 1 March 2026.',
    'Lab results for patient Omar Nabil, national ID 27506120104839, phone +20 127 654 3210: HbA1c 7.9%.',
    `Deploy notes: api_key=${key} and DB_PASSWORD=hunter2-very-long, then restart.`,
  ]) {
    await box.click();
    await box.fill('');
    await type(p, mark, box, text, 18);
    await wait(2300);
  }
});

// 13. Hybrid inference, step by step: the landing page's how-it-works section.
await scene('n13-hybrid', `${SITE}/`, async (p) => {
  await p.locator('#how').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await wait(600);
  await wait(3000);
  await smooth(p, (await p.evaluate(() => window.scrollY)) + 520);
  await wait(7500);
});

// 14. The extension on a text box: a plain account number is found and replaced.
await scene('n14-extension', `${LOCAL}/scenes/stand-in.html`, async (p, mark) => {
  const t = p.locator('#t');
  await t.click();
  await type(
    p,
    mark,
    t,
    "My bank account number 1010192316 was charged twice by my phone company. Can you write the complaint? I'm Mona Adel, +20 100 555 0192.",
    26,
  );
  await wait(900);
  await p.locator('#envoy-field-ui .chip').click();
  await wait(3800);
  await p.locator('#envoy-field-ui .btn.primary').click();
  await wait(3500);
});

// 15. Upload with Envoy: a photo of an ID card, a box over the number, location data removed.
const photo = only && !only.has('n15-upload') ? null : await idCardPhoto();
await scene('n15-upload', `${LOCAL}/scenes/stand-in.html`, async (p) => {
  // Lift the composer so the upload card (it opens below the button) fits in the frame.
  await p.evaluate(() => (document.querySelector('.compose').style.marginTop = '40px'));
  await wait(300);
  await p.locator('#plus').click();
  await wait(1200);
  await p.locator('#envoy-field-ui .up-btn').click();
  await wait(900);
  await p.locator('#envoy-field-ui .up-card input[type=file]').setInputFiles(photo);
  await wait(1500);
  const canvas = p.locator('#envoy-field-ui .up-card canvas');
  const b = await canvas.boundingBox();
  await p.mouse.move(b.x + b.width * 0.47, b.y + b.height * 0.47);
  await p.mouse.down();
  await p.mouse.move(b.x + b.width * 0.86, b.y + b.height * 0.55, { steps: 25 });
  await p.mouse.up();
  await wait(2600);
  await p.locator('#envoy-field-ui .up-card button.primary').scrollIntoViewIfNeeded();
  await wait(2200);
});

// 16. Private mode not on? The guide checks this computer and shows the steps.
await scene('n16-guide', `${SITE}/app?guide=private`, async (p) => {
  await wait(4200);
  await p
    .locator('dialog')
    .evaluate((d) => d.firstElementChild?.scrollBy({ top: 420, behavior: 'smooth' }));
  await wait(4500);
});

// 17. Measured: the landing page's results table.
await scene('n17-measured', `${SITE}/#guard`, async (p) => {
  // The whole table, then the line under it (the adversarial suite and the GPU run).
  await scrollTo(p, 'table', 'start');
  await wait(900);
  await smooth(p, (await p.evaluate(() => window.scrollY)) - 90);
  await wait(4800);
  await smooth(p, (await p.evaluate(() => window.scrollY)) + 230);
  await wait(5200);
});

// 18. End card.
await scene('n18-end', `${LOCAL}/store/promo.html`, async (p) => {
  await p.evaluate(() => {
    document.body.style.setProperty('--h', '92px');
    document.body.style.setProperty('--p', '28px');
    document.body.style.setProperty('--t', '20px');
  });
  await wait(6000);
});

await browser.close();
server.close();
console.log('footage in', RAW);

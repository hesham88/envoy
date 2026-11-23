/* global console, process, URL, window, document, setTimeout, Buffer */ // window/document: inside page callbacks
/**
 * Records the demo film's footage, one clip per narration line, from the REAL product:
 * the live site (https://envoy-hybrid-ai.web.app) and the built extension's content script on the
 * fictional stand-in page (apps/extension/store/demo-page.html). Nothing is mocked or staged.
 *
 * Usage: node video/record.mjs [--only n04-chat,n05-recorder]
 * Output: video/out/raw/<id>.webm (1600x900).
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const RAW = join(HERE, 'out', 'raw');
const SITE = 'https://envoy-hybrid-ai.web.app';
const W = 1600;
const H = 900;
mkdirSync(RAW, { recursive: true });
const only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',')) : null;

// Local static server for the extension stand-in page and the end card.
const EXT = join(REPO, 'apps/extension');
const ROOTS = [
  ['store/', join(EXT, 'store')],
  ['fonts/', join(REPO, 'node_modules/@fontsource-variable/fraunces/files')],
  ['brand/', join(REPO, 'docs/img/brand')],
  ['', join(EXT, 'dist')],
];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '').replace(/\\/g, '/');
  if (path.includes('..')) return void res.writeHead(403).end();
  const [prefix, root] = ROOTS.find(([p]) => path.startsWith(p));
  let body;
  try {
    body = await readFile(join(root, path.slice(prefix.length)));
  } catch {
    return void res.writeHead(404).end();
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(5198, '127.0.0.1', r));
const LOCAL = 'http://127.0.0.1:5198';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const smooth = (page, y) => page.evaluate((top) => window.scrollTo({ top, behavior: 'smooth' }), y);
const scrollTo = (page, selector, block = 'start') =>
  page.locator(selector).first().evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block);

/**
 * Records a page with Chrome's screencast (CDP) and encodes it with the system ffmpeg at a constant
 * 30 fps. Screencast sends a frame only when the page changes, so each frame is held until the next.
 */
export async function screencast(page, id, run, { trimStart = 0 } = {}) {
  const dir = join(RAW, `.${id}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H });
  const t0 = Date.now();
  await run(page);
  await cdp.send('Page.stopScreencast').catch(() => {});
  const end = Date.now() / 1000;
  const start = (frames[0]?.t ?? end) + trimStart;
  const kept = frames.filter((f, i) => f.t >= start || frames[i + 1]?.t > start);
  // A static page sends no frames after the trim point: hold its last frame for the whole clip.
  if (!kept.length && frames.length) kept.push({ ...frames[frames.length - 1], t: start });
  const lines = [];
  kept.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    writeFileSync(join(dir, name), Buffer.from(f.data, 'base64'));
    const next = kept[i + 1]?.t ?? end;
    lines.push(`file '${name}'`, `duration ${Math.max(0.001, next - Math.max(f.t, start)).toFixed(4)}`);
  });
  if (kept.length) lines.push(`file 'f${String(kept.length - 1).padStart(5, '0')}.jpg'`);
  writeFileSync(join(dir, 'list.txt'), lines.join('\n'));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', `fps=30,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0b0a1f,format=yuv420p`, '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', join(RAW, `${id}.mp4`)]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${id}: ${((Date.now() - t0) / 1000).toFixed(1)} s, ${kept.length} frames`);
}

async function scene(id, run) {
  if (only && !only.has(id)) return;
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(id, 'page error', e.message.slice(0, 160)));
  await screencast(page, id, run, { trimStart: 0.4 });
  await ctx.close();
}

// 1. The problem: a generic AI chat with a message full of private details, sent as is.
await scene('n01-hook', async (p) => {
  await p.goto(`${LOCAL}/store/demo-page.html`, { waitUntil: 'load' });
  await p.focus('#t');
  await wait(9000);
});

// 2. The promise: the landing page hero.
await scene('n02-promise', async (p) => {
  await p.goto(`${SITE}/`, { waitUntil: 'load' });
  await p.mouse.move(W * 0.7, H * 0.35);
  await wait(2000);
  await p.mouse.move(W * 0.3, H * 0.55, { steps: 60 });
  await wait(5000);
});

// 3. Live: type into the landing demo and watch details become tags.
await scene('n03-live', async (p) => {
  await p.goto(`${SITE}/`, { waitUntil: 'load' });
  await scrollTo(p, '#hero-h ~ div, textarea', 'center');
  await wait(1200);
  const box = p.locator('textarea').first();
  await box.click();
  await box.fill('');
  await box.pressSequentially("Hi, I'm Mona Adel, mona.adel@example.com, +20 100 555 0192. Rent is EGP 8,500 on 1 March 2026.", { delay: 38 });
  await wait(3000);
});

// 4–8. The chat with the sample lease: send, recorder, approval, guard, answer.
let chat = null;
async function openChat() {
  if (chat) return chat;
  chat = await browser.newContext({ viewport: { width: W, height: H } });
  return chat;
}
await scene('n04-chat', async (p) => {
  await p.goto(`${SITE}/app?sample=lease`, { waitUntil: 'load' });
  await wait(2500);
  await p.locator('#envoy-composer').click();
  await wait(1500);
  await p.keyboard.press('End');
  await wait(800);
  await p.keyboard.press('Enter');
  await wait(4000);
});
await scene('n05-recorder', async (p) => {
  await p.goto(`${SITE}/app?sample=lease`, { waitUntil: 'load' });
  await wait(1500);
  await p.locator('#envoy-composer').press('Enter');
  await p.getByText('Privacy flight recorder').first().waitFor();
  await wait(1500);
  await scrollTo(p, 'details', 'start');
  await wait(9000);
});
const toApproval = async (p) => {
  await p.goto(`${SITE}/app?sample=lease`, { waitUntil: 'load' });
  await wait(1200);
  await p.locator('#envoy-composer').press('Enter');
  await p.getByRole('button', { name: 'Approve and send' }).waitFor({ timeout: 30000 });
  await p.getByRole('group', { name: 'Before and after' }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await smooth(p, (await p.evaluate(() => window.scrollY)) - 80);
};
await scene('n06-approve', async (p) => {
  await toApproval(p);
  await wait(2500);
  await smooth(p, (await p.evaluate(() => window.scrollY)) + 320);
  await wait(7000);
});
await scene('n07-guard', async (p) => {
  await toApproval(p);
  await p.getByRole('button', { name: 'Edit excerpt' }).click();
  const box = p.getByLabel(/Excerpt to send/);
  await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await box.click();
  await p.keyboard.press('Control+End');
  await wait(600);
  await p.keyboard.type(' Pay to EG38 0019 0005 0000 0000 2631 8000 2.', { delay: 45 });
  await p.getByRole('alert').first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await wait(5000);
});
await scene('n08-answer', async (p) => {
  await toApproval(p);
  await wait(1000);
  await p.getByRole('button', { name: 'Approve and send' }).click();
  await p.getByText(/Reasoned in the cloud over tags|Answered on this device/).first().waitFor({ timeout: 60000 });
  await p.locator('article').last().locator('p.whitespace-pre-wrap').last().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await wait(9000);
});

// 9. Hybrid inference, step by step: the landing page's how-it-works section.
await scene('n09-hybrid', async (p) => {
  await p.goto(`${SITE}/#how`, { waitUntil: 'load' });
  await wait(4000);
  await smooth(p, (await p.evaluate(() => window.scrollY)) + 760);
  await wait(6000);
});

// 10. The extension: the real content script on the stand-in chat page.
await scene('n10-extension', async (p) => {
  await p.goto(`${LOCAL}/store/demo-page.html`, { waitUntil: 'load' });
  await p.focus('#t');
  await wait(1500);
  await p.locator('#envoy-field-ui .chip').click();
  await wait(4500);
  await p.locator('#envoy-field-ui .btn.primary').click();
  await wait(4000);
});

// 11. Measured: the landing page's results table.
await scene('n11-measured', async (p) => {
  await p.goto(`${SITE}/#guard`, { waitUntil: 'load' });
  await wait(1200);
  await scrollTo(p, 'table', 'center');
  await wait(8000);
});

// 12. End card.
await scene('n12-end', async (p) => {
  await p.goto(`${LOCAL}/store/promo.html`, { waitUntil: 'load' });
  await p.evaluate(() => {
    document.body.style.setProperty('--h', '92px');
    document.body.style.setProperty('--p', '28px');
    document.body.style.setProperty('--t', '20px');
  });
  await wait(6000);
});

void openChat; // reserved: a shared session across chat scenes if needed later
await browser.close();
server.close();
console.log('footage in', RAW);

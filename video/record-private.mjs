/* global console, process, window, document, self, setTimeout, Buffer */
/**
 * Records the private-mode scenes as ONE real session in the model Chrome (Gemma 4, the model
 * Gemini Nano 4 is built on), with Gemini 4 Hydrogen chosen as the cloud model, on the dev server
 * (App Check debug token). Then it cuts the scenes from that single take at the moments it marked.
 * Nothing is staged or sped up; long waits are cut, and the film says so.
 *
 * Take (v7): rent question -> on-device analysis -> approval -> the guard blocks a pasted IBAN ->
 * approve -> Hydrogen answer, with the
 * What you see / What leaves pane showing the exact excerpt sent and the maths worked out on the
 * device -> switch to Fast -> network off (Chrome's own emulation) -> "What is my monthly rent?"
 * answered on the device (0 bytes sent) -> a cloud question held while offline -> network back ->
 * the held question sent once (to Flash-Lite: the take spends exactly one Hydrogen request).
 *
 * Prereqs: model Chrome on CDP 9333 with on-device AI ready; dev server on 5173 started WITHOUT a
 * VITE_CLOUD_MODEL override (so the composer's model choice decides).
 * Usage: node video/record-private.mjs [--rehearse] -> video/out/raw/n06..n11.mp4 (+ marks, master)
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'out', 'raw');
const W = 1600;
const H = 900;
const APP = 'http://localhost:5173/app?sample=lease';
// --rehearse: the same take with the Fast model, to check every step before spending a Hydrogen
// request (its free tier allows 20 a day). It writes the same outputs; the real take overwrites them.
const rehearse = process.argv.includes('--rehearse');
mkdirSync(RAW, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --recut: cut the scenes again from the last take (private-master.mp4 + private-marks.json),
// without recording: changing a cut never costs another take.
const recut = process.argv.includes('--recut');
const { marks, typing } = recut
  ? JSON.parse(readFileSync(join(RAW, 'private-marks.json'), 'utf8'))
  : await recordTake();
const master = join(RAW, 'private-master.mp4');

async function recordTake() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.setViewportSize({ width: W, height: H });
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  // Right after Chrome starts, the model can report "downloading" for a moment while it registers.
  let status = 'unknown';
  for (let i = 0; i < 15 && status !== 'available'; i++) {
    status = await page.evaluate(async () =>
      'LanguageModel' in self ? await globalThis.LanguageModel.availability() : 'no-api',
    );
    if (status !== 'available') await wait(2000);
  }
  if (status !== 'available') throw new Error(`on-device model is "${status}": not recording`);

  // The cloud model for this take: Gemini 4 Hydrogen (the saved composer choice).
  await page.getByRole('radio', { name: rehearse ? /^Fast/ : 'Gemini 4 Hydrogen' }).click();
  await wait(1500);
  const model = await page.evaluate(
    () => document.body.innerText.match(/Cloud model: ([\w.-]+)/)?.[1],
  );
  const want = rehearse ? 'gemini-3.5-flash-lite' : 'gemini-4-hydrogen';
  if (model !== want) throw new Error(`cloud model is ${model}, not ${want}`);

  // Hydrogen budget (free tier: 20 requests a day per project, and FAILED requests count too).
  // A take spends exactly one. At most 2 takes a day, none after a Hydrogen failure that day, and
  // only after a successful rehearsal with Fast in the last 12 hours.
  const LEDGER = join(RAW, '..', 'hydrogen-ledger.json');
  const STAMP = join(RAW, 'rehearsal-ok.json');
  const pacificDay = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {};
  const today = (ledger[pacificDay] ??= { used: 0, failed: false });
  if (!rehearse) {
    const ok =
      existsSync(STAMP) && Date.now() - JSON.parse(readFileSync(STAMP, 'utf8')).at < 12 * 3600e3;
    if (!ok)
      throw new Error(
        'no successful rehearsal (--rehearse) in the last 12 hours: not spending Hydrogen',
      );
    if (today.failed)
      throw new Error(
        `Hydrogen already failed today (${pacificDay}, Pacific): no retry until tomorrow`,
      );
    if (today.used >= 2)
      throw new Error(`Hydrogen budget for ${pacificDay} spent (${today.used} takes): stop`);
  }
  const spendHydrogen = () => {
    if (rehearse) return;
    today.used += 1;
    writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
  };
  const hydrogenFailed = () => {
    if (rehearse) return;
    today.failed = true;
    writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
  };

  // Frames go straight to disk (a long on-device wait would otherwise fill Node's heap).
  const dir = join(RAW, '.private');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    const name = `f${String(frames.length).padStart(5, '0')}.jpg`;
    writeFileSync(join(dir, name), Buffer.from(f.data, 'base64'));
    frames.push({ name, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(600);
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: W,
    maxHeight: H,
  });
  const t0 = Date.now() / 1000;
  const marks = {};
  const typing = [];
  const mark = (k) => {
    marks[k] = Date.now() / 1000 - t0;
    console.log(`${k.padEnd(16)} ${marks[k].toFixed(1)} s`);
  };
  const center = (loc) =>
    loc.first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  const approveBtn = () => page.getByRole('button', { name: 'Approve and send' }).last();

  // 1. Ask about the rent.
  mark('loaded');
  await wait(2200);
  await page.locator('#envoy-composer').click();
  await wait(700);
  await page.keyboard.press('Control+A');
  // A question that needs working out, so the on-device router sends it to the cloud (a plain
  // "can my landlord raise it 20%?" is sometimes answered on the device, which is fine but not this scene).
  typing.push({ name: 'type-start', at: Date.now() / 1000 - t0 });
  await page.keyboard.type(
    "Can my landlord raise my rent 20% this year? What's the most it can go up to?",
    { delay: 42 },
  );
  typing.push({ name: 'type-end', at: Date.now() / 1000 - t0 });
  await wait(700);
  mark('send');
  await page.keyboard.press('Enter');
  await page.getByText('Privacy flight recorder').first().waitFor({ timeout: 30000 });
  await wait(800);
  await center(page.locator('details').last());
  mark('analysing');
  const first = await page.waitForFunction(
    () => {
      const turn = document.querySelector('article');
      if (!turn) return false;
      if (turn.innerText.includes('0 bytes left this device.')) return 'local';
      const approve = [...turn.querySelectorAll('button')].some(
        (x) => x.textContent?.trim() === 'Approve and send' && x.offsetParent !== null,
      );
      return approve ? 'cloud' : false;
    },
    null,
    { timeout: 20 * 60 * 1000, polling: 500 },
  );
  if ((await first.jsonValue()) !== 'cloud')
    throw new Error(
      'the first question was answered on the device: not this scene (nothing was sent)',
    );
  mark('analysed');
  await center(page.locator('details').last());
  await wait(5000);

  // 2. What the cloud will see.
  mark('approval');
  await page
    .getByRole('group', { name: 'Before and after' })
    .last()
    .evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await wait(5000);
  await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
  await wait(5000);

  // 2b. The guard: a raw IBAN typed into the excerpt blocks the send; then it's taken out again.
  mark('guard');
  await page.getByRole('button', { name: 'Edit excerpt' }).last().click();
  const box = page.getByLabel(/Excerpt to send/).last();
  await center(box);
  await wait(800);
  await box.click();
  await page.keyboard.press('Control+End');
  const raw = ' Pay to EG38 0019 0005 0000 0000 2631 8000 2.';
  typing.push({ name: 'type-start', at: Date.now() / 1000 - t0 });
  await page.keyboard.type(raw, { delay: 45 });
  typing.push({ name: 'type-end', at: Date.now() / 1000 - t0 });
  await page.getByRole('alert').first().waitFor({ timeout: 10000 });
  await center(page.getByRole('alert').last());
  mark('blocked');
  await wait(4000);
  for (let i = 0; i < raw.length; i++) await page.keyboard.press('Backspace');
  await wait(1200);
  await page.getByRole('button', { name: 'Done editing' }).last().click();
  await wait(800);

  // 3. Approve: Gemini 4 Hydrogen reasons over tags; the device restores values and does the maths.
  await center(approveBtn());
  await wait(1200);
  mark('approve');
  spendHydrogen(); // the one Hydrogen request of this take
  await approveBtn().click();
  await page
    .getByText(/Reasoned in the cloud over tags|Answered on this device|Lighter answer/)
    .first()
    .waitFor({ timeout: 240000 });
  mark('answer');
  // This take must show Gemini 4 Hydrogen itself answering: stop at once otherwise.
  const answerText = await page.locator('article').last().innerText();
  if (/Lighter answer|cloud unreachable|answered instead/.test(answerText)) {
    hydrogenFailed();
    throw new Error(`${want} did not answer (quota or network): not a usable take`);
  }
  await center(page.locator('article').last().locator('p.whitespace-pre-wrap').last());
  await wait(7000);
  mark('answer-end');

  // 4. What you see / What leaves: the exact excerpt that left, and the maths worked out here.
  const pane = page.getByRole('complementary').filter({ hasText: 'What leaves' }).last();
  mark('wiretap');
  await pane.evaluate((el) => {
    const box = [...el.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 40);
    (box ?? el).scrollTo?.({ top: 0, behavior: 'smooth' });
  });
  await wait(4000);
  // Scroll the pane down to the cards: what left, what came back, what was worked out on the device.
  await pane.evaluate((el) => {
    const boxes = [el, ...el.querySelectorAll('*')].filter(
      (n) => n.scrollHeight > n.clientHeight + 40,
    );
    for (const b of boxes) b.scrollBy({ top: 520, behavior: 'smooth' });
  });
  await wait(5500);
  await pane.evaluate((el) => {
    const boxes = [el, ...el.querySelectorAll('*')].filter(
      (n) => n.scrollHeight > n.clientHeight + 40,
    );
    for (const b of boxes) b.scrollBy({ top: 600, behavior: 'smooth' });
  });
  await wait(5500);
  // What the take actually shows, for the narration: the cloud's expression and the value worked out.
  const worked = await pane.innerText();
  writeFileSync(join(RAW, 'private-wiretap.txt'), worked);
  mark('wiretap-end');

  // 5. The model choice: switch to Fast for the rest of the take (no more Hydrogen requests).
  await center(page.getByRole('radio', { name: /^Fast/ }));
  await wait(1200);
  mark('fast');
  await page.getByRole('radio', { name: /^Fast/ }).click();
  await wait(2500);

  // 6. Network off: a document question is answered on the device, nothing sent.
  await cdp.send('Network.enable');
  const network = (offline) =>
    cdp.send('Network.emulateNetworkConditions', {
      offline,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  await network(true);
  await page.getByText("You're offline.").first().waitFor({ timeout: 10000 });
  mark('offline');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await wait(3500);
  const turnsBefore = await page.locator('article').count();
  await page.locator('#envoy-composer').click();
  mark('q2');
  typing.push({ name: 'type-start', at: Date.now() / 1000 - t0 });
  await page.keyboard.type('What is my monthly rent?', { delay: 55 });
  typing.push({ name: 'type-end', at: Date.now() / 1000 - t0 });
  await wait(500);
  await page.keyboard.press('Enter');
  await wait(1500);
  await center(page.locator('details').last());
  mark('analysing2');
  // Look only at the NEW turn: its own receipt ("0 bytes left this device.") means it was answered
  // on the device; its own approval card means the router sent it to the cloud.
  const newTurn = (n) =>
    page.waitForFunction(
      (k) => {
        const turns = document.querySelectorAll('article');
        if (turns.length <= k) return false;
        const turn = turns[turns.length - 1];
        if (turn.innerText.includes('0 bytes left this device.')) return 'local';
        const hold = [...turn.querySelectorAll('button')].some(
          (x) =>
            /Send when I.m back online|Approve and send/.test(x.textContent ?? '') &&
            x.offsetParent !== null,
        );
        return hold ? 'cloud' : false;
      },
      n,
      { timeout: 20 * 60 * 1000, polling: 500 },
    );
  const routed = await (await newTurn(turnsBefore)).jsonValue();
  console.log(`offline question: ${routed}`);
  if (routed !== 'local')
    throw new Error('the offline rent question was routed to the cloud: not a usable take');
  mark('answer2');
  await center(page.locator('article').last());
  await wait(7000);

  // 7. A question that needs the cloud, while offline: approved and held on the device.
  const turnsBefore3 = await page.locator('article').count();
  await page.locator('#envoy-composer').click();
  mark('q3');
  typing.push({ name: 'type-start', at: Date.now() / 1000 - t0 });
  await page.keyboard.type("What's the most my rent can go up to this year?", { delay: 50 });
  typing.push({ name: 'type-end', at: Date.now() / 1000 - t0 });
  await wait(500);
  await page.waitForFunction(
    () => !document.querySelector('button[aria-label="Send"]')?.disabled,
    null,
    {
      timeout: 120000,
    },
  );
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await wait(1500);
  await center(page.locator('details').last());
  mark('analysing3');
  const routed3 = await (await newTurn(turnsBefore3)).jsonValue();
  console.log(`offline cloud question: ${routed3}`);
  if (routed3 !== 'cloud')
    throw new Error('the offline cloud question was answered on the device: no hold to show');
  mark('analysed3');
  const holdBtn = page.getByRole('button', { name: "Send when I'm back online" }).last();
  await center(holdBtn);
  await wait(3500);
  await holdBtn.click();
  await page.getByText('Held on this device: waiting for the network').last().waitFor();
  mark('held');
  await wait(5000);

  // 8. Network back: the held question goes once, and is answered.
  // The first answer already says "Reasoned in the cloud over tags": wait for the HELD turn's own.
  const answeredIn = () =>
    page.evaluate(() => {
      const turn = [...document.querySelectorAll('article')].at(-1);
      return /Reasoned in the cloud over tags|Lighter answer/.test(turn?.innerText ?? '');
    });
  if (await answeredIn())
    throw new Error('the held turn already shows an answer before reconnecting');
  await network(false);
  mark('online');
  await page.waitForFunction(
    () => {
      const turn = [...document.querySelectorAll('article')].at(-1);
      return /Reasoned in the cloud over tags|Lighter answer/.test(turn?.innerText ?? '');
    },
    null,
    { timeout: 180000, polling: 500 },
  );
  mark('answer3');
  await center(page.locator('article').last().locator('p.whitespace-pre-wrap').last());
  await wait(6000);
  mark('end');
  await cdp.send('Page.stopScreencast');
  await page.close();
  await browser.close();
  if (rehearse) {
    writeFileSync(STAMP, JSON.stringify({ at: Date.now() }));
    console.log(
      'rehearsal: every step ran; now encoding and cutting (the real take overwrites these)',
    );
  }

  // Encode the master at a constant 30 fps from the variable-rate frames (already on disk).
  const kept = frames.filter((f, i) => f.t >= t0 || frames[i + 1]?.t > t0);
  const end = t0 + marks.end;
  const list = [];
  kept.forEach((f, i) => {
    const next = kept[i + 1]?.t ?? end;
    list.push(
      `file '${f.name}'`,
      `duration ${Math.max(0.001, next - Math.max(f.t, t0)).toFixed(4)}`,
    );
  });
  list.push(`file '${kept[kept.length - 1].name}'`);
  writeFileSync(join(dir, 'list.txt'), list.join('\n'));
  const master = join(RAW, 'private-master.mp4');
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
    master,
  ]);
  rmSync(dir, { recursive: true, force: true });
  writeFileSync(join(RAW, 'private-marks.json'), JSON.stringify({ marks, typing }, null, 2));
  return { marks, typing };
}

// Cut the scenes from the one take. Each part is [from, to] in master seconds.
const m = marks;
const cuts = {};
const cut = (id, parts) => {
  cuts[id] = parts;
  const tmp = parts.map((_, i) => join(RAW, `.${id}-${i}.mp4`));
  parts.forEach(([a, b], i) =>
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-ss',
      a.toFixed(2),
      '-i',
      master,
      '-t',
      (b - a).toFixed(2),
      '-c:v',
      'libx264',
      '-crf',
      '16',
      '-an',
      tmp[i],
    ]),
  );
  writeFileSync(
    join(RAW, `.${id}.txt`),
    tmp.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'),
  );
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    join(RAW, `.${id}.txt`),
    '-c',
    'copy',
    join(RAW, `${id}.mp4`),
  ]);
  rmSync(join(RAW, `.${id}.txt`));
  tmp.forEach((f) => rmSync(f, { force: true }));
  // Typing moments inside this scene, re-timed to the scene's own clock.
  const local = [];
  let offset = 0;
  for (const [a, b] of parts) {
    for (const t of typing)
      if (t.at >= a && t.at <= b) local.push({ name: t.name, at: offset + t.at - a });
    offset += b - a;
  }
  writeFileSync(join(RAW, `${id}.marks.json`), JSON.stringify(local, null, 1));
  console.log(`cut ${id} (${offset.toFixed(1)} s)`);
};
const waitCut = (a, b, keepStart, keepEnd) =>
  b - a > keepStart + keepEnd + 2
    ? [
        [a, a + keepStart],
        [b - keepEnd, b],
      ]
    : [[a, b]];
// Each scene is held only about as long as its narration (film/build.mjs), so a cut keeps just
// the moments that matter: typing, the result, and a short look at it.
cut('n06-chat', [[Math.max(0, m.loaded + 0.3, m.send - 7), m.send + 3.5]]);
cut('n07-recorder', waitCut(m.analysing, m.analysed + 5, 5, 5));
cut('n08-approve', [[m.approval, m.guard]]);
cut('n08g-guard', [[m.guard + 1.5, m.blocked + 4]]); // the alert lands while the line plays
cut('n09-wiretap', [[m.wiretap - 0.3, m['wiretap-end']]]);
// One continuous piece when the cloud answered in seconds (no wait note); a long wait is cut.
cut(
  'n10-answer',
  m.answer - m.approve > 20
    ? [...waitCut(m.approve - 0.5, m['answer-end'], 2.5, 4.5), [m.fast - 1, m.fast + 2]]
    : [[m.approve - 0.5, m['answer-end']]],
);
// Offline, a document question answered on the device.
cut('n11-offline', [
  [m.offline - 0.3, m.q2 + 2.4],
  [m.answer2 - 1.5, m.answer2 + 3.5], // the wait in between is cut
]);
// Offline, a cloud question approved and held; network back; it goes once and is answered.
cut('n12-held', [
  [m.q3 + 1.0, m.q3 + 2.6], // the end of the typing
  [m.analysed3 - 0.2, m.held + 1.2],
  // Network back -> the held question is sent -> its answer (Flash-Lite answers in seconds).
  ...waitCut(m.online - 0.3, Math.min(m.end, m.answer3 + 2.6), 1.3, 3.3),
]);
writeFileSync(join(RAW, 'private-cuts.json'), JSON.stringify(cuts, null, 1));
const waits = {
  analysis: m.analysed - m.analysing,
  hydrogen: m.answer - m.approve,
  local: m.answer2 - m.analysing2,
  held: m.analysed3 - m.analysing3,
};
writeFileSync(join(RAW, 'private-waits.json'), JSON.stringify(waits, null, 2));
console.log(
  `waits: analysis ${waits.analysis.toFixed(0)} s, Hydrogen ${waits.hydrogen.toFixed(0)} s, offline answer ${waits.local.toFixed(0)} s, offline cloud question ${waits.held.toFixed(0)} s`,
);
process.exit(0);

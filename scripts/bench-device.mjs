#!/usr/bin/env node
/**
 * Benchmarks Envoy's on-device steps on one machine: the same 17 one-click sample questions,
 * through the real pipeline (@envoy/ai analyze, plus the on-device answer for questions Envoy
 * answers locally), in a Chrome that has the built-in model. No cloud calls are made.
 *
 * It records the machine as Chrome reports it (chrome://gpu, chrome://on-device-internals), a raw
 * Prompt API micro-benchmark (time to first token, tokens per second), and per-question timings
 * with every step's own time. Run it on two machines to compare like with like.
 *
 * Prereqs: Chrome with the model on CDP (default 9333) and the dev server (default 5173).
 * Usage: node scripts/bench-device.mjs --label laptop-cpu [--cdp http://127.0.0.1:9333]
 *        [--app http://localhost:5173/] [--download] → docs/benchmarks/<date>-<label>.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectEnvoyPage, runCase } from './lib/envoy-browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const label = arg('--label', 'machine');
const cdp = arg('--cdp', 'http://127.0.0.1:9333');
const appUrl = arg('--app', 'http://localhost:5173/');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const { page, close } = await connectEnvoyPage({ cdp, appUrl });
const context = page.context();
try {
  // ---------- the machine, as Chrome sees it ----------
  const readPage = async (url, maxChars = 6000) => {
    const p = await context.newPage();
    try {
      await p.goto(url, { waitUntil: 'load', timeout: 30000 });
      await p.waitForTimeout(2500);
      return (await p.locator('body').innerText()).slice(0, maxChars);
    } catch (e) {
      return `unreadable: ${e.message.split('\n')[0]}`;
    } finally {
      await p.close();
    }
  };
  const gpuText = await readPage('chrome://gpu', 20000);
  const pick = (re) => gpuText.match(re)?.[1]?.trim() ?? null;
  const gpu = {
    renderer: pick(/GL_RENDERER\s+(.+)/),
    vendor: pick(/GL_VENDOR\s+(.+)/),
    webgpu: pick(/WebGPU:\s*(.+)/),
    vulkan: pick(/Vulkan:\s*(.+)/),
    gpu0: pick(/GPU0\s+(.+)/),
  };
  const odi = await readPage('chrome://on-device-internals', 8000);
  const env = await page.evaluate(async () => ({
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    memoryGB: navigator.deviceMemory ?? null,
    availability: 'LanguageModel' in self ? await LanguageModel.availability() : 'no LanguageModel',
  }));
  log('machine', JSON.stringify({ ...env, gpu }));

  // ---------- make sure the model is there (a download needs a click: a real input event) ----------
  if (env.availability !== 'available' && process.argv.includes('--download')) {
    log('model is', env.availability, '- starting the download from a click');
    await page.evaluate(() => {
      const b = document.createElement('button');
      b.id = 'bench-download';
      b.textContent = 'download';
      b.style.cssText = 'position:fixed;top:0;left:0;z-index:99999';
      b.onclick = () => {
        window.__dl = 0;
        LanguageModel.create({
          monitor: (m) => m.addEventListener('downloadprogress', (e) => (window.__dl = e.loaded)),
        }).then((s) => s.destroy(), (e) => (window.__dlError = String(e)));
      };
      document.body.append(b);
    });
    await page.click('#bench-download');
    for (let i = 0; i < 180; i++) {
      await page.waitForTimeout(5000);
      const st = await page.evaluate(async () => ({
        a: await LanguageModel.availability(),
        p: window.__dl,
        e: window.__dlError,
      }));
      if (i % 6 === 0) log('download', JSON.stringify(st));
      if (st.a === 'available' || st.e) break;
    }
  }

  // ---------- raw Prompt API: time to first token and tokens per second ----------
  const micro = await page.evaluate(async () => {
    if (!('LanguageModel' in self) || (await LanguageModel.availability()) !== 'available')
      return { skipped: 'model not available' };
    const runs = [];
    const prompt =
      "Redact all PII (names, emails, phone numbers, IDs) from this text and return JSON only: 'Contact Jane Doe at jane.doe@example.com or 555-019-2834 regarding account 123-45-6789.'";
    const t0c = performance.now();
    const session = await LanguageModel.create();
    const createMs = Math.round(performance.now() - t0c);
    for (let i = 0; i < 3; i++) {
      const s = await session.clone();
      const t0 = performance.now();
      let first = null;
      let out = '';
      for await (const chunk of s.promptStreaming(prompt)) {
        if (first === null) first = performance.now();
        out += chunk;
      }
      const end = performance.now();
      const tokens = Math.max(1, Math.round(out.length / 4));
      runs.push({
        ttftMs: Math.round(first - t0),
        totalMs: Math.round(end - t0),
        approxTokens: tokens,
        tokPerSec: Number((tokens / Math.max(0.001, (end - first) / 1000)).toFixed(1)),
      });
      s.destroy();
    }
    session.destroy();
    return { createMs, runs };
  });
  log('micro', JSON.stringify(micro));

  // ---------- Envoy's sample questions, through the real pipeline ----------
  const samplesUrl = `/@fs/${resolve(ROOT, 'packages/app/src/chat/samples.ts').replace(/\\/g, '/')}`;
  const samples = await page.evaluate(async (u) => {
    const m = await import(u);
    return m.SAMPLES.map((s) => ({ id: s.id, text: s.doc.text, questions: s.questions }));
  }, samplesUrl);
  const rows = [];
  for (const s of samples)
    for (const q of s.questions) {
      const device = q.where === 'device';
      const r = await runCase(page, { document: s.text, question: q.text, withAnswer: device });
      const cloudCalls = (r.network ?? []).filter((n) => n.target === 'cloud').length;
      const row = {
        sample: s.id,
        question: q.text,
        ok: r.ok,
        mode: r.mode ?? null,
        routeLocal: r.route?.local ?? null,
        guardOk: r.guardOk ?? null,
        analyzeMs: r.ms,
        steps: (r.steps ?? []).map((x) => ({ step: x.step, source: x.source, ms: x.ms })),
        localAnswerMs: r.answer && r.answer.source === 'on_device' ? r.answer.ms : null,
        cloudCalls,
        error: r.ok ? undefined : r.error,
      };
      rows.push(row);
      log(
        `${s.id.padEnd(9)} ${String(row.analyzeMs).padStart(6)} ms ${row.mode} ${row.localAnswerMs ? `+ local answer ${row.localAnswerMs} ms` : ''} ${q.text.slice(0, 50)}`,
      );
    }

  const ms = rows.filter((r) => r.ok).map((r) => r.analyzeMs).sort((a, b) => a - b);
  const median = ms.length ? ms[Math.floor(ms.length / 2)] : null;
  const out = {
    label,
    measuredAt: new Date().toISOString(),
    env,
    gpu,
    onDeviceInternals: odi.slice(0, 3000),
    micro,
    summary: {
      questions: rows.length,
      ok: rows.filter((r) => r.ok).length,
      private: rows.filter((r) => r.mode === 'private').length,
      cloudCalls: rows.reduce((n, r) => n + r.cloudCalls, 0),
      analyzeMedianMs: median,
      analyzeMinMs: ms[0] ?? null,
      analyzeMaxMs: ms.at(-1) ?? null,
    },
    rows,
  };
  const file = resolve(ROOT, 'docs/benchmarks', `${out.measuredAt.slice(0, 10)}-${label}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  log('summary', JSON.stringify(out.summary), '→', file);
} finally {
  await close();
}

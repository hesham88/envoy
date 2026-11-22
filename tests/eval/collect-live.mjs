#!/usr/bin/env node
/**
 * Live on-device model collector for `tests/eval/probes/nano-cache.json`.
 *
 * Connects to Chrome over CDP (port 9333), runs the REAL on-device model via Firebase AI Logic
 * (`InferenceMode.ONLY_ON_DEVICE` through `@envoy/ai`'s `runPrivate` + `withSessionCleanup`),
 * and records the raw, unaltered JSON responses + timings + exact model component & version
 * from `chrome://on-device-internals` for every case in `tests/eval/cases.json`.
 *
 * Usage:
 *   node tests/eval/collect-live.mjs --component gemma4_component --version 2026.11.3.1140 --label "Gemma 4" [--limit 36] [--offset 0] [--force]
 */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..').replace(/\\/g, '/');
const CASES_PATH = resolve(__dirname, 'cases.json');
const CACHE_PATH = resolve(__dirname, 'probes/nano-cache.json');

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = next;
      i++;
    }
  }
}

const modelComponent = args.component ?? 'gemma4_component';
const modelVersion = args.version ?? '2026.11.3.1140';
const modelLabel = args.label ?? (modelComponent === 'gemma4_component' ? 'Gemma 4' : 'Gemini Nano (default)');
const backend = args.backend ?? 'cpu (OnDeviceModelForceCpuBackend)';
const detectScope = args.scope ?? 'selected';
const cdpUrl = args.cdp ?? 'http://127.0.0.1:9333';
const force = args.force === 'true';
const offset = Number(args.offset ?? 0);
const limit = Number(args.limit ?? 999);
const onlyIds = args.ids ? new Set(args.ids.split(',').map((s) => s.trim()).filter(Boolean)) : null;

async function resolveTargetUrl() {
  if (args.url) return args.url.endsWith('/') ? args.url : `${args.url}/`;
  if (args.port) return `http://localhost:${args.port}/`;
  for (const port of [5174, 5173, 5175]) {
    try {
      const r = await fetch(`http://localhost:${port}/src/app/useEnvoy.ts`);
      if (r.ok) return `http://localhost:${port}/`;
    } catch {
      // try next port
    }
  }
  throw new Error('No running Vite dev server found on ports 5174, 5173, or 5175.');
}

async function resolveViteModulePaths(baseUrl) {
  const res = await fetch(`${baseUrl}src/app/useEnvoy.ts`);
  if (!res.ok) throw new Error(`Failed to fetch ${baseUrl}src/app/useEnvoy.ts (HTTP ${res.status})`);
  const src = await res.text();
  const aiMatch = /from\s+["']([^"']*packages\/ai\/src\/index\.ts[^"']*)["']/.exec(src);
  const coreMatch = /from\s+["']([^"']*packages\/core\/src\/index\.ts[^"']*)["']/.exec(src);
  return {
    aiPath: aiMatch ? aiMatch[1] : `/@fs/${ROOT}/packages/ai/src/index.ts`,
    corePath: coreMatch ? coreMatch[1] : `/@fs/${ROOT}/packages/core/src/index.ts`,
  };
}

const cases = JSON.parse(readFileSync(CASES_PATH, 'utf8'));
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
mkdirSync(dirname(CACHE_PATH), { recursive: true });

// Purge any legacy entry that does not explicitly have source === 'live'
for (const [k, v] of Object.entries(cache)) {
  if (!v || v.source !== 'live') {
    delete cache[k];
  }
}

const targetUrl = await resolveTargetUrl();
const { aiPath, corePath } = await resolveViteModulePaths(targetUrl);
console.log(`Collector target: ${targetUrl}`);
console.log(`Model under test: ${modelLabel} (${modelComponent} ${modelVersion}, ${backend})`);
console.log(`Modules: ai=${aiPath} | core=${corePath}`);

const browser = await chromium.connectOverCDP(cdpUrl);
const context = browser.contexts()[0];

const slice = onlyIds ? cases.filter((c) => onlyIds.has(c.id)) : cases.slice(offset, offset + limit);
let collected = 0;
let skipped = 0;
let failed = 0;

for (let idx = 0; idx < slice.length; idx++) {
  const tc = slice[idx];
  const existing = cache[tc.id];
  if (!force && existing && existing.source === 'live' && existing.modelComponent === modelComponent && existing.modelVersion === modelVersion) {
    skipped++;
    console.log(`[${idx + 1}/${slice.length}] ${tc.id} — cached live (${existing.modelComponent} ${existing.modelVersion}), skipping`);
    continue;
  }

  const page = await context.newPage();
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const tStart = Date.now();
  const res = await page.evaluate(
    async ({ doc, question, aiPath, corePath, detectScope }) => {
      const ai = await import(aiPath);
      const core = await import(corePath);
      const env = await import('/src/env.ts');

      const availBefore = 'LanguageModel' in self ? await self.LanguageModel.availability() : 'missing';
      if (availBefore !== 'available') {
        return { ok: false, availBefore, error: `LanguageModel availability is '${availBefore}'` };
      }

      // Ensure every LanguageModel session created during a step is destroyed immediately afterward
      // (mirrors withSessionCleanup on lane/core-web so Argon's own port 5174 never leaks KV caches).
      async function runStepClean(model, prompt, step) {
        const lm = self.LanguageModel;
        const origCreate = lm.create.bind(lm);
        const created = [];
        lm.create = async (...a) => {
          const s = await origCreate(...a);
          created.push(s);
          return s;
        };
        try {
          return await ai.runPrivate(model, prompt, step);
        } finally {
          lm.create = origCreate;
          for (const s of created) {
            try {
              s.destroy?.();
            } catch {
              // ignore idempotent destroy
            }
          }
        }
      }

      const { ai: fbAi } = ai.initEnvoy(env.readFirebaseEnv(), { dev: true });
      const settings = ai.DEFAULT_SETTINGS;
      const schemas = { detect: core.DETECT_SCHEMA, minimize: core.MINIMIZE_SCHEMA, route: core.ROUTE_SCHEMA };
      const models = Object.fromEntries(
        ['detect', 'minimize', 'route', 'answerLocal'].map((s) => [s, ai.createStepModel(fbAi, s, settings, schemas[s])]),
      );

      const chunks = core.chunkDocument(doc);
      const steps = [];
      const MAX_TOKENS = 2600;
      const estimateTokens = (s) => Math.ceil(s.length / 4);
      const batchChunks = (list, build) => {
        const batches = [];
        let cur = [];
        for (const c of list) {
          const next = [...cur, c];
          if (cur.length > 0 && estimateTokens(build(next)) > MAX_TOKENS) {
            batches.push(cur);
            cur = [c];
          } else {
            cur = next;
          }
        }
        if (cur.length) batches.push(cur);
        return batches;
      };

      try {
        // 1. Minimize (on-device ONLY_ON_DEVICE)
        const minBatches = batchChunks(chunks, (b) => core.buildMinimizePrompt(b, question));
        const selectedSet = new Set();
        const minReasons = [];
        let minimizeRaw = '';
        let minMs = 0;
        for (const b of minBatches) {
          const r = await runStepClean(models.minimize, core.buildMinimizePrompt(b, question), 'minimize');
          minMs += r.ms;
          minimizeRaw = r.text;
          const parsed = core.parseMinimizeResponse(
            r.text,
            b.map((c) => c.id),
          );
          if (parsed) {
            parsed.ids.forEach((id) => selectedSet.add(id));
            if (parsed.reason) minReasons.push(parsed.reason);
          }
        }
        steps.push({ step: 'minimize', source: 'on_device', ms: minMs });
        const selectedIds = selectedSet.size > 0 ? [...selectedSet].sort((a, b) => a - b) : chunks.map((c) => c.id);
        const minimizeJson =
          minBatches.length === 1
            ? minimizeRaw
            : JSON.stringify({ clause_ids: selectedIds, reason: minReasons.join(' ') });

        // 2. Detect (on-device ONLY_ON_DEVICE)
        const detectChunks =
          detectScope === 'selected'
            ? chunks.filter((c) => selectedIds.includes(c.id) || c.id === 1)
            : chunks;
        const detectBatches = batchChunks(detectChunks, (b) =>
          core.buildDetectPrompt(b.map((c) => c.text).join('\n\n'), question),
        );
        const combinedEntities = [];
        let detectRaw = '';
        let detMs = 0;
        for (const b of detectBatches) {
          const prompt = core.buildDetectPrompt(b.map((c) => c.text).join('\n\n'), question);
          const r = await runStepClean(models.detect, prompt, 'detect');
          detMs += r.ms;
          detectRaw = r.text;
          try {
            const parsed = JSON.parse(r.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
            if (Array.isArray(parsed?.entities)) {
              combinedEntities.push(...parsed.entities);
            }
          } catch {
            // keep raw for transparency
          }
        }
        steps.push({ step: 'detect', source: 'on_device', ms: detMs });
        const detectJson = detectBatches.length === 1 ? detectRaw : JSON.stringify({ entities: combinedEntities });

        // 3. Route (on-device ONLY_ON_DEVICE)
        const selected = chunks.filter((c) => selectedIds.includes(c.id));
        const routePrompt = core.buildRoutePrompt(question, selected);
        let routeJson;
        if (estimateTokens(routePrompt) > MAX_TOKENS) {
          routeJson = JSON.stringify({
            answerable_locally: false,
            reason: 'Selected excerpt exceeds on-device route token budget.',
          });
        } else {
          const r = await runStepClean(models.route, routePrompt, 'route');
          steps.push({ step: 'route', source: 'on_device', ms: r.ms });
          routeJson = r.text;
        }
        const routeParsed = core.parseRouteResponse(routeJson);

        // 4. Local answer if routed locally (on-device ONLY_ON_DEVICE)
        let localAnswerText = null;
        if (routeParsed?.local) {
          const r = await runStepClean(models.answerLocal, core.buildLocalAnswerPrompt(question, selected), 'answerLocal');
          steps.push({ step: 'answerLocal', source: 'on_device', ms: r.ms });
          localAnswerText = r.text;
        }

        const availAfter = 'LanguageModel' in self ? await self.LanguageModel.availability() : 'missing';
        return {
          ok: true,
          availBefore,
          availAfter,
          detectJson,
          minimizeJson,
          routeJson,
          localAnswerText,
          steps,
          selectedIds,
          schemaValid: Boolean(core.parseMinimizeResponse(minimizeJson, chunks.map((c) => c.id)) && routeParsed),
        };
      } catch (e) {
        return { ok: false, availBefore, error: `${e.name}: ${e.message}`, steps };
      }
    },
    { doc: tc.document, question: tc.question, aiPath, corePath, detectScope },
  );

  await page.close();
  const totalMs = Date.now() - tStart;

  if (res.ok) {
    cache[tc.id] = {
      source: 'live',
      modelLabel,
      modelComponent,
      modelVersion,
      backend,
      detectScope,
      recordedAt: new Date().toISOString(),
      ms: totalMs,
      steps: res.steps,
      detectJson: res.detectJson,
      minimizeJson: res.minimizeJson,
      routeJson: res.routeJson,
      ...(res.localAnswerText !== null ? { localAnswerText: res.localAnswerText } : {}),
      schemaValid: res.schemaValid,
    };
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf8');
    collected++;
    console.log(
      `[${idx + 1}/${slice.length}] ${tc.id} — LIVE OK (${totalMs} ms) selected=${JSON.stringify(res.selectedIds)} steps=${JSON.stringify(res.steps)}`,
    );
  } else {
    failed++;
    console.error(`[${idx + 1}/${slice.length}] ${tc.id} — FAILED (${totalMs} ms): ${res.error}`);
  }
}

console.log(`\nLive collection complete: collected=${collected}, skipped=${skipped}, failed=${failed}, totalLiveInCache=${Object.keys(cache).length}/${cases.length}`);
process.exit(failed > 0 ? 1 : 0);

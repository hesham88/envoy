#!/usr/bin/env node
/**
 * Recorded On-Device Demo Trace Exporter (Milestone 4)
 *
 * Runs the REAL Envoy pipeline (`analyze()` + `answer()`) inside the model Chrome (port 9333)
 * on the official sample lease (`EN_LEASE.text`, question: "Can my landlord raise the rent 20% this year?")
 * and writes the verbatim trace to `tests/eval/probes/demo-trace-<arm>.json` so judges without an
 * on-device model can replay a genuine recorded on-device run (clearly labelled as a recording).
 *
 * NEVER edits or synthesizes trace content; refuses to write if `mode !== 'private'`.
 *
 * Usage:
 *   node tests/eval/record-demo-trace.mjs --arm gemma4 --component gemma4_component --version 2026.11.3.1140 --label "Gemma 4" --port 5174
 *   node tests/eval/record-demo-trace.mjs --arm gemma4 --component gemma4_component --version 2026.11.3.1140 --label "Gemma 4" --port 5174
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectEnvoyPage } from '../../scripts/lib/envoy-browser.mjs';
import { ensureViteReachable, initBrowserSdk } from './lib/browser-sdk.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const fsUrl = (p) => `/@fs/${resolve(ROOT, p).replace(/\\/g, '/')}`;

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

const arm = args.arm ?? 'gemma4';
const port = Number(args.port ?? 5174);
const appUrl = args.url ?? `http://localhost:${port}/`;
const cdp = args.cdp ?? 'http://127.0.0.1:9333';
const QUESTION = 'Can my landlord raise the rent 20% this year?';

const ARM_MODELS = {
  gemma4: {
    component: args.component ?? 'gemma4_component',
    version: args.version ?? '2026.11.3.1140',
    label: args.label ?? 'Gemma 4',
  },
};

const modelMeta = ARM_MODELS[arm] ?? {
  component: args.component ?? 'unknown',
  version: args.version ?? 'unknown',
  label: args.label ?? arm,
};
const backend = args.backend ?? 'cpu (OnDeviceModelForceCpuBackend)';
const outPath = resolve(__dirname, `probes/demo-trace-${arm}.json`);

await ensureViteReachable(appUrl);
const session = await connectEnvoyPage({ cdp, appUrl });
try {
  const sdkInfo = await initBrowserSdk(session.page);
  console.log(
    `Recording live demo trace [${arm}] (${modelMeta.label} ${modelMeta.component} ${modelMeta.version}, cloud=${sdkInfo.cloudModel})...`,
  );

  const raw = await session.page.evaluate(
    async ({ question, paths }) => {
      const ai = await import(paths.ai);
      const core = await import(paths.core);
      const deps = globalThis.__envoyEval.deps;
      ai.networkLog.clear();
      const deviceStatus = await ai.getDeviceStatus();
      const events = [];
      const t0 = performance.now();
      const analysis = await ai.analyze(core.EN_LEASE.text, question, deps, {
        detectScope: 'selected',
        onProgress: (p) => events.push({ ...p, at: Math.round(performance.now() - t0) }),
      });
      const analyzeMs = Math.round(performance.now() - t0);

      let answerResult = null;
      if (analysis.mode === 'private' && analysis.guard.ok) {
        const t1 = performance.now();
        const res = await ai.answer(analysis, analysis.outbound, deps);
        answerResult = {
          text: res.text,
          spans: res.spans,
          source: res.source,
          lighter: res.lighter,
          ms: Math.round(performance.now() - t1),
          receipt: res.receipt,
        };
      }

      return {
        documentTitle: core.EN_LEASE.title,
        question,
        deviceStatus,
        mode: analysis.mode,
        fallbackReason: analysis.fallbackReason,
        analyzeMs,
        steps: answerResult?.receipt?.steps ?? analysis.steps,
        selectedIds: analysis.selectedIds,
        selectionReason: analysis.selectionReason,
        route: analysis.route,
        outbound: analysis.outbound,
        guardOk: analysis.guard.ok,
        leaks: analysis.guard.leaks,
        entities: analysis.entities.map((e) => ({
          type: e.type,
          value: e.value,
          role: e.role ?? null,
          source: e.source,
        })),
        receipt: answerResult?.receipt ?? analysis.receipt,
        answer: answerResult,
        network: ai.networkLog.entries.map((e) => ({
          step: e.step,
          target: e.target,
          blocked: e.blocked,
          chars: e.payload.length,
        })),
        events,
      };
    },
    {
      question: QUESTION,
      paths: {
        ai: fsUrl('packages/ai/src/index.ts'),
        core: fsUrl('packages/core/src/index.ts'),
      },
    },
  );

  if (raw.mode !== 'private' || !raw.answer) {
    throw new Error(
      `Refusing to write demo trace for '${arm}': mode=${raw.mode}, guardOk=${raw.guardOk}, fallbackReason=${raw.fallbackReason ?? 'none'}`,
    );
  }

  const trace = {
    source: 'live',
    recording: true,
    arm,
    model: modelMeta,
    cloudModel: sdkInfo.cloudModel,
    backend,
    recordedAt: new Date().toISOString(),
    ...raw,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(trace, null, 2) + '\n', 'utf8');
  console.log(
    `Saved verbatim recorded trace -> ${outPath}\n` +
      `  mode=${trace.mode}, selectedIds=${JSON.stringify(trace.selectedIds)}, route.local=${trace.route.local}, ` +
      `guardOk=${trace.guardOk}, outboundChars=${trace.outbound.length}, answer.source=${trace.answer.source} (${trace.answer.ms}ms)\n` +
      `  answer: ${trace.answer.text.slice(0, 160)}...`,
  );
} finally {
  await session.close().catch(() => undefined);
}
process.exit(0);

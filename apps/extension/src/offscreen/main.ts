/* Offscreen document: the only place (besides the side panel) where the
 * on-device model runs. It is an extension page, so Chrome exposes the Prompt
 * API (LanguageModel) here - stable for extensions since Chrome 138 - while
 * content scripts and web pages never touch it directly. Every private call
 * goes through runPrivate, the device guard for SDK bug #10635. */
import { assignTags, parseDetectResponse } from '@envoy/core';
import { createStepModel, DEFAULT_SETTINGS, getDeviceStatus, initEnvoy, runPrivate } from '@envoy/ai';
import { isUnpacked, readFirebaseEnv } from '../env';
import './pdf-handler';

declare const chrome: {
  runtime: {
    onMessage: { addListener(fn: (msg: { type?: string; text?: string }, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void): void };
  };
};

let ai: ReturnType<typeof initEnvoy>['ai'] | null = null;
try {
  ai = initEnvoy(readFirebaseEnv(), { dev: isUnpacked() }).ai;
} catch {
  ai = null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'envoy:deep-detect-internal') return false;
  (async () => {
    const status = await getDeviceStatus();
    if (!ai || status !== 'available') {
      sendResponse({ ok: false, error: `On-device model not ready (${status}); rules-only findings are shown.`, model: 'Gemini Nano (Chrome built-in AI)' });
      return;
    }
    try {
      const model = createStepModel(ai, 'detect', DEFAULT_SETTINGS);
      const prompt = `## Task
List every person, organization, street address, money amount, secret, password, API key and account detail in the text, with its role.

## Rules
- Copy each item exactly as written.
- Reply only with JSON like {"entities":[{"text":"Alex Example","kind":"PERSON","role":"employee"}]}.

## Text
<text>
${(msg.text ?? '').slice(0, 6000)}
</text>`;
      const out = await runPrivate(model, prompt, 'detect');
      const entities = parseDetectResponse(out.text, msg.text ?? '');
      const tags = assignTags(entities);
      sendResponse({
        ok: true,
        model: 'Gemini Nano (Chrome built-in AI, via Firebase AI Logic)',
        ms: out.ms,
        findings: entities.map((e) => ({ type: e.type, value: e.value, tag: tags.tagOf(e) })),
      });
    } catch (e) {
      sendResponse({ ok: false, error: `${(e as Error).name}: ${(e as Error).message}`, model: 'Gemini Nano (Chrome built-in AI)' });
    }
  })();
  return true;
});

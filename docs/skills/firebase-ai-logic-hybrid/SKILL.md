---
name: firebase-ai-logic-hybrid
description: "Complete engineering guide for Firebase AI Logic hybrid on-device + cloud inference on the web (https://developer.chrome.com/docs/ai/firebase-ai-logic and firebase/ai in firebase@13.x / @firebase/ai@3.x). Use when configuring getAI, GoogleAIBackend, AgentPlatformBackend, getGenerativeModel with HybridParams, InferenceMode (ONLY_ON_DEVICE, PREFER_ON_DEVICE, PREFER_IN_CLOUD, ONLY_IN_CLOUD), InferenceSource, initializeDeviceModel, dual structured JSON output (responseJsonSchema + responseConstraint), App Check (reCAPTCHA Enterprise + localhost debug tokens), CSP headers, or mitigating firebase-js-sdk bug #10635. Triggers - 'Firebase AI Logic', 'firebase/ai', 'HybridParams', 'InferenceMode', 'InferenceSource', 'ONLY_ON_DEVICE', 'PREFER_IN_CLOUD', 'PREFER_ON_DEVICE', 'initializeDeviceModel', 'GoogleAIBackend', 'sdk bug 10635', 'device guard'."
---

# Firebase AI Logic — Hybrid On-Device & Cloud Inference (`firebase-ai-logic-hybrid`)

Source: Official Chrome & Firebase AI Logic documentation (<https://developer.chrome.com/docs/ai/firebase-ai-logic>, <https://firebase.google.com/docs/ai-logic/hybrid>) and the verified TypeScript definitions in `node_modules/@firebase/ai/dist/ai-public.d.ts` (`firebase@13.4.0` / `@firebase/ai@3.1.0`).
For Chrome's underlying `LanguageModel` (Prompt API), hardware/disk requirements, and `chrome://on-device-internals` debugging, use [`../chrome-built-in-ai/SKILL.md`](../chrome-built-in-ai/SKILL.md). For full `@firebase/ai` type signatures and the 4-layer device guard implementation, read [`./references/sdk-typings-and-guard.md`](./references/sdk-typings-and-guard.md).

---

## 1. Exact Web SDK Setup (`firebase/ai` + Mandatory App Check)

- **Minimum version:** `firebase >= 12.14.0` (where `initializeDeviceModel` reached GA); **`firebase@^13.4.0` (`@firebase/ai@3.1.0`) recommended**.
- **Do not guess SDK symbols.** Verified exports in `firebase/ai`:
  `getAI`, `getGenerativeModel`, `GoogleAIBackend`, `AgentPlatformBackend` *(replaced `VertexAIBackend` in v13.0)*, `InferenceMode`, `InferenceSource`, `Schema`, `AIError`, `AIErrorCode`.
- **Enable AI Logic on the project:** Run `npx -y firebase-tools@latest init ailogic --project <project-id>`. Without enabling the API, cloud requests fail with `PERMISSION_DENIED` / `AIErrorCode.API_NOT_ENABLED`.
- **App Check is mandatory (enforced for AI Logic):**
  - **Warning from Chrome docs:** **Never** add `localhost` to your production reCAPTCHA Enterprise allowed domains—doing so allows anyone to run your app from their machine against your quota.
  - Instead, set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = cfg.appCheckDebugToken || true` **before** calling `initializeAppCheck`, gated strictly behind `import.meta.env.DEV`:

```ts
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, GoogleAIBackend } from 'firebase/ai';

if (import.meta.env.DEV) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
}

const app = initializeApp(firebaseConfig);
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY || 'debug-only'),
  isTokenAutoRefreshEnabled: true,
});

const ai = getAI(app, {
  backend: new GoogleAIBackend(), // Gemini Developer API (no Blaze billing required for free tier)
  useLimitedUseAppCheckTokens: true,
});
```

---

## 2. The Four `InferenceMode` Values & Their Real Runtime Behavior

All cloud calls go to `https://firebasevertexai.googleapis.com` regardless of whether `GoogleAIBackend` or `AgentPlatformBackend` is used. On-device calls never fetch an App Check token and make zero network requests.

| Constant | String Value | Exact SDK Behavior & Trap to Watch For |
| --- | --- | --- |
| `InferenceMode.ONLY_ON_DEVICE` | `'only_on_device'` | Runs on-device via Chrome's `LanguageModel`. Throws `AIError` (`api-not-enabled`) if `LanguageModel` exists in `self` but is unavailable. **CRITICAL BUG (`firebase-js-sdk #10635`, open):** If `'LanguageModel' in self` is `false` (Safari, Firefox, mobile, older Chrome, or disabled flag), the SDK **silently sends the request to the cloud** instead of throwing! Always wrap with the 4-layer Device Guard (Section 4). |
| `InferenceMode.PREFER_ON_DEVICE` | `'prefer_on_device'` | Uses on-device **only** when `LanguageModel.availability()` is `'available'`. While the model is `'downloading'` or `'downloadable'`, it silently falls back to the **cloud**. Never use `PREFER_ON_DEVICE` for private/unredacted data. |
| `InferenceMode.PREFER_IN_CLOUD` | `'prefer_in_cloud'` | Calls the cloud model first; falls back to on-device only when the cloud call throws `fetch-error`, `error`, or `api-not-enabled`. Note: It does not check `navigator.onLine` beforehand, so offline fallback happens after `fetch()` rejects. |
| `InferenceMode.ONLY_IN_CLOUD` | `'only_in_cloud'` | Cloud only; never uses on-device inference. |

- **Inspecting where a response actually ran:** Every `GenerateContentResult` reports `result.response.inferenceSource`, which equals `InferenceSource.ON_DEVICE` (`'on_device'`) or `InferenceSource.IN_CLOUD` (`'in_cloud'`).

---

## 3. Five Critical `HybridParams` Rules (Avoid Silent Misconfigurations)

When you call `getGenerativeModel(ai, hybridParams)` with `HybridParams` (`{ mode, inCloudParams, onDeviceParams }`):

1. **Top-level `model`, `generationConfig`, and `systemInstruction` are ignored.** Everything must go inside `inCloudParams` or `onDeviceParams`.
2. **`inCloudParams.model` is mandatory even for `ONLY_ON_DEVICE`!**
   - If `inCloudParams.model` is omitted, `getGenerativeModel` throws `AIError(AIErrorCode.NO_MODEL)`.
   - Use current cloud models (`gemini-3.8-flash` or the SDK hybrid default `gemini-3.5-flash-lite`; never use deprecated Gemini 2.x models).
3. **System prompts must be configured differently for device vs. cloud:**
   - `inCloudParams.systemInstruction` is **never** sent to Chrome's on-device model.
   - For on-device, pass `onDeviceParams.createOptions.initialPrompts`:
     ```ts
     initialPrompts: [{ role: 'system', content: [{ type: 'text', value: systemPrompt }] }]
     ```
   - Because Firebase AI Logic creates a **new Chrome `LanguageModel` session on every `generateContent()` call**, `initialPrompts` are re-evaluated each call—keep device system prompts short (1–2 sentences).
4. **Structured JSON output must be configured twice (`inCloudParams` AND `onDeviceParams`):**
   - Cloud ignores `responseConstraint`; on-device ignores `responseJsonSchema` / `responseSchema`. Set both:
     ```ts
     const params: HybridParams = {
       mode: InferenceMode.ONLY_ON_DEVICE,
       inCloudParams: {
         model: 'gemini-3.8-flash',
         generationConfig: {
           responseMimeType: 'application/json',
           responseJsonSchema: plainJsonSchema, // or responseSchema: Schema.object(...)
         },
       },
       onDeviceParams: {
         createOptions: {
           expectedInputs: [{ type: 'text', languages: ['en'] }],
           expectedOutputs: [{ type: 'text', languages: ['en'] }],
           initialPrompts: [{ role: 'system', content: [{ type: 'text', value: systemPrompt }] }],
         },
         promptOptions: {
           responseConstraint: plainJsonSchema, // or schema.toJSON()
         },
       },
     };
     ```
5. **Explicitly set `expectedInputs` / `expectedOutputs` to text-only unless you need multimodal images:**
   - In `@firebase/ai`, `LanguageModelCreateCoreOptions.expectedInputs` defaults to **image input + English text input** if not overridden (`ai-public.d.ts:1725`). Overriding `expectedInputs: [{ type: 'text', languages: ['en'] }]` ensures text-only tasks don't require image modality support.

---

## 4. Mandatory 4-Layer Device Guard for Private Steps (`firebase-js-sdk #10635`)

Whenever an application promises that a step runs **only on-device** (e.g., PII detection, clause minimization, routing, local answering), never call `model.generateContent()` directly. Route every private call through a 4-layer guard (as in `packages/ai/src/device-guard.ts`):

1. **Layer 1 — Pre-check `LanguageModel` & `availability()`:**
   Check `'LanguageModel' in globalThis` and `await LanguageModel.availability({ expectedInputs, expectedOutputs }) === 'available'` with the exact same options. If not `'available'`, throw `DeviceUnavailableError` immediately (**0 calls to `generateContent`**) and switch to local deterministic rules.
2. **Layer 2 — Cloud Network Tripwire (`withCloudTripwire`):**
   While a private step executes, wrap `globalThis.fetch` (supporting re-entrant depth counting) and reject any request whose URL contains `'firebasevertexai.googleapis.com'` with `PrivacyViolationError`, restoring `globalThis.fetch` in `finally`.
3. **Layer 3 — Post-check `InferenceSource.ON_DEVICE`:**
   After `generateContent()` returns, assert `result.response.inferenceSource === InferenceSource.ON_DEVICE`. If not, discard the response and throw `PrivacyViolationError`.
4. **Layer 4 — User-Gesture Model Initialization:**
   Trigger model download only inside a click handler via `await model.initializeDeviceModel((progress) => ...)` (or `LanguageModel.create({ monitor })`).

---

## 5. Firebase Hosting & Content-Security-Policy (CSP) Checklist

When deploying a Firebase AI Logic hybrid app to Firebase Hosting (`firebase.json`):
- **Allowed `connect-src` endpoints:**
  `'self' data: https://firebasevertexai.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebaseremoteconfig.googleapis.com https://firebaseinstallations.googleapis.com https://www.google.com https://www.recaptcha.net`
- **Allowed `script-src` & `frame-src` for App Check reCAPTCHA Enterprise:**
  - `script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`
  - `frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.recaptcha.net/`
- **`Permissions-Policy` header:**
  Set `camera=(), microphone=(), geolocation=()`, and **never** disable `language-model` in `Permissions-Policy`.

## 6. Verified facts (Firebase and Chrome docs, read 2026-11-23)

- **Requirements:** Firebase JS SDK 12.5.0+; desktop Chrome **139+**. On-device inference uses Chrome's Prompt API; cloud uses the Gemini Developer API (recommended, no-cost start) or Agent Platform.
- **Mode behaviour while the model downloads:** `ONLY_ON_DEVICE` waits (can take minutes); `PREFER_ON_DEVICE` and `PREFER_IN_CLOUD` go to the cloud; `ONLY_IN_CLOUD` always cloud.
- **On-device limits:** single-turn only (no chat); about **9,216 tokens**; text, or text plus JPEG/PNG images (needs `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`). Cloud-only: audio, video, PDF, file URLs, multi-turn chat, tools (function calling, code execution, URL context, Search/Maps grounding). Hybrid doesn't support the Live API, server prompt templates, or reliable token counting.
- **Default hybrid cloud model** (SDK 13): `gemini-3.5-flash-lite`. Name it explicitly with `inCloudParams.model`. Stable featured models (Nov 2026): `gemini-4-hydrogen` (Firebase's production example; no billing needed), `gemini-3.8-flash`, `gemini-3.5-flash-lite`. Never ship `-preview`, `-exp` or `-latest`.
- **Config is fixed per `GenerativeModel`:** to change the model or options, create a new instance.
- **Which on-device model:** the docs say "Gemini Nano" only. Google builds Gemini Nano 4 on Gemma 4 (Chrome component `gemma4_component`, behind the `gemma4-for-built-in-ai` flag); Chrome's default may be Nano 3 (`nano_v3_cpu_component`). Neither the SDK nor the Prompt API reports which model answered: say "Chrome's built-in model".
- **App Check:** enforced automatically for AI Logic since 2 Nov 2026. Use `useLimitedUseAppCheckTokens: true` in `getAI` for replay protection. Never add `localhost` to reCAPTCHA domains; use a debug token in development only.
- **Envoy's implementation is checked line by line in** `docs/FIREBASE_AI_LOGIC_REVIEW.md`.

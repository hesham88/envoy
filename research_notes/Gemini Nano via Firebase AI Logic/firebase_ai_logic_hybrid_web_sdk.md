# Firebase AI Logic hybrid (on-device + cloud) inference: Web SDK reference (as of 22 Nov 2026)

Sources read: the Firebase docs `.md.txt` pages (hybrid overview, hybrid/web/get-started, hybrid/web/configuration-options, hybrid/web/generate-structured-output, models, app-check), the JS release notes, the npm registry, the `firebase-js-sdk` source at tag `firebase@13.4.0` (`packages/ai/src`), GitHub issues and PRs, and Chrome's Prompt API page.

Note on doc structure: the old URLs `/docs/ai-logic/hybrid/get-started`, `/configuration-options` and `/limitations` no longer exist. They return an HTML shell. The pages are now per platform under `/docs/ai-logic/hybrid/web/...`. Limitations are no longer a separate page; they are the "Features not yet supported" section at the bottom of `hybrid/web/get-started`. Android and iOS have their own hybrid guides at `hybrid/android/...` and `hybrid/ios/...`, which are out of scope here — [Hybrid overview](https://firebase.google.com/docs/ai-logic/hybrid.md.txt); [hybrid llms.txt index](https://firebase.google.com/docs/ai-logic/hybrid/llms.txt).

Source shorthand: `SRC/` = https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/

---

## Q1. Exact imports and API surface in `firebase/ai`

### Takeaway
Use `import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource, Schema, AIError, AIErrorCode } from "firebase/ai"`. Call `getGenerativeModel(ai, { mode, inCloudParams?, onDeviceParams? })`. Then call `await model.initializeDeviceModel(progressCb?)` after a user gesture, and read `result.response.inferenceSource`. The enum values are lowercase strings (`'prefer_on_device'`, `'on_device'`), so always compare against the constants, never string literals.

### Cited Findings
**Initialization (docs code, verbatim)**
- The docs' imports are `import { initializeApp } from "firebase/app"; import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";`. The model is created with `const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() }); const model = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE });` — [hybrid/web/get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt).
- `getAI(app = getApp(), options?: AIOptions)`: the backend defaults to `new GoogleAIBackend()` if omitted — [SRC/api.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/api.ts).
- The other backend is now `AgentPlatformBackend`. `VertexAIBackend` and `BackendType.VERTEX_AI` were removed in 13.0.0, after being deprecated in 12.17.0. `AgentPlatformBackend` defaults to location `global`; use `new AgentPlatformBackend('us-central1')` to pin a region — [JS release notes 13.0.0 / 12.17.0](https://firebase.google.com/support/release-notes/js.md.txt).

**`getGenerativeModel(ai, modelParams: ModelParams | HybridParams, requestOptions?)`** — [SRC/api.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/api.ts)
- Hybrid mode is detected by the presence of `mode`. If `mode` is set, any top-level key other than `mode`, `onDeviceParams` or `inCloudParams` (for example `model`, `generationConfig`, `systemInstruction` or `tools`) is **ignored**, and the SDK logs `logger.warn` "...cannot be configured at the top level. Configuration for in-cloud and on-device must be done separately in inCloudParams and onDeviceParams..." This warning arrived via PR #9577 — [SRC/api.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/api.ts); [PR #9577](https://github.com/firebase/firebase-js-sdk/pull/9577).
- If `inCloudParams` is omitted, it defaults to `{ model: DEFAULT_HYBRID_IN_CLOUD_MODEL }`, which is `'gemini-3.5-flash-lite'`. **If you pass `inCloudParams` without `model`, the SDK throws** `AIError(NO_MODEL, "Must provide a model name...")`. It does not fill in the default — [SRC/api.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/api.ts); [SRC/constants.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/constants.ts).
- `HybridParams` is `{ mode: InferenceMode; onDeviceParams?: OnDeviceParams; inCloudParams?: ModelParams }` — [SRC/types/requests.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/types/requests.ts).
- `OnDeviceParams` is `{ createOptions?: LanguageModelCreateOptions; promptOptions?: LanguageModelPromptOptions }`. **There is no model-selection field** — [SRC/types/requests.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/types/requests.ts).

**`InferenceMode`** (const map plus a string-literal type) — [SRC/types/enums.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/types/enums.ts)
- `PREFER_ON_DEVICE: 'prefer_on_device'`, `ONLY_ON_DEVICE: 'only_on_device'`, `ONLY_IN_CLOUD: 'only_in_cloud'`, `PREFER_IN_CLOUD: 'prefer_in_cloud'`.
- The docs describe each mode as follows — [hybrid/web/configuration-options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options.md.txt):
  - `PREFER_ON_DEVICE`: on-device if available, otherwise fall back to cloud.
  - `ONLY_ON_DEVICE`: on-device if available, otherwise throw.
  - `PREFER_IN_CLOUD`: cloud if available, otherwise fall back to on-device.
  - `ONLY_IN_CLOUD`: cloud if available, otherwise throw.
- `PREFER_IN_CLOUD` was added in 12.3.0 — [release notes 12.3.0](https://firebase.google.com/support/release-notes/js.md.txt).
- The docs use `InferenceMode.INFERENCE_MODE` and `"GEMINI_MODEL_NAME"`/`"CLOUD_MODEL_NAME"` as **placeholders**. They are not real members or names — [configuration-options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options.md.txt).

**Exact fallback semantics, from source** (`callCloudOrDevice`) — [SRC/requests/hybrid-helpers.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/requests/hybrid-helpers.ts); [SRC/methods/chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/methods/chrome-adapter.ts)
- **No adapter, which happens whenever `globalThis.LanguageModel` is missing** (Safari, Firefox, mobile, older Chrome, Web Workers): the request **always goes to the cloud, whatever the mode** (see the ONLY_ON_DEVICE bug in Q4).
- `ONLY_ON_DEVICE`: `isAvailable()` behaves as follows:
  - Availability `'unavailable'`: throws `AIError(API_NOT_ENABLED, 'Local LanguageModel API not available in this environment.')`.
  - `'downloadable'`/`'downloading'`: awaits the pending `downloadPromise` and then runs on-device.
  - `isOnDeviceRequest()` (the MIME and functionResponse checks) is **not** applied in this mode.
- `PREFER_ON_DEVICE`: runs on-device only if availability is exactly `'available'` **and** `isOnDeviceRequest()` passes. That check requires non-empty contents, no `functionResponse` parts, and inline images of `image/jpeg`/`image/png` only. Otherwise the request goes to the cloud, so `'downloading'` means cloud.
- `PREFER_IN_CLOUD`: tries the cloud first. It falls back to on-device **only** if the cloud error is an `AIError` with code `FETCH_ERROR`, `ERROR` or `API_NOT_ENABLED` **and** the on-device model is available. Other errors, such as quota or 4xx `RESPONSE_ERROR`-type errors, are re-thrown.
- `ONLY_IN_CLOUD`: always cloud. `initializeDeviceModel()` is a no-op.

**`initializeDeviceModel()`** — [SRC/models/generative-model.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/models/generative-model.ts)
- Signature: `async initializeDeviceModel(onDownloadProgress?: (progressValue: number) => void): Promise<void>`. `progressValue` runs from 0 to 1 and comes from Chrome's `downloadprogress` event `e.loaded`. **The callback is ignored if `onDeviceParams.createOptions.monitor` is set.**
- It returns immediately (resolves void) if there is no adapter or the mode is `ONLY_IN_CLOUD`.
- If availability is `'unavailable'`, it throws `AIError(API_NOT_ENABLED, ...)` **only in `ONLY_ON_DEVICE` mode**; other modes just log at debug level. It then awaits the download promise, which resolves when Chrome's `LanguageModel.create()` resolves.
- If the model is already `'available'`, no download is started and it resolves right away. This follows from `downloadIfAvailable()` calling `create()` only for `'downloadable'`/`'downloading'`.
- JSDoc: "IMPORTANT: This call must be made on or after a user has interacted with the page (for example, through a button click or key press). If it is called without a user interaction, and it requires a download, this will cause an error."
- Docs: "You must call `initializeDeviceModel()` *after or on* an end-user page interaction (like a button click) and *before* you send a prompt request to the model." The docs example is `model.initializeDeviceModel((val) => console.log(\`Download progress: ${Math.round(val*10000) / 100}%\`));` — [hybrid/web/get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt).
- Behaviour when you call `generateContent()` before the download completes — [get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt):
  - `ONLY_ON_DEVICE`: waits for the download, which can take several minutes.
  - `PREFER_*`: does not wait; falls back to cloud.
  - `ONLY_IN_CLOUD`: cloud.
- History: added in **12.14.0** (28 May 2026) as a breaking change at hybrid GA. Before that, the SDK triggered `LanguageModel.create()` (the download) implicitly inside `generateContent()` — [release notes 12.14.0](https://firebase.google.com/support/release-notes/js.md.txt); [PR #9800](https://github.com/firebase/firebase-js-sdk/pull/9800).

**`onDeviceParams.createOptions`** (`LanguageModelCreateOptions`) — [SRC/types/language-model.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/types/language-model.ts)
- Fields: `expectedInputs?: LanguageModelExpected[]`, `expectedOutputs?: LanguageModelExpected[]`, `monitor?: (m: LanguageModelDownloadMonitor) => void`, `signal?: AbortSignal`, `initialPrompts?: LanguageModelMessage[]`.
- `LanguageModelExpected` is `{ type: 'text'|'image'|'audio'; languages?: string[] }`.
- `LanguageModelMessage` is `{ role: 'system'|'user'|'assistant'; content: { type, value }[] }`.
- `topK` and `temperature` were deprecated in 12.12.0 and **removed in 13.0.0** — [release notes 12.12.0 / 13.0.0](https://firebase.google.com/support/release-notes/js.md.txt).
- SDK defaults — [SRC/methods/chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/methods/chrome-adapter.ts):
  - `expectedInputs = [{type:'text', languages:['en']}, {type:'image'}]`
  - `expectedOutputs = [{type:'text', languages:['en']}]`
  - The defaults are applied per field only when that field is missing. **If you supply `expectedInputs`, the default image entry is dropped.**
  - The constructor assigns your `onDeviceParams` object by reference and mutates it.
- Docs example: `onDeviceParams: { createOptions: { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }], initialPrompts: [{ role: "system", content: [{ type: "text", value: "You are a helpful and concise assistant." }] }] } }` — [configuration-options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options.md.txt).

**`onDeviceParams.promptOptions`** (`LanguageModelPromptOptions`) — [SRC/types/language-model.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/types/language-model.ts)
- Only `responseConstraint?: object` is defined; AbortSignal is a TODO in the source. The same object is passed to `session.prompt(contents, promptOptions)` and `session.promptStreaming(...)` on **every** request — [SRC/methods/chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/methods/chrome-adapter.ts).

**`inCloudParams`**
- `inCloudParams` is a normal `ModelParams`: `model`, `generationConfig`, `safetySettings`, `tools`, `toolConfig`, `systemInstruction`. Docs example: `inCloudParams: { model: "GEMINI_MODEL_NAME", generationConfig: { maxOutputTokens: 200, stopSequences: ["red"] } }` — [configuration-options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options.md.txt).
- "The configuration is maintained for the lifetime of the instance. If you want to use a different config, create a new `GenerativeModel` instance" — [configuration-options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options.md.txt).

**`inferenceSource`**
- `inferenceSource` is on each response (`result.response.inferenceSource`). The docs say it was "available starting with JS SDK v12.5.0" and that "the returned value will be either `ON_DEVICE` or `IN_CLOUD`" — [configuration-options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options.md.txt).
- Runtime values are lowercase: `InferenceSource = { ON_DEVICE: 'on_device', IN_CLOUD: 'in_cloud' }`. The field type is `inferenceSource?: InferenceSource` on the response — [SRC/types/enums.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/types/enums.ts); [SRC/types/responses.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/types/responses.ts). Issue #10635 shows the printed value `"in_cloud"` — [issue #10635](https://github.com/firebase/firebase-js-sdk/issues/10635).
- Fixed in 12.7.0: "`generateContentStream()` returning the wrong `inferenceSource`" — [release notes 12.7.0](https://firebase.google.com/support/release-notes/js.md.txt).

**Errors.** `AIError extends FirebaseError`. `e.code` is the bare code string, and `e.message` is `"AI: <msg> (AI/<code>)"` — [SRC/errors.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/errors.ts). The relevant `AIErrorCode` values are — [SRC/types/error.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/types/error.ts):
- `ERROR: 'error'`
- `REQUEST_ERROR: 'request-error'`
- `RESPONSE_ERROR: 'response-error'`
- `FETCH_ERROR: 'fetch-error'`
- `API_NOT_ENABLED: 'api-not-enabled'`
- `ALREADY_INITIALIZED: 'already-initialized'`
- `INVALID_SCHEMA: 'invalid-schema'`
- `NO_MODEL: 'no-model'`
- `UNSUPPORTED: 'unsupported'`

### Inferences
- Robust check: `result.response.inferenceSource === InferenceSource.ON_DEVICE`. Comparing against the literal `'ON_DEVICE'` from the docs prose will never match.
- The docs' description of `ONLY_IN_CLOUD` as "otherwise throw an exception" just means cloud errors propagate; there is no device fallback.
- The docs note says that in `ONLY_IN_CLOUD`, "the request will automatically fall back to use the cloud-hosted model". That is loose wording: the request is cloud-only.
- Because `initializeDeviceModel()` resolves silently when there is no adapter, its resolving is **not** evidence that on-device inference is possible. Check `'LanguageModel' in self` and `await LanguageModel.availability(...)` yourself if your UI needs to know.

### Gaps
- Whether `initializeDeviceModel()` called before a user gesture surfaces Chrome's `NotAllowedError` directly or wrapped. The source does not wrap `create()` rejections in `downloadIfAvailable`, so it is probably the raw DOMException, but this was not tested.
- In `ONLY_ON_DEVICE`, download failures are wrapped as `AIError(ERROR, e.message)`.

---

## Q2. Minimum and latest firebase JS SDK versions; hybrid-related release history

### Takeaway
The docs state v12.5.0+ as the minimum. For code written against today's docs and API, treat **12.14.0** as the practical floor (when `initializeDeviceModel()` and GA arrived) and **13.0.0+** as recommended (new default model, `type`-discriminated `Part`). Latest on npm is **`firebase@13.4.0`** (16 Nov 2026), and the AI package is `@firebase/ai@3.1.0`.

### Cited Findings
- Docs: "on-device inference via Firebase AI Logic is supported for web apps using Firebase AI Logic SDK v12.5.0+ and running on Chrome on Desktop (version 139 or higher)" — [hybrid/web/get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt).
- npm dist-tags: `latest: '13.4.0'`, `next: '13.4.0-20261116185243'`. `@firebase/ai` is `latest: '3.1.0'` — [npm registry: firebase](https://registry.npmjs.org/firebase); [npm registry: @firebase/ai](https://registry.npmjs.org/@firebase/ai).
- Release dates from npm — [npm registry](https://registry.npmjs.org/firebase):
  - 12.5.0: 30 Oct 2025
  - 12.14.0: 28 May 2026
  - 13.0.0: 7 Oct 2026
  - 13.1.0: 21 Oct 2026
  - 13.2.0: 2 Nov 2026
  - 13.3.0: 11 Nov 2026
  - 13.4.0: 16 Nov 2026
- Hybrid timeline from the JS release notes ([release notes](https://firebase.google.com/support/release-notes/js.md.txt)):
  - **12.1.0** (7 Aug 2025): "Added hybrid inference options to AI Logic" (Prompt API).
  - **12.2.0**: limited-use App Check tokens added; `ChromeAdapterImpl` excluded from the Node entry point.
  - **12.3.0**: `PREFER_IN_CLOUD` added; hybrid moved from "experimental" to "public preview".
  - **12.5.0**: `inferenceSource` (determine which mode was used); "Fixed logic for merging default `onDeviceParams` with user-provided `onDeviceParams`".
  - **12.7.0**: fixed wrong `inferenceSource` for `generateContentStream()`.
  - **12.8.0**: **Breaking**, default hybrid in-cloud model became `gemini-2.5-flash-lite`.
  - **12.11.0**: `responseJsonSchema` added to `GenerationConfig`.
  - **12.12.0**: deprecated `topK` and `temperature` for on-device; fixed an error when `responseSchema`/`responseJsonSchema` is set.
  - **12.14.0** (28 May 2026): "The hybrid inference feature using the Chrome Prompt API is now generally available." Added `initializeDeviceModel()`, "which must be called explicitly to initialize the on-device model before making any on-device inference calls."
  - **12.18.0**: "Fixed incorrect detection of `LanguageModel` that prevented usage of on-device models in Chrome Extensions." This came via PR #10248, which uses `getGlobal()` for Chrome Extension service workers.
  - **12.19.0**: fixed client validation that blocked `text/x.enum` with `responseSchema`/`responseJsonSchema`.
  - **13.0.0** (7 Oct 2026), all breaking:
    - Default hybrid in-cloud model is now `gemini-3.5-flash-lite`.
    - Removed `LanguageModelCreateCoreOptions.topK`/`.temperature`.
    - Removed `VertexAIBackend` (use `AgentPlatformBackend`).
    - `Part` became a discriminated union with explicit `type`.
    - `ChatSession` is exported as an interface.
    - Deprecated `candidateCount`, `temperature`, `topP`, `topK`, `presencePenalty`, `frequencyPenalty` in `GenerationConfig` ("unsupported in Gemini 3.x and later models").
  - **13.3.0** (11 Nov 2026): `getAI()` now throws `AIError` `already-initialized` if called again for the same app and backend with a different `useLimitedUseAppCheckTokens`; fixed `promptFeedback` always undefined for `GoogleAIBackend`.
  - **13.1.0, 13.2.0, 13.4.0**: no AI Logic entries.
- The docs' image example builds parts as `{ type: "inlineData", inlineData: { data, mimeType } }`. That is the 13.x discriminated-`Part` shape — [get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt); [release notes 13.0.0](https://firebase.google.com/support/release-notes/js.md.txt).
- PR #10248, "support Chrome Extension Service Workers in ChromeAdapter via getGlobal()", was merged in Aug 2026 — [GitHub PR search](https://github.com/firebase/firebase-js-sdk/pull/10248).

### Inferences
- Older tutorials are outdated. Blog posts before May 2026 lack `initializeDeviceModel()`, and posts before 13.0.0 show `gemini-2.x` defaults, `VertexAIBackend`, or on-device `temperature`/`topK`.
- Pin `firebase@^13.4.0`. `@firebase/ai@3.x` corresponds to `firebase@13.x`.

### Gaps
- No Firebase blog post on hybrid GA was checked. The release notes and docs were treated as authoritative.

---

## Q3. Structured output on-device vs cloud

### Takeaway
For a hybrid model you must configure structured output **twice**:
- cloud: `inCloudParams.generationConfig.{ responseMimeType, responseSchema }`
- device: `onDeviceParams.promptOptions.responseConstraint`

The same `Schema.*` object, or a plain JSON-schema object, can be passed to both. The on-device adapter ignores the cloud `generationConfig` completely.

### Cited Findings
- "**For on-device models**: Specify the `responseConstraint` in `onDeviceParams` using either a schema created with `Schema` helper methods or a plain JSON schema. **For cloud-hosted models**: Specify the `responseMimeType` (`application/json` for JSON or `text/x.enum` for enums) and the `responseSchema` in `inCloudParams`." — [hybrid/web/generate-structured-output](https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output.md.txt).
- JSON example (verbatim structure) — [generate-structured-output](https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output.md.txt):
  - Schema: `const jsonSchema = Schema.object({ properties: { characters: Schema.array({ items: Schema.object({ properties: { name: Schema.string(), age: Schema.number(), species: Schema.string(), accessory: Schema.string() }, optionalProperties: ["accessory"] }) }) } });`
  - Model: `getGenerativeModel(ai, { mode: ..., inCloudParams: { model: "CLOUD_MODEL_NAME", generationConfig: { responseMimeType: "application/json", responseSchema: jsonSchema } }, onDeviceParams: { promptOptions: { responseConstraint: jsonSchema } } })`
  - Reading the result: `JSON.parse(result.response.text())`.
- Enum example: `Schema.enumString({ enum: ["drama", "comedy", "documentary"] })`, with `responseMimeType: "text/x.enum"` for cloud and the same object as `responseConstraint` for the device. The plain-JSON equivalent is `{ type: "string", enum: [...] }` — [generate-structured-output](https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output.md.txt).
- The docs show plain JSON schemas using OpenAPI-style `nullable: true/false` plus `required: [...]` — [generate-structured-output](https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output.md.txt).
- Client-side validation in `GenerativeModel` — [SRC/models/generative-model.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/models/generative-model.ts):
  - It throws `AIError(UNSUPPORTED)` if both `responseSchema` and `responseJsonSchema` are set.
  - It throws if either is set without `responseMimeType` of `'application/json'` or `'text/x.enum'`.
- **On-device ignores `responseJsonSchema` today.** Open PR #9900, "feat(ai): honor responseJsonSchema in chrome adapter", would map `request.generationConfig.responseJsonSchema` to `responseConstraint`. It is not merged — [PR #9900](https://github.com/firebase/firebase-js-sdk/pull/9900).
- The on-device `generateContent` passes only `this.onDeviceParams.promptOptions` to `session.prompt()`. No per-request `generationConfig` reaches Chrome — [SRC/methods/chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/methods/chrome-adapter.ts).
- Chrome Prompt API: "Add the `responseConstraint` field to `prompt()` or `promptStreaming()` method to pass a JSON Schema". It also has an `omitResponseConstraintInput` option, so the schema is not added to the context; with that option Chrome recommends including guidance in the prompt — [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api).
- The supported on-device capabilities include "Generating structured output, including JSON and enums" — [get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt).

### Inferences
- Because `promptOptions` lives on the model instance, each distinct schema needs its own `GenerativeModel` instance. Create one model per task type.
- `omitResponseConstraintInput` is not in the SDK's `LanguageModelPromptOptions` TypeScript type, but the object is passed through to Chrome as-is. It would probably work with a type cast. This is untested.
- Firebase `Schema` objects serialize with OpenAPI-subset fields such as `nullable` and `optionalProperties` → `required`. Chrome expects JSON Schema. The docs say both work for `responseConstraint`, but keep schemas simple: objects, arrays, strings, numbers, enums.

### Gaps
- There is no documented list of JSON-Schema keywords that Chrome's constraint decoder rejects, and no documented size limit for schemas (the schema counts toward the on-device token budget unless omitted).

---

## Q4. On-device limitations, and what `ONLY_ON_DEVICE` does when unavailable

### Takeaway
On-device inference is limited to:
- single-turn text generation, streaming or not
- text or text plus JPEG/PNG inline images
- structured output
- a 9216-token limit
- Chrome desktop only, with no chat, tools, URL files, audio, video, PDF or countTokens

There is a known open bug: `ONLY_ON_DEVICE` **silently sends the prompt to the cloud** when `LanguageModel` is missing. When the API exists but reports unavailable, it throws `AIError` with code `'api-not-enabled'`.

### Cited Findings
**Docs: supported and unsupported features** — [hybrid/web/get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt)
- Supported: "On-device inference only supports **single-turn text generation (*not* chat)** (with streaming or non-streaming output)": text-only input; text plus image input ("JPEG and PNG"); structured output (JSON and enums).
- "**Important:** For on-device inference, the maximum token limit is 9216 tokens."
- Not supported on-device. Most of these can fall back to cloud in `PREFER_ON_DEVICE`, "however, `ONLY_ON_DEVICE` mode will throw an error":
  - image generation (Nano Banana)
  - image types other than JPEG/PNG
  - audio, video or PDF input
  - multi-turn chat
- Also not supported on-device:
  - files by URL ("You must provide files as inline data to on-device models")
  - tools: function calling, code execution, URL context, Grounding with Google Search or Maps
- AI monitoring shows no data for on-device inference.
- Not supported for hybrid at all (device or cloud fallback): Gemini Live API, server prompt templates, and count tokens ("count will differ between cloud-hosted and on-device models").
- Requires "Chrome on Desktop (version 139 or higher) with the required flags enabled", and enough storage for the model download.
- Local setup flag: `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` set to **Enabled**, then restart. Check with `await LanguageModel.availability()`, which returns `available` / `downloading` / `downloadable`.

**Chrome Prompt API page** (last updated 21 Oct 2026) — [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- **Web availability: Chrome 148**. An "origin trial for sampling parameters" is also available in 148.
- Platforms: Windows 10/11, macOS 13+, Linux, ChromeOS on Chromebook Plus. **Not** supported on Chrome for Android, iOS, or non-Plus ChromeOS.
- Hardware: at least 22 GB free on the Chrome-profile volume; GPU with **strictly more than 4 GB VRAM**, or CPU with 16 GB+ RAM and 4+ cores; an unmetered connection for the download.
- Languages: `"en"`, `"ja"`, `"es"`, `"de"`, `"fr"`.
- Inputs: text, image and audio. Firebase only maps text and JPEG/PNG images.
- Token budget at runtime: `session.contextUsage` / `session.contextWindow`.
- **"The Prompt API isn't available in Web Workers."**
- Cross-origin iframes need `allow="language-model"`.
- `create()` requires user activation.

**Source-level behaviour**
- On-device `countTokens` always throws `AIError(REQUEST_ERROR, 'Count Tokens is not yet available for on-device model.')` — [SRC/methods/chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/methods/chrome-adapter.ts).
- Parts other than text or inlineData (for example `fileData` URLs) throw `AIError(REQUEST_ERROR, 'Processing of this Part type is not currently supported.')` during on-device conversion. `isOnDeviceRequest()` does not pre-screen `fileData`, so this may throw instead of falling back — [SRC/methods/chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/methods/chrome-adapter.ts).
- **`systemInstruction` and `generationConfig` never reach the device.** The on-device path maps only `request.contents` to `LanguageModelMessage[]`, with role `model`→`assistant` and everything else →`user`. Use `onDeviceParams.createOptions.initialPrompts` with `role: "system"` for a device-side system prompt — [SRC/methods/chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/methods/chrome-adapter.ts).
- **A new Chrome session is created for every request**, via `LanguageModel.create(createOptions)`, and the previous one is destroyed. Comment: "Firebase AI uses single-turn for all inference" — [SRC/methods/chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/methods/chrome-adapter.ts).
- Images are converted with `fetch(\`data:${mimeType};base64,${data}\`)` → `blob()` → `createImageBitmap()` — [SRC/methods/chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/methods/chrome-adapter.ts).

**`ONLY_ON_DEVICE` when unavailable**
- **API present, availability `'unavailable'`**: throws `AIError` with `code === 'api-not-enabled'` (`AIErrorCode.API_NOT_ENABLED`). The message is `"AI: Local LanguageModel API not available in this environment. (AI/api-not-enabled)"`. It is thrown from both `initializeDeviceModel()` and `generateContent()` — [SRC/models/generative-model.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/models/generative-model.ts); [SRC/methods/chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/methods/chrome-adapter.ts); [SRC/errors.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/errors.ts).
- The `AIError(UNSUPPORTED, 'Inference mode is ONLY_ON_DEVICE, but an on-device model is not available.')` in `callCloudOrDevice` is effectively unreachable, because `isAvailable()` throws or returns true in this mode — [SRC/requests/hybrid-helpers.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/requests/hybrid-helpers.ts); [PR #10643 description](https://github.com/firebase/firebase-js-sdk/pull/10643).
- **BUG, open [issue #10635](https://github.com/firebase/firebase-js-sdk/issues/10635)** (filed 16 Nov 2026 against 13.3.0, "also present on `main`"):
  - "In an environment without `LanguageModel`, the request goes to the cloud instead", because `chromeAdapterFactory()` returns `undefined` and `callCloudOrDevice()` then calls `inCloudCall()`. `countTokens()` is affected too.
  - The reporter's redaction app sent raw text to `firebasevertexai.googleapis.com`, and "`inferenceSource` was the only sign".
  - A Firebase maintainer (hsubox76) replied that they will do "a more comprehensive fix, as ... I've identified some issues with device/cloud selection deeper inside the architecture."
  - Open PR #10643 ("don't fall back to the cloud in ONLY_ON_DEVICE mode") would make `apiSettings.inferenceMode` the single source of truth. It would also make "requests made before `initializeDeviceModel()` throw a clear error" — [PR #10643](https://github.com/firebase/firebase-js-sdk/pull/10643).
  - PR #10643 notes this regressed with #10248: "previously it got [an adapter], and requests threw" — [PR #10643](https://github.com/firebase/firebase-js-sdk/pull/10643).

### Inferences
- **Workaround for privacy-critical `ONLY_ON_DEVICE`**:
  - Before any call, guard with `if (!('LanguageModel' in self) || (await LanguageModel.availability({ expectedInputs, expectedOutputs })) !== 'available') { /* refuse */ }`.
  - After each call, assert `result.response.inferenceSource === InferenceSource.ON_DEVICE`. Note that this only detects the leak after the data has been sent, so the pre-check is the real guard.
  - Alternatively, a CSP `connect-src` that omits `firebasevertexai.googleapis.com` on privacy-only pages hard-blocks any leak.
- The behaviour is likely to change in an upcoming release (PR #10643). In particular, a request before `initializeDeviceModel()` in `ONLY_ON_DEVICE` may start throwing, so always call `initializeDeviceModel()` first.
- **Version conflict:** Firebase says Chrome 139+ with a flag; Chrome's page says web availability starts at 148. My inference is that 139 to 147 needs the flag (localhost or dev), while 148+ works for real web users without flags, subject to hardware and download. Gate on runtime `LanguageModel.availability()`, not on the UA version.
- **Docs vs source on chat and tools (unverified):**
  - `ChatSession` passes the chrome adapter into the same `callCloudOrDevice`, and `isOnDeviceRequest()` does not reject multi-turn history or `tools`.
  - So under `PREFER_ON_DEVICE`, a `startChat()` turn or a request with `tools` (before any `functionResponse` exists) may run on-device. History would be flattened into Prompt API messages, and the tools would be silently ignored.
  - The docs say chat is "not supported" on-device.
  - Do not rely on either behaviour. Use a separate `ONLY_IN_CLOUD` model for chat and tools.
- Since `initialPrompts` are re-sent on every request (a new session each time), long system prompts add latency and eat into the 9216-token budget on every call.
- The default `expectedInputs` includes `{type:'image'}`. Availability checks therefore ask Chrome for multimodal support, which is probably why the docs require the `...multimodal-input` flag (inference). A text-only `expectedInputs` override may report available on more machines but disables on-device images.
- Text with non-English input or output: set `languages` to one of `en/ja/es/de/fr`, otherwise availability may be `'unavailable'` (inference from Chrome's language list).

### Gaps
- The 9216-token figure appears only on the Firebase page. Chrome's page gives no number, so read `session.contextWindow` at runtime if needed (the Firebase SDK does not expose the session).
- No SDK-level abort or timeout for on-device prompts: `promptOptions` has no `signal`, and `AbortSignal` support (12.8.0) applies to cloud fetches.

---

## Q5. Cloud models: current list, hybrid default, recommended Flash and Flash-Lite

### Takeaway
The hybrid default cloud model is **`gemini-3.5-flash-lite`** (since 13.0.0). The current featured models are:
- `gemini-4-hydrogen` (flagship efficiency)
- `gemini-3.8-flash` (fast and intelligent)
- `gemini-3.5-flash-lite` (ultra fast)

All 2.x text models were shut down on 20 Oct 2026.

### Cited Findings
- "The default cloud-hosted model is `gemini-3.5-flash-lite` (starting with JS SDK v13.0.0). This model is the fallback cloud-hosted model when you use the `PREFER_ON_DEVICE` mode. It's also the default model when you use the `ONLY_IN_CLOUD` mode or the `PREFER_IN_CLOUD` mode." — [configuration-options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options.md.txt). The source matches: `DEFAULT_HYBRID_IN_CLOUD_MODEL = 'gemini-3.5-flash-lite'` — [SRC/constants.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/constants.ts).
- Featured models ("cost-effective, low-latency models that are ideal for in-app client tasks") — [models](https://firebase.google.com/docs/ai-logic/models.md.txt):
  - `gemini-4-hydrogen`: "FLAGSHIP EFFICIENCY", billing not required.
  - `gemini-3.8-flash`: "FAST AND INTELLIGENT", billing not required.
  - `gemini-3.5-flash-lite`: "ULTRA FAST", "High-volume, cost-sensitive workhorse", billing not required.
  - `gemini-nano-banana-2.1`: image generation, billing required.
- General-use model status table (Gemini Developer API / Agent Platform columns) — [models](https://firebase.google.com/docs/ai-logic/models.md.txt):
  - Gemini 4 family:
    - `gemini-4-hydrogen`: stable, 12 Nov 2026.
    - `gemini-4-neon`: 18 Nov 2026.
    - `gemini-4-carbon`: 10 Nov 2026.
    - `gemini-4-argon`: 13 Oct 2026.
  - Flash line:
    - `gemini-3.8-flash`: stable, 2 Sep 2026.
    - `gemini-3.7-flash`: requests routed to 3.8-flash on the Developer API; Agent Platform shutdown 28 Jan 2027.
    - `gemini-3.6-flash`: **Agent Platform shutdown 19 Nov 2026**; replacement 3.8-flash.
    - `gemini-3.5-flash`: routed to 3.6-flash on the Developer API; replacement 3.8-flash.
  - Flash-Lite and Pro preview:
    - `gemini-3.5-flash-lite`: stable, 21 Jul 2026, no shutdown date.
    - `gemini-3.1-flash-lite`: replacement 3.5-flash-lite.
    - `gemini-3.1-pro-preview`: replacement `gemini-4-hydrogen`.
- 2.x models — [models](https://firebase.google.com/docs/ai-logic/models.md.txt):
  - `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`: Agent Platform shutdown **20 Oct 2026**.
  - On the Developer API, 2.5-pro and 2.5-flash are "Requests routed to ... (starting December 1, 2026)": 2.5-pro goes to 3.8-flash and 2.5-flash goes to 3.5-flash-lite. 2.5-flash-lite shows a replacement of `gemini-3.5-flash-lite`.
- Version guidance: prefer stable models (no suffix); do not use `-latest` aliases; preview and experimental models are for prototyping only. A retired model returns 404 — [models](https://firebase.google.com/docs/ai-logic/models.md.txt).
- In `GenerationConfig`, `temperature`/`topP`/`topK`/`candidateCount`/penalties are deprecated as "unsupported in Gemini 3.x and later models" — [release notes 13.0.0](https://firebase.google.com/support/release-notes/js.md.txt).

### Inferences
- Recommended names for a hybrid app: keep the default `gemini-3.5-flash-lite` for the fallback, use `gemini-3.8-flash` when the Flash tier is needed, and use `gemini-4-hydrogen` for higher quality.
- Any code or notes naming `gemini-2.x`, `gemini-3.5-flash` or `gemini-3.6-flash` are outdated.

### Gaps
- Per-model free-tier rate limits were not captured, as they are not on the models page.

---

## Q6. App Check for AI Logic on web, and CSP endpoints

### Takeaway
App Check has been **auto-enforced for all projects since 2 Nov 2026**, so a production web app needs the reCAPTCHA Enterprise provider (or the debug provider on localhost). Optionally add `getAI(app, { backend, useLimitedUseAppCheckTokens: true })` (web 12.14.0+) and enforce replay protection. For CSP, the cloud path needs `firebasevertexai.googleapis.com`, `content-firebaseappcheck.googleapis.com`, the reCAPTCHA domains, and `data:` in `connect-src` for on-device images.

### Cited Findings
- "On November 2, 2026, Firebase automatically enforced Firebase App Check for Firebase AI Logic in all projects" — [app-check](https://firebase.google.com/docs/ai-logic/app-check.md.txt).
- Web provider: "**Web**: reCAPTCHA Enterprise" — [app-check](https://firebase.google.com/docs/ai-logic/app-check.md.txt).
- Debug provider:
  - Set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;` before `initializeAppCheck(firebaseApp, {...})`.
  - Register the console-printed token under App Check > Apps > Manage debug tokens.
  - "Do ***not*** try to enable `localhost` debugging by adding `localhost` to the allowed domains for reCAPTCHA."
  - Source: [hybrid/web/get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt).
- Limited-use tokens: `const ai = getAI(firebaseApp, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true });`. Replay protection needs "Web v12.14.0+". Each request mints a new limited-use token, which adds latency and sometimes cost. Enforce under Security > App Check > APIs > Firebase AI Logic > Set up > Replay protection (Monitoring only or Enforced). Default session tokens have a TTL between 30 min and 7 days — [app-check](https://firebase.google.com/docs/ai-logic/app-check.md.txt).
- 13.3.0 fix: a second `getAI()` with a different `useLimitedUseAppCheckTokens` now throws `AIError` `already-initialized`, where previously it silently replaced the option. Pass the option on the **first** `getAI()` call — [release notes 13.3.0](https://firebase.google.com/support/release-notes/js.md.txt); [SRC/api.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/api.ts).
- Request headers sent by the SDK: `x-goog-api-client`, `x-goog-api-key`, `X-Firebase-Appid`, `X-Firebase-AppCheck` — [SRC/requests/request.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/requests/request.ts).
- Hybrid requests (`PREFER_ON_DEVICE`/`PREFER_IN_CLOUD`) add a `hybrid` tag to the client logging header; `ONLY_IN_CLOUD` "does not indicate an intention to use hybrid" — [SRC/requests/request.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/requests/request.ts); [SRC/constants.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/constants.ts).
- **Endpoints for CSP:**
  - AI REST: `DEFAULT_DOMAIN = 'firebasevertexai.googleapis.com'`, called as `https://firebasevertexai.googleapis.com` with API version `v1beta`. The Live API uses `wss://firebasevertexai.googleapis.com`. Default fetch timeout is 180 s — [SRC/constants.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/constants.ts); [SRC/requests/request.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/requests/request.ts).
  - App Check exchange: `https://content-firebaseappcheck.googleapis.com/v1` — [app-check/src/constants.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/app-check/src/constants.ts).
  - reCAPTCHA scripts loaded by App Check: `https://www.google.com/recaptcha/enterprise.js` (Enterprise) and `https://www.google.com/recaptcha/api.js` (v3) — [app-check/src/recaptcha.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/app-check/src/recaptcha.ts).
  - reCAPTCHA CSP — [reCAPTCHA FAQ](https://docs.cloud.google.com/recaptcha/docs/faq):
    - script-src: `https://www.google.com/recaptcha/`, `https://www.gstatic.com/recaptcha/`
    - frame-src: `https://www.google.com/recaptcha/`, `https://recaptcha.google.com/recaptcha/`
    - connect-src: `https://www.google.com/recaptcha/`
    - Google recommends a nonce or `'strict-dynamic'` (CSP3).
  - **`data:` in `connect-src`**: on-device image prompts call `fetch('data:<mime>;base64,...')` — [SRC/methods/chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/methods/chrome-adapter.ts).

### Inferences
- Minimal CSP sketch for a bundled (npm) app:
  - `connect-src 'self' https://firebasevertexai.googleapis.com https://content-firebaseappcheck.googleapis.com https://www.google.com/recaptcha/ data:`
  - `script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`
  - `frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/`
  - Add `wss://firebasevertexai.googleapis.com` only if you use the Live API, which is unsupported in hybrid anyway.
  - If you load the SDK from the CDN (`https://www.gstatic.com/firebasejs/<ver>/...`), add that to script-src.
  - Other Firebase products (Auth, Analytics, Installations) need their own hosts.
- On-device inference makes no network calls to Firebase, but the first `LanguageModel.create()` triggers a browser-managed model download that CSP does not govern.

### Gaps
- No official Firebase page lists AI Logic CSP hosts. The list above comes from source constants and Google's reCAPTCHA FAQ.
- Not verified whether App Check token refresh calls other hosts (for example `firebaseinstallations.googleapis.com`). The App Check web SDK is not known to need Installations, but this is unconfirmed.

---

## Q7. Known issues, bugs and workarounds (`firebase/firebase-js-sdk`)

### Takeaway
The only open hybrid **bug** is #10635: `ONLY_ON_DEVICE` falls back to the cloud without `LanguageModel`. A maintainer-acknowledged fix is pending. The only open hybrid **feature gap** is PR #9900 (`responseJsonSchema` on-device). Past fixes cover Chrome-extension detection, the streaming `inferenceSource`, and `onDeviceParams` merging.

### Cited Findings
- **#10635, open**: "AI: ONLY_ON_DEVICE falls back to the cloud when the LanguageModel API is missing". Applies to Safari, Firefox, mobile and older Chrome. The maintainer is planning a deeper fix. Competing fix PRs #10636 and #10643 are both open — [issue #10635](https://github.com/firebase/firebase-js-sdk/issues/10635); [PR #10643](https://github.com/firebase/firebase-js-sdk/pull/10643).
- **PR #10643, open**: besides the ONLY_ON_DEVICE fix, it says that "in `ONLY_ON_DEVICE` mode, a request made before `initializeDeviceModel()` still started the model download indirectly through `LanguageModel.create()`, bypassing the explicit initialization added in #9800". The PR would make such requests throw — [PR #10643](https://github.com/firebase/firebase-js-sdk/pull/10643).
- **PR #9900, open since Apr 2026**: on-device does not honor `responseJsonSchema`. The workaround is to set `onDeviceParams.promptOptions.responseConstraint` explicitly — [PR #9900](https://github.com/firebase/firebase-js-sdk/pull/9900).
- Fixed in 12.18.0: "incorrect detection of `LanguageModel` that prevented usage of on-device models in Chrome Extensions" (PR #10248) — [release notes](https://firebase.google.com/support/release-notes/js.md.txt).
- Fixed in 12.7.0: wrong `inferenceSource` from `generateContentStream()` — [release notes](https://firebase.google.com/support/release-notes/js.md.txt).
- Fixed in 12.5.0: default and user `onDeviceParams` merge logic — [release notes](https://firebase.google.com/support/release-notes/js.md.txt).
- Fixed in 12.2.1: TypeScript compilation errors in 12.2.0 (issue #9231) — [release notes](https://firebase.google.com/support/release-notes/js.md.txt).
- The GitHub issue search for "hybrid", "on-device", "InferenceMode", "LanguageModel" and "initializeDeviceModel" (Nov 2026) returned no other open AI hybrid issues. Other relevant closed PRs are #9926 (GA tags), #9816 (deprecate topK/temperature for hybrid), #9577 (top-level-params warning) and #9469 (hybrid logging tag) — [GitHub search, firebase-js-sdk](https://github.com/firebase/firebase-js-sdk/issues?q=on-device).

### Inferences
- Workarounds to bake in:
  1. Pre-check `LanguageModel` and its availability yourself (see Q4).
  2. Always assert `inferenceSource`.
  3. Call `initializeDeviceModel()` from a click handler before the first request, and show its 0 to 1 progress.
  4. Put on-device system prompts in `initialPrompts`.
  5. Do not override `expectedInputs` unless you also include `{ type: 'image' }` when images are needed.
  6. Set `responseConstraint` for the device and `responseSchema` with `responseMimeType` for the cloud.
  7. Always include `model` when you pass `inCloudParams`.
  8. Use separate model instances per schema or mode.
  9. Keep the Prompt API on the main thread, not in a Web Worker.

### Gaps
- The GitHub search API hit rate limits partway through, and search via `gh` was flaky. Some lower-signal issues may have been missed.

---

## Q8. Can you choose which on-device model Chrome uses?

### Takeaway
No. Firebase AI Logic hybrid simply wraps Chrome's global `LanguageModel` (the Prompt API), and Chrome documents that this uses Gemini Nano with no developer model choice. The SDK has no parameter to select Gemini Nano versus a Gemma-based or other built-in model.

### Cited Findings
- "On-device inference uses the Prompt API from Chrome" — [hybrid/web/get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt).
- `chromeAdapterFactory()` reads `globalObj.LanguageModel` (where `globalObj` is `window` or `getGlobal()`) and creates `ChromeAdapterImpl` only if it exists and a mode is set. All calls go through `LanguageModel.availability/create/prompt/promptStreaming` — [SRC/methods/chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/methods/chrome-adapter.ts).
- `OnDeviceParams` has only `createOptions` (expectedInputs/expectedOutputs/initialPrompts/monitor/signal) and `promptOptions` (responseConstraint). There is no model field — [SRC/types/requests.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/types/requests.ts); [SRC/types/language-model.ts](https://github.com/firebase/firebase-js-sdk/blob/firebase%4013.4.0/packages/ai/src/types/language-model.ts).
- Chrome: "The Prompt API uses the Gemini Nano model in Chrome". Developers cannot choose alternative models — [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api).

### Inferences
- Whatever model version Chrome ships behind `LanguageModel` is what you get. Model updates are browser-managed, and output quality can shift with Chrome releases.
- To use a specific Gemma model in the browser, you would need a different stack (for example MediaPipe LLM Inference or WebLLM). That is outside Firebase AI Logic.

### Gaps
- Not checked: whether Chrome exposes any flag or experimental option to swap the backing model. The Chrome page says it does not.

# Gemini Nano via Firebase AI Logic

*Research for Envoy, the #BuildHybridAI 2026 entry. Compiled 2026-11-22 from four research notes in `research_notes/Gemini Nano via Firebase AI Logic/` plus the official contest rules. Sources for every claim are in those notes; the key links are listed at the end.*

## Summary

On the web, Firebase AI Logic's hybrid inference is a thin layer over **Chrome's built-in Prompt API** (`LanguageModel`). You choose *where* a request runs (`InferenceMode`), but **not which on-device model**: Chrome decides, and the API doesn't report it. The contest calls it "Gemini Nano 4". That name is official only for Android (April 2026, Gemma 4 based). In Chrome, the closest thing is the developer-trial flag `gemma4-for-built-in-ai`, which the owner already has enabled. The default is Gemini Nano "v3Nano".

Three findings change Envoy's build:

1. **A live SDK bug undermines "on-device only".** firebase-js-sdk issue **#10635**, open (verified on GitHub): with `ONLY_ON_DEVICE`, if the browser has no `LanguageModel` API (Safari, Firefox, mobile, older Chrome, workers), the request silently goes to the **cloud**. It was found in a redaction app like ours. Envoy needs its own pre-check and post-check.
2. **This laptop can probably run the model on the CPU, but only from a Chrome profile on a larger drive.** The C: drive (6 GB free) fails the 22 GB storage rule.
3. **Nano supports only English, Spanish, Japanese, German and French.** The owner's decision to go English-only fits.

## 1. The web SDK, exactly

- **Package:** `firebase@13.4.0` is current (16 Nov 2026), with `@firebase/ai@3.1.0`. Treat **12.14.0** as the real minimum (that's where `initializeDeviceModel` arrived at GA); **13.x is recommended**.
- **Imports** from `firebase/ai`: `getAI`, `getGenerativeModel`, `GoogleAIBackend`, `InferenceMode`, `InferenceSource`, `Schema`, `AIError`, `AIErrorCode`. (`VertexAIBackend` was removed in 13.0; use `AgentPlatformBackend` if ever needed.)
- **Model:** `getGenerativeModel(ai, { mode, inCloudParams, onDeviceParams })`. In hybrid mode, the top-level `model`, `generationConfig` and `systemInstruction` are **ignored**. `inCloudParams` **must include `model`**, or it throws `NO_MODEL`.
- **Modes**, compared via constants (the values are lowercase strings):

| Mode | Behaviour |
| --- | --- |
| `ONLY_ON_DEVICE` | Device only. Throws `AIError` (`api-not-enabled`) if `LanguageModel` exists but is unavailable. **Goes to the cloud if `LanguageModel` is missing (bug #10635).** |
| `PREFER_ON_DEVICE` | Device only when availability is exactly `available`. While the model is downloading, it uses the **cloud**. |
| `PREFER_IN_CLOUD` | Cloud; falls back to the device only on `fetch-error`, `error` or `api-not-enabled`. It doesn't check `navigator.onLine`, so offline detection waits for the fetch to fail. |
| `ONLY_IN_CLOUD` | Cloud only. |

- **`initializeDeviceModel(onProgress?)`** returns `Promise<void>`. Progress runs 0→1. It must be called **on or after a user gesture**, and it starts a background download of several GB.
- **`response.inferenceSource`** is `InferenceSource.ON_DEVICE` / `IN_CLOUD`.
- **Device-side system prompt:** `systemInstruction` never reaches the device. Use `onDeviceParams.createOptions.initialPrompts` with `role: "system"`. The SDK creates **a new Chrome session per request**, so the initial prompts are re-processed on every call. Keep them short.
- **Structured output must be configured twice.** Cloud: `inCloudParams.generationConfig.{responseMimeType:"application/json", responseSchema}`. Device: `onDeviceParams.promptOptions.responseConstraint` (JSON Schema). The same `Schema.*` object works for both. `responseJsonSchema` is ignored on the device.
- **Device limits:**
  - Single-turn text, or text plus JPEG/PNG inline images.
  - **9,216 tokens** of context, shared by input and output.
  - No chat, tools, URL files, audio, video, PDF or `countTokens`.
  - Setting `expectedInputs` yourself drops the default image support.
- **Cloud models:**
  - The hybrid default is `gemini-3.5-flash-lite`. Also current: `gemini-3.8-flash` and `gemini-4-hydrogen`.
  - Don't use Gemini 2.x: it's shut down on Agent Platform and rerouted on the Developer API from 1 Dec.
  - Envoy pick: **`gemini-3.8-flash`** for reasoning (Flash-class), configurable through Remote Config.

## 2. The model inside Chrome, and this laptop

**Models:**
- Default: Gemini Nano "v3Nano". The GPU build is about 4.0 GB and the CPU build about 2.7 GB.
- `chrome://flags/#gemma4-for-built-in-ai` (since Canary 153) switches all built-in AI APIs to **Gemma 4 2B-IT** (~2.4 GB). Internally that's `model_version/v4`, the likely source of the "Nano 4" name.
- Nothing official says Gemma 4 is now the default. Only the **Broker state** tab in `chrome://on-device-internals` shows which model is installed.

**Eligibility:**
- Official rules: GPU **strictly more than 4 GB VRAM**, or **16 GB RAM and 4+ cores**; **22 GB free** on the profile's drive; an unmetered network for the download.
- Chromium's code is looser. A community source puts the CPU threshold at about 15,000 MiB, so this laptop's **15.9 GiB (about 16,280 MiB) likely passes**, and its 6 cores pass. The 4 GB GTX 1050 Ti fails the documented GPU rule.

| Check | Laptop | Verdict |
| --- | --- | --- |
| GPU path | GTX 1050 Ti, 4 GB | ✗ (documented) |
| CPU path | 15.9 GiB, 6 cores | ✓ likely |
| Storage | C: 6 GB free | ✗. Use `--user-data-dir=E:\ChromeEnvoy` (39.5 GB free) |
| Temp space | Download may need about 2× the model size in TEMP (usually C:) | ⚠ Point TEMP at E: or F: if the download fails |
| Chrome | 158 | ✓ |

**Turning it on in Chrome 158:**
1. Start Chrome with the E: profile.
2. In `chrome://settings/ai`, switch on **On-device AI**. Since Chrome 157 it's **off by default** in new Beta, Dev and Canary profiles, and while it's off every API reports `unavailable`.
3. Optional flags:
   - `#optimization-guide-on-device-model` → *Enabled BypassPerfRequirement* (confirmed to Chrome 154 only).
   - `#gemma4-for-built-in-ai`.
4. Verify in `chrome://on-device-internals`, and with `LanguageModel.availability()` in the console.

**Version conflict:**
- Firebase says Chrome 139+ with `#prompt-api-for-gemini-nano-multimodal-input` turned on.
- Chrome says the Prompt API is **stable for web pages from Chrome 148**.
- So test in a clean stable profile. Judges' Chrome may need no flags; the README should cover both cases.

## 3. How good Nano is at Envoy's jobs

- **There's no published evaluation of Chrome's Nano** on PII detection, clause picking, routing or extraction. Envoy has to measure it with its own eval set, which also makes a strong "proof, not claims" slide.
- **Proxies:**
  - A zero-shot 3B model beat Presidio at PII detection (F1 0.92 vs 0.82 on clean text).
  - But it **missed person names** more often than spaCy (0.78 vs 0.95) and produced unparseable JSON on 2.5% of messy inputs.
  - The best published results come from **regex + LLM hybrids** (RECAP), which supports Envoy's layered design.
- **PAPILLON confirmed:**
  - 85.5% quality with 7.5% leakage, but that's with **Llama-3.1-8B**.
  - The 1B and 3B models leaked **39.3% and 24.9%**, so the deck's "24–39%" is accurate. Leakage didn't simply fall with size: a 22B model leaked 27.4%.
- **Latency:**
  - Warm GPU: about 80–240 ms to first token, about 50 tokens/s.
  - The cold first call can take about 11 s; a dummy warm-up call cuts it to about 240 ms.
  - Field data (836 users): only 41% could run Nano; median 7.7 s per generation, p90 24 s.
  - There's no CPU data. Expect it to be noticeably slower on this laptop.
- **Prompting rules that apply** (Google's guidance plus the evidence):
  - One task per call, chained in code.
  - `##` and XML delimiters.
  - Short outputs.
  - Enum-constrained schemas for roles, routing labels and clause IDs.
  - **Drop any entity Nano returns that doesn't appear word for word in the source.**
  - Rotate few-shot examples, or use made-up names (small models copy example entities into answers).
  - Pre-filter text in JavaScript to save tokens and time.

## 4. Building, testing and shipping

- **App Check is mandatory.** It has been enforced for AI Logic since 2 Nov 2026. Web uses reCAPTCHA Enterprise, created by hand in the Cloud console (score-based, no localhost), plus debug tokens for localhost and CI. No Blaze plan is needed.
- **Offline:**
  - Once the model is downloaded, `ONLY_ON_DEVICE` makes no network call. The SDK's on-device path never fetches an App Check token.
  - The **page itself needs a service worker** to open offline (for example the Vite PWA plugin); Firebase Hosting has no offline mode.
- **Automated tests with the real model:**
  - Use Playwright with installed Chrome (`channel:'chrome'`), a dedicated profile that already holds the model, and `ignoreDefaultArgs` to remove Playwright's `--disable-features` (it disables `OptimizationHints`).
  - CI runners can't host the model (22 GB free disk), so use **stubs in CI** and run real-model evals locally.
- **Hosting:**
  - SPA rewrite, immutable `/assets/**`, `no-cache` for HTML and the service worker.
  - CSP allowing `firebasevertexai.googleapis.com`, `content-firebaseappcheck.googleapis.com`, the reCAPTCHA hosts (`www.google.com`, `www.gstatic.com`, `recaptcha.google.com`, `www.recaptcha.net`), plus `data:` in `connect-src`.
  - No `Permissions-Policy: language-model=()`.
- **CI/CD:** `firebase init hosting:github` creates the service account, the `FIREBASE_SERVICE_ACCOUNT_*` secret, and the merge and PR workflows (`FirebaseExtended/action-hosting-deploy@v0`). PR preview domains may need adding to the reCAPTCHA key.
- **Setup commands:**
  1. `firebase projects:create`
  2. `firebase apps:create WEB`
  3. `firebase init ailogic` (without it: `PERMISSION_DENIED`)
  4. `firebase init hosting`

## 5. Contest fit (official rules, read 2026-11-22)

- **Platform:** Web (Chrome) means a web app **or** a Chrome extension; it's one platform. Android, with Gemini Nano 4 via Firebase AI Logic, is a second; multi-platform is preferred for the Grand Prize.
- **Requirements:** App Check (debug tokens accepted); AI Logic called at runtime; a public repo with a license shown in the About section; a YouTube video of 3 minutes or less; an English description and a summary of what was built; **disclosure of pre-existing work and AI tools**; **no PII or secrets anywhere**.
- **Judging:** four equally weighted criteria, each scored 1–5, with Technological Implementation breaking ties. Judging may use automated AI review, so the README must make every claim easy to verify.

## 6. What Envoy should do (recommendations)

1. **Privacy guard around every private step:**
   - feature-detect `LanguageModel`;
   - require `availability()==='available'` for the exact `expectedInputs` used;
   - call with `ONLY_ON_DEVICE`;
   - **assert `inferenceSource===ON_DEVICE`**;
   - add a network tripwire that rejects requests to the cloud endpoint while a private step runs;
   - unit-test all of it, and show it in the Network inspector. That turns the SDK bug into a demo moment: *"we don't trust the default; we verify."*
2. **Layered detection:** regex and checksums first, then Nano JSON with enum roles and verbatim-match filtering, then user approval.
3. **Short, separate prompts per step** within the 9,216-token budget. Chunk and pre-filter clauses in code. Warm up after "Enable private mode".
4. **Cloud reasoning:** `PREFER_IN_CLOUD` + `gemini-3.8-flash` (via Remote Config); when offline, the lighter on-device answer, labelled as such.
5. **Firebase products:** AI Logic, App Check and Remote Config (prompts, model name, feature flags), plus Hosting with preview channels.
6. **Measure everything:** build the eval harness early, then tune the Nano prompts with the Harness² Propose–Probe–Compose loop and publish the numbers.
7. **Dev setup:** a Chrome profile on E:, on-device AI switched on, model state confirmed. Decide on day 1 whether the demo is recorded on this laptop or a stronger machine.

## Key sources

- Firebase hybrid docs: https://firebase.google.com/docs/ai-logic/hybrid · web get-started https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt · models https://firebase.google.com/docs/ai-logic/models.md.txt
- Firebase agent skills: https://firebase.google.com/docs/ai-assistance/agent-skills
- SDK bug: https://github.com/firebase/firebase-js-sdk/issues/10635 (fix PRs #10636, #10643, open)
- Chrome built-in AI: https://developer.chrome.com/docs/ai/get-started · https://developer.chrome.com/docs/ai/prompt-api
- PAPILLON (Li et al., NAACL 2025): https://arxiv.org/abs/2410.17127
- Harness² (Google Research, arXiv 2610.14224): https://github.com/google-research/harness2
- Contest rules: https://firebasehybridaihackathon.devpost.com/rules (saved in `docs/HACKATHON_RULES.md`)

# Dev, Test, and Hosting Pipeline for a Firebase AI Logic Hybrid (Gemini Nano + Cloud Gemini) Web App, as of November 2026

Confidence note: a small summarizer model read many of the fetched pages and returned excerpts, not raw HTML. Points that only that summarizer reported, with no second source, are marked "(low confidence)". Firebase CLI flags were checked locally against `firebase-tools` 15.37.0 (`npx -y firebase-tools@latest ... --help`, run 2026-11-22).

## 1. Automated testing: Playwright or Puppeteer with the real on-device model, plus unit-test mocking

### Takeaway
You can drive installed Chrome stable with the model available, but only after undoing the automation defaults that turn the model off:
- Playwright turns off the `OptimizationHints` feature.
- Puppeteer turns off component updates.

The profile must also already hold the roughly 4 GB `OptGuideOnDeviceModel/` weights. Chrome for Testing and bundled Chromium cannot fetch the model. Community setups have run headless with installed Chrome. Unit tests should stub `LanguageModel` or `firebase/ai` instead.

### Cited Findings
- **Playwright default flag.** Playwright disables Chrome's `OptimizationHints` feature by default, and the on-device model needs it. That default alone made `LanguageModel.availability()` report `unavailable` — [drow724/BrowserTradingAgents PR #3](https://github.com/drow724/BrowserTradingAgents/pull/3).
- **The drow724 setup.**
  - It uses `channel: 'chrome'` in headless mode and re-enables only `OptimizationHints`. It keeps Playwright's `--disable-component-update` and `--disable-background-networking`. Its default-args list is copied from playwright-core 1.63.0.
  - It reuses the downloaded model instead of downloading it again. It clones Chrome's existing `OptGuideOnDeviceModel/` directory into a per-run profile with `cp -c`, which is a macOS APFS zero-copy clone.
  - It writes a minimal `Local State` file that contains only the `optimization_guide.on_device` and `model_execution.manifest_asset_ledger` prefs.
  - Each run gets its own profile folder, keyed by `HARNESS_PORT`, so test sessions can run in parallel.
  - Source: [drow724 PR #3](https://github.com/drow724/BrowserTradingAgents/pull/3).
- **The PreventiveMeasures setup (third-party, unverified flags).**
  - It uses `channel: 'chrome'` with a scratch `user-data-dir` under `tmpdir()/preventive-ai/ai-chrome-*`.
  - It drops Playwright's own `--enable-features` through `ignoreDefaultArgs` and appends a replacement: "Playwright's `--enable-features` has to be dropped, not merged". The reason given is that Chrome reads the last occurrence of the flag.
  - The replacement flags are:
    - `--enable-features=CDPScreenshotNewSurface,OptimizationGuideOnDeviceModel,ModelVersion=v4`
    - a `--disable-features=...` list with `OptimizationHints` removed
    - `--use-angle=default`
    - `--force-device-performance-class=6`
    - `--optimization-guide-ondevice-model-execution-override=<weights dir>`
    - `--disable-component-update`
    - `--component-updater=url-source=http://127.0.0.1:1/`
  - Real-model tests are skipped on CI, poll for an answer for up to 2 minutes, and use a stub model for unit tests.
  - Source: [PreventiveMeasures/libraries PR #3](https://github.com/PreventiveMeasures/libraries/pull/3). These flags come from one community PR, not from Chrome documentation.
- **Puppeteer.**
  - The "Optimization Guide On Device Model" component does not load under Puppeteer because Puppeteer passes `--disable-component-update` by default.
  - A Puppeteer maintainer (OrKoN) suggested two things:
    - `ignoreDefaultArgs: ['--disable-component-update']`
    - `args: ['--enable-features=\'EnableAIPromptAPI,OptimizationGuideOnDeviceModel:compatible_on_device_performance_classes/*\'']`
  - The component still had to be updated by hand from `chrome://components`.
  - The issue was closed as "not planned" (Aug 2024, older information; the flag names come from the old `ai.assistant` API).
  - Source: [puppeteer/puppeteer #13011](https://github.com/puppeteer/puppeteer/issues/13011).
- **Chrome for Testing.**
  - Chrome for Testing is "a pinned, automation-only build with no auto-update" that "has no way to get the model on its own". `@browserless/ai` gets around this by packing the model on a normal Chrome machine and unpacking it into a directory that Chrome for Testing launches with.
  - Model files live in `OptGuideOnDeviceModel` (`weights.bin`, about 4 GB) and `optimization_guide_model_store` (per-API adaptations).
  - Gemini Nano can run on CPU with 16 GB RAM and 4+ cores. No GPU is needed.
  - Source: [microlink blog](https://microlink.io/blog/chrome-built-in-ai-from-nodejs).
- **Hardware requirements.** Built-in AI needs Windows 10/11, macOS 13+, Linux, or ChromeOS on Chromebook Plus. It needs at least 22 GB free on the volume that holds the Chrome profile. The first download needs an unmetered connection — [Chrome: Get started with built-in AI](https://developer.chrome.com/docs/ai/get-started).
- **States you can assert on in tests.** `LanguageModel.availability()` returns `unavailable`, `downloadable`, `downloading`, or `available` — [MDN Prompt API](https://developer.mozilla.org/en-US/docs/Web/API/Prompt_API); [Firebase hybrid web get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt).
- **Which path ran.** Each Firebase AI Logic response has an `inferenceSource` property (`ON_DEVICE` or `IN_CLOUD`), available from JS SDK v12.5.0 — [Firebase hybrid configuration options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options.md.txt). In the SDK, `callCloudOrDevice()` returns `{ response, inferenceSource }` — [firebase-js-sdk hybrid-helpers.ts](https://github.com/firebase/firebase-js-sdk/blob/main/packages/ai/src/requests/hybrid-helpers.ts).
- **Mocking libraries.** The Vercel AI SDK ships mock models in `ai/test` (for example `MockLanguageModelV4`). These apply only if you use that SDK, not Firebase AI Logic — [ai-sdk.dev testing](https://ai-sdk.dev/docs/ai-sdk-core/testing).

### Inferences
- **Recipe for this project (Windows).**
  - Use Playwright `chromium.launchPersistentContext(dir, { channel: 'chrome', ignoreDefaultArgs: [...] })`, where `dir` is a dedicated test profile that already holds the model.
  - Remove Playwright's default `--disable-features=...` argument through `ignoreDefaultArgs`, then append your own `--disable-features` list without `OptimizationHints`.
  - Download the model once by hand in that profile: open it in normal Chrome and check `chrome://on-device-internals`. After that, reuse the profile.
  - `cp -c` is macOS-only. On Windows, copy the profile folder or reuse one fixed profile.
- **Headless.** The drow724 PR reports that headless works with `channel: 'chrome'`. Plan to fall back to headed mode if `availability()` returns `unavailable` in headless.
- **CI.** Standard GitHub-hosted runners (about 14 GB SSD on ubuntu-latest) cannot meet the 22 GB free-disk requirement or download the model in a reasonable time. Run real-model end-to-end tests locally or on a self-hosted runner, and use stubs in CI.
- **Vitest (no primary source found; this is the usual pattern).** Two options:
  - Stub the browser API: `vi.stubGlobal('LanguageModel', { availability: vi.fn().mockResolvedValue('available'), create: vi.fn().mockResolvedValue({ prompt: vi.fn().mockResolvedValue('...'), promptStreaming: ..., destroy: vi.fn() }) })`.
  - Or mock the SDK: `vi.mock('firebase/ai', () => ({ getAI: vi.fn(), getGenerativeModel: () => ({ generateContent: vi.fn().mockResolvedValue({ response: { text: () => '...' }, inferenceSource: 'ON_DEVICE' }) }), InferenceMode: {...}, InferenceSource: {...} }))`.
  - Mocking your own wrapper module, for example `ai.ts`, is the most stable choice.
- **What to assert in end-to-end tests.** Check `inferenceSource` rather than the output text, because Nano's output is not deterministic.

### Gaps
- No official Chrome or Playwright documentation describes running the Prompt API under automation. All the recipes above come from community PRs and an issue from 2024.
- I could not get the exact contents of Playwright 1.63's default `--disable-features` list.
- There is no confirmed statement on whether the new headless mode supports the model in every configuration.
- I found no primary-source Vitest example that mocks `LanguageModel`.

## 2. Offline behavior: ONLY_ON_DEVICE and PREFER_IN_CLOUD

### Takeaway
- **ONLY_ON_DEVICE:** once the model is downloaded, generation makes no network call. The SDK only fetches the App Check token on the cloud request path.
- **PREFER_IN_CLOUD:** it does not check `navigator.onLine`. It falls back to the device only after the cloud call fails with `FETCH_ERROR`, `ERROR`, or `API_NOT_ENABLED`, so offline detection is as fast as that failure.
- **Loading the app:** a hosted SPA also needs a service worker, or the page itself will not load offline.

### Cited Findings
- **Chrome.** "The network requirement is only for the initial download of the model"; "Subsequent use of the model does not require a network connection" — [Chrome: Get started with built-in AI](https://developer.chrome.com/docs/ai/get-started).
- **Firebase.** On-device inference gives "Inference at no-cost" and "Offline functionality" — [Firebase hybrid web get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt).
- **Mode semantics.**
  - `ONLY_ON_DEVICE`: "Use the on-device model if it's available; otherwise, throw an exception". If the model is still downloading, the request "will wait until the download is complete".
  - `PREFER_ON_DEVICE` and `PREFER_IN_CLOUD`: "the request will not wait for the download to complete and will automatically fall back to use the cloud-hosted model".
  - Source: [Firebase hybrid web get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt).
- **Docs on PREFER_IN_CLOUD.** It uses the cloud model when online and falls back to on-device "only if the device is offline" — [Firebase hybrid docs](https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference) (search snippet).
- **SDK fallback code.** `errorsCausingFallback: AIErrorCode[] = [AIErrorCode.FETCH_ERROR, AIErrorCode.ERROR, AIErrorCode.API_NOT_ENABLED]`. The code comment calls these "most network errors", a catch-all code, and API-not-enabled — [hybrid-helpers.ts](https://github.com/firebase/firebase-js-sdk/blob/main/packages/ai/src/requests/hybrid-helpers.ts).
- **No online check.** `chrome-adapter.ts` never references `navigator.onLine`. In `PREFER_ON_DEVICE`, `isAvailable()` returns false unless availability is exactly `available`. In `ONLY_ON_DEVICE` it throws if the model is unavailable and waits if it is downloadable or downloading — [chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/main/packages/ai/src/methods/chrome-adapter.ts).
- **Order of operations in `generateContent`.** It calls `callCloudOrDevice(params, chromeAdapter, () => chromeAdapter!.generateContent(params), () => generateContentOnCloud(apiSettings, ...))`, so the device-or-cloud decision happens before any request is built — [generate-content.ts](https://github.com/firebase/firebase-js-sdk/blob/main/packages/ai/src/methods/generate-content.ts).
- **Where tokens are fetched.** `getAppCheckToken()` and `getAuthToken()` are awaited inside `getHeaders()`, which only `makeRequest()` uses. That is the cloud path. A `DEFAULT_FETCH_TIMEOUT_MS` applies when no timeout is given — [request.ts](https://github.com/firebase/firebase-js-sdk/blob/main/packages/ai/src/requests/request.ts).

### Inferences
- **ONLY_ON_DEVICE.** A generate call on the device path makes no network request and no App Check fetch. The page as a whole can still try the network:
  - `initializeAppCheck(..., { isTokenAutoRefreshEnabled: true })` refreshes tokens in the background.
  - The reCAPTCHA Enterprise script loads from `www.google.com`.
  - Firebase app initialization may make its own requests.

  These attempts fail quietly offline but do not block on-device calls. Consider calling `initializeAppCheck` lazily, or only when `navigator.onLine` is true.
- **PREFER_IN_CLOUD timing.** When the OS reports no network, `fetch` rejects almost at once (`net::ERR_INTERNET_DISCONNECTED`), so fallback is fast. On a captive portal or very poor connection, fallback waits for the request timeout.
- **Possible hang before the fetch.** Offline, the App Check `getToken()` call happens before the fetch, and the reCAPTCHA script may never load. That could delay the call or produce an error code outside the fallback list. For a predictable offline experience, check `navigator.onLine` yourself and switch to an `ONLY_ON_DEVICE` model instance, or use `PREFER_ON_DEVICE`.
- **Loading the app offline.** Firebase Hosting has no offline shell. Without a service worker that precaches `index.html`, JS, and CSS (for example `vite-plugin-pwa` or Workbox), an offline reload shows Chrome's offline error page before any on-device code runs. Without one, "works offline" holds only for a tab that is already open.

### Gaps
- The numeric value of `DEFAULT_FETCH_TIMEOUT_MS` was not visible in the fetched source.
- It is not confirmed how an offline App Check failure appears: whether the SDK continues with a dummy token and then gets `FETCH_ERROR`, or throws a different error.
- I found no published measurements of fallback latency.

## 3. Does on-device inference need App Check, a network call, or a secure context?

### Takeaway
On-device inference via Firebase AI Logic does not fetch an App Check token. Only the cloud path does. App Check is still mandatory for the cloud path: Firebase enforced it for all projects on 2 Nov 2026. The Prompt API requires a secure context (HTTPS), and `LanguageModel.create()` needs transient user activation. `initializeDeviceModel()` must be called on or after a user interaction.

### Cited Findings
- **Firebase enforcement.** "On November 2, 2026, Firebase automatically enforced Firebase App Check for Firebase AI Logic in all projects". "Requests from clients without a valid attestation will be rejected" — [Firebase AI Logic App Check](https://firebase.google.com/docs/ai-logic/app-check.md.txt).
- **Console setup.** From early July 2026, the Firebase console setup workflow enforces App Check automatically — [Firebase AI Logic App Check](https://firebase.google.com/docs/ai-logic/app-check) (search snippet).
- **Token path.** The App Check token is fetched only in `getHeaders()` and `makeRequest()`, which is the cloud path — [request.ts](https://github.com/firebase/firebase-js-sdk/blob/main/packages/ai/src/requests/request.ts); [generate-content.ts](https://github.com/firebase/firebase-js-sdk/blob/main/packages/ai/src/methods/generate-content.ts).
- **The adapter itself.** The Chrome adapter makes no network or auth calls before on-device use — [chrome-adapter.ts](https://github.com/firebase/firebase-js-sdk/blob/main/packages/ai/src/methods/chrome-adapter.ts).
- **Secure context and user activation.** "The Prompt API is restricted to secure contexts (HTTPS). Additionally, creation of `LanguageModel` objects requires transient user activation" — [MDN Prompt API](https://developer.mozilla.org/en-US/docs/Web/API/Prompt_API).
- **When to call `initializeDeviceModel()`.** It "must be called: (1) after or on an end-user page interaction such as a button click and (2) before any queries to the model" — [Firebase hybrid web get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt).
- **Firebase version requirements.** Chrome on desktop 139+, Firebase JS SDK v12.5.0+, and the flag `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` set to Enabled — [Firebase hybrid web get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt).
- **Version conflict.** The Chrome Prompt API page (updated 21 Oct 2026) says the Prompt API is stable for web pages in Chrome 148 (Chrome 138+ for extensions). It is not available in Web Workers — [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api). The Firebase page's flag requirement may predate Chrome 148, or may apply only to multimodal (image) input. Do not expect end users to change flags.
- **Default cloud model and on-device limits.**
  - The default cloud model is `gemini-3.5-flash-lite` from JS SDK v13.0.0 — [Firebase hybrid configuration options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options.md.txt).
  - The on-device token limit is 9216.
  - On-device does not support multi-turn chat, tools, audio, video, or PDF. Images must be PNG or JPEG.
  - Source: [Firebase hybrid web get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt).
- **Local development.** Use the App Check debug provider: `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;` before `initializeAppCheck`. "Do not try to enable localhost debugging by adding localhost to the allowed domains for reCAPTCHA" — [Firebase hybrid web get-started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.md.txt). The Google-authored Firebase skill recommends `self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;` for Vite. It also warns never to commit debug tokens; in CI, store a pre-registered debug token as a secret — [Google firebase-ai-logic-basics skill](https://raw.githubusercontent.com/davidkivuyo/foodorder/main/.agents/skills/firebase-ai-logic-basics/SKILL.md) (local copy in the Firebase Claude plugin, `references/usage_patterns_web.md`).

### Inferences
- `http://localhost` and `127.0.0.1` count as secure contexts under the web platform rules, so the Vite dev server (`localhost:5173`) and the Hosting emulator work. A LAN IP over plain HTTP, such as a phone testing a dev box, does not count.
- A fresh profile in automated tests has no user activation. Either trigger the download through a real Playwright `click()`, or use a profile where the model is already `available`. In that case `create()` should not need activation, because the activation requirement applies to the download.

### Gaps
- No Firebase document explicitly says "on-device inference does not need App Check". That conclusion comes from reading the SDK source.
- The status of the `#prompt-api-for-gemini-nano-multimodal-input` flag in Chrome 148+ is unconfirmed.

## 4. Firebase Hosting config for a Vite SPA: rewrites, caching, security headers, CSP, Permissions-Policy

### Takeaway
Use a standard SPA rewrite with these cache rules:
- `no-cache` for `index.html`.
- Immutable, one-year caching for hashed `/assets/**`.
- Explicit security headers.

A CSP for Firebase AI Logic plus reCAPTCHA Enterprise App Check must allow the reCAPTCHA script and frame hosts, plus the API hosts in `connect-src`. On-device inference needs no CSP entry. No Permissions-Policy header is needed, because `language-model` defaults to `self`. Just never send `language-model=()`.

### Cited Findings
- **SPA rewrite.** `"rewrites": [ { "source": "**", "destination": "/index.html" } ]`. The `headers` array takes glob `source` patterns, for example `"**/*.@(jpg|jpeg|gif|png)"` with `Cache-Control`.
- **Order Hosting applies rules in.** Reserved `/__/*`, then redirects, then exact-match static content, then rewrites, then the custom 404, then the default 404. Real files are served before the `**` rewrite.
- Source for both: [Firebase Hosting full-config](https://firebase.google.com/docs/hosting/full-config.md.txt).
- **reCAPTCHA CSP (official).** Google recommends a nonce-based CSP3 with `'strict-dynamic'`. Otherwise allow:
  - `script-src https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`
  - `frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/`
  - `connect-src https://www.google.com/recaptcha/`
  - No separate Enterprise variant is documented.
  - Source: [reCAPTCHA FAQ](https://developers.google.com/recaptcha/docs/faq).
- **A real Firebase AI Logic + App Check CSP (tranyx PR, 21 Nov 2026).**
  - The live CSP already allowed `www.google.com/recaptcha/`, `www.gstatic.com/recaptcha/`, `recaptchaenterprise.googleapis.com`, `content-firebaseappcheck.googleapis.com`, and `firebasevertexai.googleapis.com`.
  - Getting reCAPTCHA Enterprise to work required adding to `connect-src`: `www.recaptcha.net`, `recaptcha.net`, `recaptcha.google.com`, `signaler-pa.clients6.google.com`, `signaler-pa.googleapis.com`, `signaler-pa.youtube.com`, and `play.google.com`.
  - It also required adding `https://recaptcha.google.com/recaptcha/` to `frame-src`.
  - Source: [terra-cloud/tranyx PR #149](https://github.com/terra-cloud/tranyx/pull/149).
- **Permissions-Policy.** `language-model` controls access, for example `Permissions-Policy: language-model=(self)`. If policy disallows it, `availability()` returns `unavailable` and other methods throw `NotAllowedError` — [MDN Prompt API](https://developer.mozilla.org/en-US/docs/Web/API/Prompt_API).
- **Default allowlist.** Top-level windows and same-origin iframes are allowed by default. Cross-origin iframes need `allow="language-model"` — [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api).

### Inferences
- Draft `firebase.json`, assembled from the sources above. It has not been tested as a whole, so check DevTools for CSP violations on a preview channel before going live:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "cleanUrls": true,
    "trailingSlash": false,
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      { "source": "/assets/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      { "source": "**/*.@(html|json|webmanifest)", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "**", "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" },
        { "key": "Permissions-Policy", "value": "language-model=(self), camera=(), microphone=(), geolocation=()" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/; frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/; connect-src 'self' https://firebasevertexai.googleapis.com https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://recaptchaenterprise.googleapis.com https://www.google.com/recaptcha/ https://www.recaptcha.net https://recaptcha.net https://recaptcha.google.com https://signaler-pa.clients6.google.com https://signaler-pa.googleapis.com https://firebaseinstallations.googleapis.com https://firebaseremoteconfig.googleapis.com; img-src 'self' data: blob: https://www.gstatic.com; style-src 'self' 'unsafe-inline'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" }
      ]}
    ]
  }
}
```

- **Notes on the draft:**
  - `firebaseinstallations` and `firebaseremoteconfig` matter only if you use Analytics or Remote Config.
  - Add `play.google.com` and `signaler-pa.youtube.com` if violations show up, as tranyx found.
  - Vite injects no inline scripts by default, so `script-src 'self'` works. A Vite PWA plugin's registration snippet may need `'self'` only, because it uses a file.
  - The `language-model=(self)` entry is optional, because that is already the default. Writing it out protects against someone later adding a deny-all Permissions-Policy.
- **Cloud host.** `firebasevertexai.googleapis.com` is the host Firebase AI Logic uses for both Gemini API backends. It is cited in tranyx's live CSP. `generativelanguage.googleapis.com` is not called directly by the client SDK.

### Gaps
- I found no official Firebase document that gives a full CSP for AI Logic plus App Check.
- The `signaler-pa` and `play.google.com` hosts come from one PR.
- Hosting's default `Cache-Control` and its header-count limits did not appear in the fetched page.

## 5. GitHub Actions deploy: action-hosting-deploy, PR previews, service-account secret

### Takeaway
Run `firebase init hosting:github`. It creates a deploy service account, uploads its key as the `FIREBASE_SERVICE_ACCOUNT_<PROJECT_ID>` secret, and writes two workflows that use `FirebaseExtended/action-hosting-deploy@v0`: one for PR previews and one for merges to live. Add a Node build step if you don't answer the build-script prompt.

### Cited Findings
- **Secret and service account.**
  - Secret name: `` `FIREBASE_SERVICE_ACCOUNT_${projectId.replace(/-/g, "_").toUpperCase()}` ``.
  - Service account ID: `github-action-${repoId}`.
  - Roles granted: authAdmin, serviceUsageConsumer, apiKeysViewer, hostingAdmin, runViewer, functionsDeveloper.
- **Generated files.** `firebase-hosting-pull-request.yml` and `firebase-hosting-merge.yml`, using `actions/checkout@v4` and `FirebaseExtended/action-hosting-deploy@v0`.
- **Prompts asked:**
  - which repository
  - run a build script before deploy?
  - which script
  - auto-deploy to live on merge?
  - which branch
- Source for all of the above: [firebase-tools src/init/features/hosting/github.ts](https://raw.githubusercontent.com/firebase/firebase-tools/main/src/init/features/hosting/github.ts).
- **What the command does (docs).** It "Creates a service account in your Firebase project with permission to deploy to Firebase Hosting", "Encrypts that service account's JSON key and uploads it to the specified GitHub repository as a GitHub secret", and writes the workflow YAML — [Firebase Hosting GitHub integration](https://firebase.google.com/docs/hosting/github-integration.md.txt).
- **Action inputs.**
  - `firebaseServiceAccount` (required)
  - `repoToken` (for the PR comment with the preview URL)
  - `expires` (defaults to 7 days)
  - `projectId`
  - `channelId` (generated automatically for PRs; `live` for production)
  - `target`, `entryPoint`, `firebaseToolsVersion` (defaults to latest), `disableComment`, `force`
- **Action outputs.** `urls`, `expire_time`, `expire_time_formatted`, `details_url`.
- Source for inputs and outputs: [action-hosting-deploy README](https://github.com/FirebaseExtended/action-hosting-deploy).
- **CI login.** `firebase login:ci` is deprecated. Use Application Default Credentials with a service account (`GOOGLE_APPLICATION_CREDENTIALS`) — [Firebase CLI reference](https://firebase.google.com/docs/cli.md.txt).

### Inferences
- PR preview workflow, adapted from the README with a build step added:

```yaml
name: Deploy to Preview Channel
on: pull_request
permissions: { contents: read, pull-requests: write, checks: write }
jobs:
  build_and_preview:
    if: ${{ github.event.pull_request.head.repo.full_name == github.repository }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci && npm run build
        env:
          VITE_RECAPTCHA_SITE_KEY: ${{ vars.VITE_RECAPTCHA_SITE_KEY }}
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_MY_PROJECT }}
          projectId: my-project
          expires: 7d
```

  The live workflow is the same with `on: push: branches: [main]`, `channelId: live`, and no `repoToken`.
- **Possible App Check blocker on previews.** Preview channel URLs look like `<site>--<channel>-<hash>.web.app`. They may not be covered by the domain list on the reCAPTCHA Enterprise key. Before relying on previews, check whether listing `web.app` covers subdomains. Otherwise use a separate preview key, or the debug provider with a CI-only token for previews.
- **Secrets on fork PRs.** Fork PRs cannot read secrets, so restrict previews to same-repo PRs with the `if:` shown in the workflow above.

### Gaps
- I did not confirm the latest release tag and date of action-hosting-deploy beyond the `@v0` major tag in the README.
- Behaviour of reCAPTCHA key domains with preview subdomains is unverified.

## 6. Firebase project setup via CLI, App Check with reCAPTCHA Enterprise, Gemini Developer API free tier

### Takeaway
1. Create the project and web app with `firebase projects:create`, then `firebase apps:create WEB`.
2. Provision AI Logic with `firebase init ailogic`, which enables the Gemini Developer API.
3. Create a score-based reCAPTCHA Enterprise web key in the Google Cloud console.
4. Register that key under Firebase console > Security > App Check.

None of this needs Blaze:
- The Gemini Developer API free tier needs no billing account.
- reCAPTCHA's free Essentials tier covers 10k assessments a month.
- Spark only limits the App Check score thresholds.

Free-tier rate limits are set per project and shown in AI Studio. The Firebase AI Logic per-user default is 100 RPM.

### Cited Findings
- **CLI syntax (local `--help`, firebase-tools 15.37.0, 22 Nov 2026).**
  - `firebase projects:create [options] [projectId]` with `-n/--display-name`, `-o/--organization`, `-f/--folder`.
  - `firebase apps:create [options] [platform] [displayName]`, where platform is IOS, ANDROID, or WEB.
  - `firebase init [feature]` features include `ailogic`, `aitools`, `apphosting`, `auth`, `database`, `dataconnect`, `emulators`, `firestore`, `functions`, `genkit`, `hosting`, `hosting:github`, `remoteconfig`, `storage`.
- **SDK config.** `firebase apps:sdkconfig WEB [appId] -o <file>` prints or writes the web config. `firebase use <id>` sets the active project. `firebase hosting:channel:deploy <channel>` creates the preview channel if it does not exist — [Firebase CLI reference](https://firebase.google.com/docs/cli.md.txt).
- **`init ailogic`.** "`npx -y firebase-tools@latest init ailogic` ... will enable the Gemini Developer API in the Firebase project". It is required even if the app already uses Firebase. Client config files do not enable the service, and skipping this step gives `PERMISSION_DENIED`. Before running it, confirm the project with `projects:list` and that an app exists with `apps:list` — [Google firebase-ai-logic-basics skill](https://raw.githubusercontent.com/davidkivuyo/foodorder/main/.agents/skills/firebase-ai-logic-basics/SKILL.md) (also present locally in the Firebase Claude plugin).
- **Web SDK init.** `getAI(firebaseApp, { backend: new GoogleAIBackend() })` — [Firebase AI Logic get-started](https://firebase.google.com/docs/ai-logic/get-started.md.txt?api=dev). The model name in that excerpt was reported as `gemini-4-hydrogen` (low confidence; check the [models page](https://firebase.google.com/docs/ai-logic/models.md.txt)).
- **reCAPTCHA Enterprise key setup.**
  - Steps: Google Cloud console, then the Fraud Defense page. Enable the reCAPTCHA Enterprise API and create a Web-type key listing your domains. Score-based only: leave "Use checkbox challenge" unselected.
  - Limits and warnings: at most 250 domains. "Never add localhost as a domain to a reCAPTCHA key that is deployed to ... production".
  - Register the key in Firebase console > Security > App Check.
  - Init code: `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_KEY), isTokenAutoRefreshEnabled: true })`.
  - Spark offers only 4 score thresholds (0.1, 0.3, 0.7, 0.9). Blaze allows any value between 0.0 and 1.0.
  - Source: [Firebase App Check reCAPTCHA Enterprise provider](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider.md.txt).
- **reCAPTCHA cost.** The Essentials tier applies automatically to keys in projects without billing. It is free up to 10,000 assessments a month. Without billing, reCAPTCHA returns errors after that allowance. With billing (Premium), the first 10k a month are free, 10,001–100k cost a flat $8, and above that it is $1 per 1,000 — [reCAPTCHA billing information](https://docs.cloud.google.com/recaptcha/docs/billing-information) (search snippet).
- **Replay protection.** `useLimitedUseAppCheckTokens: true` in `getAI(...)` sends limited-use tokens. Some models return HTTP 403 "To access this model, you must enforce Firebase App Check" — [Firebase AI Logic App Check](https://firebase.google.com/docs/ai-logic/app-check.md.txt); local firebase-ai-logic-basics skill, `usage_patterns_web.md`.
- **Gemini Developer API free tier.** "To use this 'free tier', you do *not* link your project to a Cloud Billing account". Paid tiers need billing (Blaze) — [Firebase AI Logic pricing](https://firebase.google.com/docs/ai-logic/pricing.md.txt).
- **Agent Platform backend.** The Agent Platform (formerly Vertex AI) Gemini API backend needs Blaze. Nano Banana image generation needs Blaze — [Google firebase-ai-logic-basics skill](https://raw.githubusercontent.com/davidkivuyo/foodorder/main/.agents/skills/firebase-ai-logic-basics/SKILL.md).
- **Rate limits.**
  - The Firebase AI Logic per-user default is "100 RPM per user". Limits cover RPM, RPD, TPM, and TPD. You change quotas from the Google Cloud console Firebase AI Logic API page, under Quotas & System Limits.
  - Gemini Developer API limits "depend on several factors" — [Firebase AI Logic quotas](https://firebase.google.com/docs/ai-logic/quotas.md.txt).
  - The Gemini docs now redirect to `aistudio.google.com/docs/rate-limits`, which says limits "can be viewed in Google AI Studio" at [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit). The summarizer reported per-model figures from that page, but I could not verify which models get free-tier access (low confidence) — [AI Studio rate limits](https://aistudio.google.com/docs/rate-limits).

### Inferences
- End-to-end bootstrap sequence:

```bash
npx -y firebase-tools@latest login
npx -y firebase-tools@latest projects:create envoy-xxxx -n "Envoy"
npx -y firebase-tools@latest use envoy-xxxx
npx -y firebase-tools@latest apps:create WEB "Envoy Web"
npx -y firebase-tools@latest apps:sdkconfig WEB -o src/firebase-config.json
npx -y firebase-tools@latest init hosting        # public: dist, SPA: yes
npx -y firebase-tools@latest init ailogic         # enables Gemini Developer API
npx -y firebase-tools@latest init hosting:github  # service account + workflows
# Manual: Cloud console -> reCAPTCHA (Fraud Defense) -> create score-based Web key (your domains, not localhost)
# Manual: Firebase console -> Security -> App Check -> register web app with reCAPTCHA Enterprise key; add debug tokens
```

- Because App Check is enforced for all projects, any CI end-to-end test that reaches the cloud model needs a registered debug token stored as a GitHub secret and injected as `VITE_APPCHECK_DEBUG_TOKEN`. That token must never ship in production builds, so gate it with `import.meta.env.DEV` or a separate CI build mode.
- A hackathon-scale app on Spark should stay inside the free tiers, since reCAPTCHA gives 10k assessments a month. Token auto-refresh uses assessments, so heavy testing can burn through them.

### Gaps
- I have no confirmed free-tier RPM or RPD figures for the specific cloud model used, such as `gemini-3.5-flash-lite`.
- I did not confirm whether `init ailogic` also writes local files or links an app. Sources only say it enables the API.
- I did not confirm whether `projects:create` on an account with no organization needs extra Terms-of-Service steps.

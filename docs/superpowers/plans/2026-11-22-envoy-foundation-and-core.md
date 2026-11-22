# Envoy Foundation and Privacy Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Owner preference: execute natively in-session (superpowers:executing-plans); no subagent swarms.**

**Goal:** A deployed, App-Check-protected Firebase web app whose `/dev` page proves on-device and cloud inference, plus a fully tested privacy engine that turns Mona's contract and question into a guarded, masked, one-clause excerpt with a receipt.

**Architecture:** npm workspaces. `packages/core` is pure TypeScript (no network): detection, tagging, outbound guard, restore and receipt. `packages/ai` wraps Firebase AI Logic, with one model factory per step and a device guard that fixes SDK bug #10635. `apps/web` is a Vite React SPA on Firebase Hosting; in this plan it only has the `/dev` page.

**Tech Stack:** Node 26, npm workspaces, TypeScript (strict), Vite, React, Vitest, ESLint, Prettier, `firebase@^13.4.0` (`firebase/ai`, `firebase/app-check`, `firebase/remote-config`), Firebase Hosting, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-22-envoy-design.md` (also `docs/BRIEF.md`, `docs/HACKATHON_RULES.md`, `reports/Gemini Nano via Firebase AI Logic.md`)

## Global Constraints

- Private steps (detect, minimize, route, local answer) use `InferenceMode.ONLY_ON_DEVICE` **through the device guard**. They never fall back to the cloud.
- The reason step uses `InferenceMode.PREFER_IN_CLOUD`. The cloud model comes from Remote Config key `cloud_model`, default `gemini-3.8-flash`.
- `inCloudParams` always includes `model` (otherwise the SDK throws `NO_MODEL`). On-device system text goes in `onDeviceParams.createOptions.initialPrompts` (role `system`), never `systemInstruction`.
- Structured output is set twice: `inCloudParams.generationConfig.{responseMimeType:'application/json', responseSchema}` and `onDeviceParams.promptOptions.responseConstraint`.
- Each on-device prompt plus its input fits in **9,216 tokens**. Budget 4 chars ≈ 1 token and keep input ≤ 6,000 tokens per call.
- `expectedInputs`/`expectedOutputs`: `[{type:'text', languages:['en']}]`.
- `initializeDeviceModel()` only from a click handler.
- The tag↔value map lives in memory only (no localStorage, IndexedDB or network).
- No secrets, `.env` files or real PII committed. Sample people and IDs are fictional.
- Commit author `Hesham Aboul-Fetouh <hesham1988@gmail.com>`. Conventional commits. Run `npm run verify` before every commit.
- Tools and caches on F:, never C:. npm cache: `npm config set cache F:\npm-cache`.

## Review Focus

1. **A browser without `LanguageModel`** (Safari, Firefox, a disabled flag): private steps must make **zero** cloud requests and switch to Basic protection. → Task 4 tests `assertDeviceReady` and the tripwire.
2. **Nano returns junk:** malformed JSON, entities not in the text, a wrong enum. Expect the junk entities dropped, rules results kept, and no crash. → Task 8 test `parseDetectResponse drops non-verbatim entities`.
3. **The user edits the excerpt and types a raw value back** (e.g. the IBAN without spaces, or the phone in another format). Expect the guard to block it. → Task 10 test `checkOutbound catches reformatted values`.
4. **The same value in different formats across the document** (`EGP 8,500` / `8,500 EGP`; `+20 100 555 0192` / `01005550192`). Expect one tag for all of them. → Task 9 test `assignTags gives one tag to format variants`.
5. **A long document** (more than ~6,000 tokens): minimize must run in batches of chunks and never silently truncate. → Task 12 test `selectClausesBatched covers every chunk`.

Also: a cloud answer with an unknown tag or a malformed expression is left visible as written, never crashes. → Task 11 test.

---

### Task 1: Repository, workspaces, quality gate, GitHub

**Files:**
- Create: `package.json` (root, workspaces `packages/*`, `apps/*`), `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `vitest.workspace.ts`, `.gitignore`, `.nvmrc` (`26`), `LICENSE` (Apache-2.0, © 2026 Hesham Aboul-Fetouh), `README.md` (placeholder: title plus one-line pitch), `docs/BRIEF.md` (the owner's brief verbatim, with an "Amendments 2026-11-22" header pointing to the design doc), `docs/PLAN.md`, `docs/harness/LESSONS.md`
- Create: `packages/core/package.json` (`@envoy/core`), `packages/core/tsconfig.json`, `packages/core/src/index.ts`
- Modify: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` (BRIEF and PLAN now exist; commands list)

**Interfaces:**
- Produces root scripts: `verify` = `npm run lint && npm run typecheck && npm test && npm run build`; `test` = `vitest run`; `typecheck` = `tsc -b`; `lint` = `eslint .`; `build` = `npm run build -w apps/web --if-present`; `eval`; `deploy` = `firebase deploy --only hosting`.

- [ ] **Step 1:** Set the npm cache to F:, `git init -b main`, set local `user.name`/`user.email` to the commit author, and write the files above. `.gitignore` includes `.env*` (but `!.env.example`), `node_modules`, `dist`, `research_notes/**/devpost_*_raw.txt`, `.playwright-mcp`, `*.local`, `firebase-debug.log`.
- [ ] **Step 2:** Add a smoke test, `packages/core/src/index.test.ts`: `expect(VERSION).toBe('0.1.0')`. Export `VERSION` from `index.ts`.
- [ ] **Step 3:** `npm install -D typescript vitest eslint @eslint/js typescript-eslint prettier`, then `npm run verify`. Expected: lint, typecheck and test pass, and build skips.
- [ ] **Step 4:** Secret scan before the first commit: `git add -A && git diff --cached --name-only` must not list any `.env`, key file or raw devpost dump. Commit `chore: bootstrap workspace, quality gate and docs`.
- [ ] **Step 5:** `gh auth switch -u hesham88`, then `gh repo create hesham88/envoy --public --source . --push --description "Your private AI agent to the cloud — Privacy-Conscious Delegation with Firebase AI Logic hybrid inference" --homepage ""`. Then `gh repo edit --add-topic firebase,gemini-nano,privacy,hybrid-ai,chrome-ai`. Verify with `gh repo view hesham88/envoy --json licenseInfo` → `apache-2.0`.

### Task 2: Firebase project, web app, AI Logic, Hosting config

**Files:**
- Create: `.firebaserc`, `firebase.json`, `.env.example`
- Modify: `docs/PLAN.md` (project ID, console links, owner steps)

**Interfaces:**
- Produces env names (`.env.local`, gitignored): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_RECAPTCHA_SITE_KEY`, `VITE_APPCHECK_DEBUG_TOKEN` (optional), `VITE_CLOUD_MODEL` (optional override).

- [ ] **Step 1:** `firebase login:use hesham1988@gmail.com`; verify with `firebase login:list`.
- [ ] **Step 2:** `firebase projects:create envoy-hybrid-ai -n "Envoy"`. If the ID is taken, try `envoy-hybridai-2026`. Then `firebase use <id>`, `firebase apps:create WEB "Envoy Web"`, `firebase apps:sdkconfig WEB <appId>`, and write the values into `.env.local` only.
- [ ] **Step 3:** `npx -y firebase-tools@latest init ailogic`. Expected: the Gemini Developer API is enabled.
- [ ] **Step 4:** Write `firebase.json`:
  - `hosting.public` = `apps/web/dist`; SPA rewrite `**` → `/index.html`.
  - Headers:
    - `/assets/**` → `Cache-Control: public,max-age=31536000,immutable`
    - `**/*.html` and `/sw.js` → `no-cache`
    - every path → `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a CSP:
    - `default-src 'self'; script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/; frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.recaptcha.net/; connect-src 'self' data: https://firebasevertexai.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebaseremoteconfig.googleapis.com https://firebaseinstallations.googleapis.com https://www.google.com https://www.recaptcha.net; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; worker-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'`
  - No `language-model` in Permissions-Policy.
- [ ] **Step 5:** **Owner checkpoint (console, about 5 min):**
  1. In Google Cloud console → reCAPTCHA Enterprise, create a score-based **website** key for domains `<id>.web.app` and `<id>.firebaseapp.com`.
  2. In Firebase console → App Check, register the web app with that key; AI Logic is enforced automatically.
  3. Register the debug token printed by the dev page (Task 5).

  Record these exact steps in `docs/PLAN.md`. Commit `chore: firebase project, hosting config and env template`.

### Task 3: `packages/ai`: init, App Check, Remote Config, model factories

**Files:**
- Create: `packages/ai/package.json` (`@envoy/ai`, dep `firebase@^13.4.0`, `@envoy/core`), `packages/ai/src/firebase.ts`, `packages/ai/src/remote.ts`, `packages/ai/src/models.ts`, `packages/ai/src/index.ts`
- Test: `packages/ai/src/models.test.ts`

**Interfaces:**
- Produces:
  - `initEnvoy(cfg: FirebaseEnv): { app: FirebaseApp; ai: AI }`. It sets `self.FIREBASE_APPCHECK_DEBUG_TOKEN = cfg.appCheckDebugToken ?? true` only when `import.meta.env.DEV`, then `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(cfg.recaptchaSiteKey), isTokenAutoRefreshEnabled: true })`, then `getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true })`.
  - `loadRemoteSettings(app): Promise<RemoteSettings>` with `RemoteSettings = { cloudModel: string; promptVersion: string }`. Defaults `{ cloudModel: 'gemini-3.8-flash', promptVersion: 'v1' }`; `minimumFetchIntervalMillis` 3,600,000; on any fetch error, return the defaults.
  - `Step` is imported from `@envoy/core` (defined in Task 6) and re-exported.
  - `createStepModel(ai: AI, step: Step, s: RemoteSettings, schema?: Schema): GenerativeModel`:
    - the four private steps get `{ mode: InferenceMode.ONLY_ON_DEVICE, inCloudParams: { model: s.cloudModel }, onDeviceParams }`;
    - `reason` gets `{ mode: InferenceMode.PREFER_IN_CLOUD, inCloudParams: { model: s.cloudModel, generationConfig }, onDeviceParams }`;
    - `onDeviceParams` = `{ createOptions: { expectedInputs:[{type:'text',languages:['en']}], expectedOutputs:[{type:'text',languages:['en']}], initialPrompts:[{role:'system', content: SYSTEM_PROMPTS[step]}] }, promptOptions: schema ? { responseConstraint: schema.toJSON() } : undefined }`.
  - `modeFor(step: Step): InferenceMode`.

- [ ] **Step 1:** Before writing code, open `node_modules/@firebase/ai/dist/*.d.ts` and confirm the names: `InferenceMode`, `InferenceSource`, `initializeDeviceModel`, `onDeviceParams.createOptions.initialPrompts`, `promptOptions.responseConstraint`, `Schema.toJSON`. Write any mismatch into `docs/PLAN.md` and follow the typings.
- [ ] **Step 2:** Failing tests:
  - `modeFor('detect')`, `modeFor('minimize')`, `modeFor('route')` and `modeFor('answerLocal')` all `=== InferenceMode.ONLY_ON_DEVICE`;
  - `modeFor('reason') === InferenceMode.PREFER_IN_CLOUD`;
  - `createStepModel` with a mocked `getGenerativeModel` (`vi.mock('firebase/ai', …)`) passes `inCloudParams.model === 'gemini-3.8-flash'` for every step, and passes `responseConstraint` only when a schema is given.
- [ ] **Step 3:** Implement. Run `npm test -w packages/ai` → PASS. Commit `feat(ai): firebase init, app check, remote config, per-step models`.

### Task 4: Device guard (fixes firebase-js-sdk #10635)

**Files:**
- Create: `packages/ai/src/device-guard.ts`, `packages/ai/src/network-log.ts`
- Test: `packages/ai/src/device-guard.test.ts`

**Interfaces:**
- Produces:
  - `class DeviceUnavailableError extends Error { reason: 'no-api' | 'unavailable' | 'downloadable' | 'downloading' }`
  - `class PrivacyViolationError extends Error {}`
  - `getDeviceStatus(): Promise<'no-api' | 'unavailable' | 'downloadable' | 'downloading' | 'available'>`. It checks `'LanguageModel' in globalThis` first, then `LanguageModel.availability({ expectedInputs, expectedOutputs })` with the same options as Task 3.
  - `assertDeviceReady(): Promise<void>` throws `DeviceUnavailableError` unless the status is `available`.
  - `runPrivate<T>(model: GenerativeModel, request: string): Promise<{ text: string; ms: number; source: 'on_device' }>`:
    - `await assertDeviceReady()`;
    - install the tripwire;
    - `model.generateContent(request)`;
    - remove the tripwire;
    - throw `PrivacyViolationError` if `response.inferenceSource !== InferenceSource.ON_DEVICE`;
    - log the step in the network log.
  - `withCloudTripwire<T>(fn: () => Promise<T>): Promise<T>` wraps `globalThis.fetch` so any URL containing `firebasevertexai.googleapis.com` rejects with `PrivacyViolationError` and is recorded in the network log; it restores fetch in `finally`.
  - `networkLog`: `{ entries: NetworkEntry[]; record(e: NetworkEntry): void; subscribe(fn): () => void; clear(): void }` with `NetworkEntry = { at: number; step: Step | 'tripwire'; target: 'device' | 'cloud'; blocked: boolean; payload: string }`.

- [ ] **Step 1:** Failing tests:
  - `getDeviceStatus` returns `'no-api'` when `LanguageModel` is absent (`vi.stubGlobal`);
  - it returns the stub's value when present;
  - `assertDeviceReady` throws `DeviceUnavailableError{reason:'no-api'}`;
  - `runPrivate` **never calls `generateContent`** when status ≠ `available` (spy call count 0);
  - `runPrivate` throws `PrivacyViolationError` when the stub response has `inferenceSource: InferenceSource.IN_CLOUD`;
  - `withCloudTripwire` rejects a `fetch('https://firebasevertexai.googleapis.com/x')` made inside `fn`, records `blocked:true`, and restores the original fetch after `fn` throws.
- [ ] **Step 2:** Implement. Run `npm test -w packages/ai` → PASS. Commit `feat(ai): device guard, cloud tripwire and network log (#10635)`.

### Task 5: `apps/web` scaffold and `/dev` page, deploy, CI

**Files:**
- Create: `apps/web` (Vite React TS template), `apps/web/src/main.tsx`, `apps/web/src/dev/DevPage.tsx`, `apps/web/src/env.ts`, `apps/web/src/styles/tokens.css`, `.github/workflows/firebase-hosting-merge.yml`, `.github/workflows/firebase-hosting-pull-request.yml`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `initEnvoy`, `loadRemoteSettings`, `createStepModel`, `runPrivate`, `getDeviceStatus`, `networkLog`.
- Produces: `readFirebaseEnv(): FirebaseEnv` (throws a readable error listing the missing `VITE_*` names).

- [ ] **Step 1:** `npm create vite@latest apps/web -- --template react-ts`, then add `@envoy/ai` and `@envoy/core` workspace deps. `tokens.css` holds the BRIEF §5 light/dark tokens as CSS variables. The route is `/dev` when `location.pathname === '/dev'` (no router).
- [ ] **Step 2:** The DevPage shows a device status pill, plus these buttons:
  - **Enable private mode**: in the click handler, calls `model.initializeDeviceModel(p => setProgress(p))`;
  - **Test ONLY_ON_DEVICE**: through `runPrivate`;
  - **Test PREFER_IN_CLOUD**: reason model, shows `inferenceSource`;
  - **Test structured output on-device**: `Schema.object({ properties: { ok: Schema.boolean() } })`;
  - **Simulate missing LanguageModel**: temporarily deletes the global, runs the ONLY_ON_DEVICE test and shows that the guard blocked it;
  - **Warm up**.

  Each shows the response, ms, inference source and the verbatim error.
- [ ] **Step 3:** `npm run verify` passes. `npm run dev`, then open `http://localhost:5173/dev` in the F: Chrome profile. The cloud test returns text after the owner registers the debug token.
- [ ] **Step 4:** `firebase init hosting:github` for repo `hesham88/envoy`. Build script `npm ci && npm run build`. Then edit the generated workflows:
  - add `actions/setup-node@v4` (node 26);
  - inject the `VITE_*` values from repo secrets (the owner adds them with `gh secret set`; the documented command list goes in PLAN.md);
  - `ci.yml` runs `npm ci && npm run verify` on push and PR.
- [ ] **Step 5:** `npm run build && firebase deploy --only hosting`. Expected: the live URL serves `/dev` and the console shows no CSP violations. Commit `feat(web): dev page with on-device/cloud tests; hosting CI`, then push. **CHECKPOINT 1:** report the live URL plus the owner's test results (on-device and cloud on the F: profile).

### Task 6: Core types, digit normalization, chunking

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/normalize.ts`, `packages/core/src/chunk.ts`
- Test: `packages/core/src/normalize.test.ts`, `packages/core/src/chunk.test.ts`

**Interfaces:**
- Produces:
  - `type EntityType = 'PERSON' | 'ORG' | 'ADDRESS' | 'EMAIL' | 'PHONE' | 'NATIONAL_ID' | 'IBAN' | 'CARD' | 'MONEY' | 'DATE'`
  - `interface Entity { type: EntityType; value: string; start: number; end: number; confidence: number; source: 'rules' | 'nano'; role?: string }`
  - `type Step = 'detect' | 'minimize' | 'route' | 'answerLocal' | 'reason'` (Task 3 needs it first, so create `types.ts` with `Step` at the start of Task 3)
  - `interface Chunk { id: number; label: string; text: string; start: number; end: number; page: number }`
  - `normalizeDigits(text: string): { text: string; toOriginal: (i: number) => number }`, mapping ٠–٩ and ۰–۹ to 0–9 (kept for robustness, though English only)
  - `chunkDocument(text: string): Chunk[]`. It splits on numbered clause headings (`/^\s*(\d{1,2})\.\s/m`, label `Clause N`) and otherwise on blank lines. `page` comes from form-feed or `--- Page N ---` markers (default 1).
  - `estimateTokens(s: string): number` = `Math.ceil(s.length / 4)`

- [ ] **Step 1:** Failing tests:
  - `normalizeDigits('٢٠٢٤').text === '2024'`, with offsets mapped back;
  - chunking the Task 7 sample gives clause labels `Clause 1`…`Clause 12`, a page number on each chunk, and `chunks.map(c => c.text).join('')` covering every non-whitespace character of the input.
- [ ] **Step 2:** Implement. Tests pass. Commit `feat(core): types, digit normalization, clause chunking`.

### Task 7: Fictional English sample contract

**Files:**
- Create: `packages/core/src/samples/en-lease.ts`, `packages/core/src/samples/questions.ts`
- Test: `packages/core/src/samples/en-lease.test.ts`

**Interfaces:**
- Produces: `EN_LEASE: { title: string; text: string }` and `SUGGESTED_QUESTIONS: string[]`, which are:
  - "Can my landlord raise the rent 20% this year?"
  - "When does my contract end?"
  - "What happens to my deposit if I leave early?"

- [ ] **Step 1:** Write the "Residential lease, Cairo" with 6 `--- Page N ---` markers and 12 numbered clauses. Required contents:
  - Landlord **Karim Fathy**, Tenant **Mona Adel**, each with a fictional 14-digit national ID that passes Task 8's structure rule;
  - phone `+20 100 555 0192`; email `mona.adel@example.com`;
  - address `14 El-Nadi St, Flat 7, Maadi, Cairo`;
  - start date 1 September 2024; a 3-year term (Clause 2);
  - **Clause 7 (Rent):** "The monthly rent is EGP 8,500. The Landlord may increase the rent once per contract year by no more than 10%, with at least 60 days' written notice to the Tenant.";
  - **Clause 8 (Payment):** IBAN `EG38 0019 0005 0000 0000 2631 8000 2`;
  - deposit, utilities, maintenance and termination clauses.
- [ ] **Step 2:** Tests:
  - the text contains every value above;
  - Clause 7 does **not** contain the IBAN;
  - the header comment says "All people, IDs and numbers are fictional."

  Commit `feat(core): fictional English sample lease`.

### Task 8: Rule detectors and Nano response parsing

**Files:**
- Create: `packages/core/src/rules.ts`, `packages/core/src/prompts.ts`
- Test: `packages/core/src/rules.test.ts`, `packages/core/src/prompts.test.ts`

**Interfaces:**
- Produces:
  - `detectWithRules(text: string): Entity[]` (source `'rules'`).
  - Validators, all exported: `isValidIban(s)` (mod-97), `isLuhn(s)`, `isEgyptianNationalId(s)`. The national ID rule:
    - 14 digits; digit 1 ∈ {2,3} (2 = 1900s, 3 = 2000s);
    - digits 2–7 a valid YYMMDD;
    - digits 8–9 in the governorate allowlist 01–04, 11–35 or 88;
    - check digit not verified.
  - Detectors: email; phone (`+20`/`0020`/`01[0125]` mobile, Egyptian landlines, E.164); IBAN (mod-97, spaces allowed); card (13–19 digits, Luhn); money (EGP, LE, USD, $, € before or after the number); dates (`1 September 2024`, `September 1, 2024`, `01/09/2024`, ISO); address heuristic (`\d+ … (St|Street|Rd|Road|Ave), …`).
  - Prompt builders: `DETECT_SCHEMA`, `MINIMIZE_SCHEMA`, `ROUTE_SCHEMA` (as `Schema` from `firebase/ai`; this is the **only** firebase import allowed in core, and it's type-level plus `Schema` builders) and `buildDetectPrompt(text, question)`, `buildMinimizePrompt(chunks, question)`, `buildRoutePrompt(question, chunks)`, `buildLocalAnswerPrompt(question, chunks)`. Prompts use `##` sections and XML-delimited input, and are versioned as `PROMPT_VERSION = 'v1'`.
  - `DETECT_SCHEMA` = `{ entities: [{ text: string, kind: enum['PERSON','ORG','ADDRESS','MONEY'], role: enum['landlord','tenant','employer','employee','patient','doctor','witness','agent','rent','deposit','salary','fee','other'] }] }`.
  - `MINIMIZE_SCHEMA` = `{ clause_ids: integer[], reason: string }`.
  - `ROUTE_SCHEMA` = `{ answerable_locally: boolean, reason: string }`.
  - `parseDetectResponse(json: string, source: string): Entity[]`. It locates each entity's exact `text` in `source` (all occurrences), **drops any entity whose text isn't found verbatim**, ignores invalid JSON (returns `[]`), and maps `kind`/`role`.
  - `parseMinimizeResponse(json: string, validIds: number[]): { ids: number[]; reason: string } | null`.
  - `parseRouteResponse(json: string): { local: boolean; reason: string } | null`.

- [ ] **Step 1:** Failing tests. For every detector, positive and negative cases, including:
  - `isValidIban('EG380019000500000000263180002') === true`, and false when one digit changes;
  - Luhn: `4111111111111111` true, `4111111111111112` false;
  - national ID: a valid sample ID true; month 13 false; governorate 05 false;
  - phones: `+20 100 555 0192`, `01005550192` and `0020 100 555 0192` all detected;
  - money: `EGP 8,500` and `8,500 EGP` detected; `10%` is **not** money;
  - on the sample, `detectWithRules(EN_LEASE.text)` finds ≥ 2 national IDs, 1 phone, 1 email, 1 IBAN, ≥ 1 money and ≥ 1 date.
  - `parseDetectResponse drops non-verbatim entities`: input JSON with `"Karim Fathy"` (present) and `"John Smith"` (absent) returns only Karim's spans.
  - Invalid JSON → `[]`. An unknown enum → the entity is dropped.
- [ ] **Step 2:** Implement. Tests pass. Commit `feat(core): rule detectors with checksums; prompt builders and strict parsers`.

### Task 9: Merge and tag assignment, masking

**Files:**
- Create: `packages/core/src/tags.ts`
- Test: `packages/core/src/tags.test.ts`

**Interfaces:**
- Produces:
  - `mergeEntities(rules: Entity[], nano: Entity[]): Entity[]`. Rules win on overlap; the result is sorted by `start` with no overlaps.
  - `canonical(value: string, type: EntityType): string`. It strips spaces, punctuation and currency words, lowercases, and turns `0020`/`+20` into a leading `0` for phones.
  - `interface TagMap { tagOf(e: Entity): string; valueOf(tag: string): string | undefined; entries(): { tag: string; value: string; type: EntityType }[] }`
  - `assignTags(entities: Entity[]): TagMap`. The tag is `[ROLE]` uppercased when there's a role (`[LANDLORD]`, `[RENT]`), else `[TYPE]` (`[PHONE]`, `[ADDRESS]`, `[NATIONAL_ID]`, `[ACCOUNT]` for IBAN). A second distinct value with the same base gets `_2`, `_3`. Dates are `[DATE_1]`… Values with the same `canonical` share one tag.
  - `maskText(text: string, entities: Entity[], tags: TagMap): string`.

- [ ] **Step 1:** Failing tests:
  - `assignTags gives one tag to format variants`: `EGP 8,500` and `8,500 EGP` give the same tag, and `+20 100 555 0192` and `01005550192` give the same tag;
  - two different tenants give `[TENANT]` and `[TENANT_2]`;
  - masking Clause 7 with the landlord/rent roles yields exactly `"The monthly rent is [RENT]. The Landlord may increase the rent once per contract year by no more than 10%, with at least 60 days' written notice to the Tenant."`. Generic words like "the Landlord" stay as written; only detected values are replaced.
- [ ] **Step 2:** Implement. Tests pass. Commit `feat(core): entity merge, consistent role tags, masking`.

### Task 10: Outbound guard

**Files:**
- Create: `packages/core/src/guard.ts`
- Test: `packages/core/src/guard.test.ts`

**Interfaces:**
- Produces: `checkOutbound(outbound: string, protectedEntities: Entity[]): { ok: boolean; leaks: { value: string; type: EntityType; index: number }[] }`. It reruns `detectWithRules(outbound)`; any detected value not in tag form is a leak. It also checks each protected entity's `canonical` against the `canonical` of a digit/letter-normalized outbound (so reformatted values are caught). Tags themselves (`[A-Z_0-9]+` in brackets) are never leaks.

- [ ] **Step 1:** Failing tests:
  - clean masked Clause 7 → `ok: true`;
  - `checkOutbound catches reformatted values`: an outbound containing `EG380019000500000000263180002` (no spaces), or `0100 555 0192`, or `karim fathy` (lowercase) → `ok: false`, with the right `type` for each;
  - a brand-new email typed into the excerpt → a leak;
  - `"[RENT] increased by 10%"` → ok.
- [ ] **Step 2:** Implement. Tests pass. Commit `feat(core): outbound leak guard with reformat detection`.

### Task 11: Restore with local expressions

**Files:**
- Create: `packages/core/src/restore.ts`, `packages/core/src/expr.ts`
- Test: `packages/core/src/restore.test.ts`, `packages/core/src/expr.test.ts`

**Interfaces:**
- Produces:
  - `evaluate(expr: string, values: Record<string, number>): number | null`. A recursive-descent parser over numbers, tag names, `+ - * /`, `×`, `÷` and parentheses. Anything else returns `null`. **No `eval`, no `Function`.**
  - `parseAmount(value: string): { amount: number; currency: string } | null`.
  - `restoreAnswer(answer: string, tags: TagMap): { text: string; spans: { start: number; end: number; tag: string; value: string; computed: boolean }[] }`:
    - replaces `[TAG]` with its value;
    - replaces `{{ expr }}` with the formatted result (currency taken from the first MONEY tag in the expression, `en-US` grouping, e.g. `EGP 9,350`);
    - leaves unknown tags and invalid expressions as written.
  - `CLOUD_EXPRESSION_INSTRUCTION`: the exact sentence for the reason prompt: "When you need a number derived from a tagged amount, write it as {{TAG * factor}} (for example {{RENT * 1.10}}); never guess the real value."

- [ ] **Step 1:** Failing tests:
  - `evaluate('RENT * 1.10', {RENT: 8500}) === 9350`;
  - `evaluate('RENT*1.2', …) === 10200`;
  - `evaluate('alert(1)', …) === null`;
  - `evaluate('RENT * (1 + 0.1)', …) === 9350`;
  - `restoreAnswer('[LANDLORD] can raise it to {{RENT * 1.10}} at most.')` → `'Karim Fathy can raise it to EGP 9,350 at most.'`, with 2 spans, the second `computed: true`;
  - `[UNKNOWN]` stays as written;
  - `{{RENT * }}` stays as written;
  - the round trip `restoreAnswer(maskText(x))` === `x` for Clause 7.
- [ ] **Step 2:** Implement. Tests pass. Commit `feat(core): restore tags and safe local expressions`.

### Task 12: Receipt and the pipeline (wired), with the dev panel

**Files:**
- Create: `packages/core/src/receipt.ts`, `packages/ai/src/pipeline.ts`, `apps/web/src/dev/PipelinePanel.tsx`
- Test: `packages/core/src/receipt.test.ts`, `packages/ai/src/pipeline.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3, 4 and 6–11.
- Produces:
  - `interface Receipt { found: Record<EntityType, number>; foundTotal: number; sharedTags: string[]; keptTotal: number; charsSent: number; clausesSent: number; pagesTotal: number; pagesSent: number; steps: { step: Step; source: 'on_device' | 'in_cloud' | 'rules' | 'code'; ms: number }[]; mode: 'private' | 'basic' }`
  - `buildReceipt(args: { entities: Entity[]; outbound: string | null; chunksSent: Chunk[]; chunksAll: Chunk[]; steps: Receipt['steps']; mode: Receipt['mode'] }): Receipt`
  - `type Deps = { runPrivate: typeof runPrivate; models: Record<Step, GenerativeModel>; getDeviceStatus: typeof getDeviceStatus }` (injected for tests)
  - `analyze(doc: string, question: string, deps: Deps): Promise<Analysis>`, where `Analysis = { chunks: Chunk[]; entities: Entity[]; tags: TagMap; selectedIds: number[]; selectionReason: string; route: { local: boolean; reason: string }; outbound: string; guard: ReturnType<typeof checkOutbound>; receipt: Receipt; mode: 'private' | 'basic'; flaggedForReview: Entity[] }`. Order: rules → (if the device is ready) Nano detect → merge → tags → Nano route → Nano minimize (batched) → mask the question and the selected chunks → guard. If the device isn't ready: `mode: 'basic'`, every chunk selected, PERSON-like candidates flagged for review, zero model calls.
  - `selectClausesBatched(chunks: Chunk[], question: string, run: (prompt: string) => Promise<string>, maxTokens = 6000): Promise<{ ids: number[]; reason: string }>`
  - `answer(analysis: Analysis, approvedOutbound: string, deps: Deps): Promise<{ text: string; spans: …; source: 'on_device' | 'in_cloud'; receipt: Receipt }>`. It reruns `checkOutbound(approvedOutbound)` and throws when it isn't ok. Local route → `runPrivate(answerLocal)`; otherwise the reason model with `CLOUD_EXPRESSION_INSTRUCTION`, recording the request in the network log with the exact payload. Then `restoreAnswer`.

- [ ] **Step 1:** Failing tests, with stubbed models:
  - with device status `no-api`, `analyze` makes **0** model calls and returns `mode: 'basic'`;
  - with the stubbed detect, minimize and route JSON, Mona's question selects `[7]`, the outbound equals `"Question: Can [LANDLORD] raise the rent 20% this year?\n\nClause 7: The monthly rent is [RENT]. The Landlord may increase …"` and contains no `[ACCOUNT]`, and `guard.ok === true`;
  - `selectClausesBatched covers every chunk`: a 40-chunk synthetic doc with `maxTokens` 500 makes ≥ 2 calls, and every chunk id appears in exactly one prompt;
  - `answer` throws when `approvedOutbound` contains the raw IBAN;
  - the receipt for the sample shows `clausesSent: 1`, `pagesTotal: 6` and `foundTotal ≥ 8`.
- [ ] **Step 2:** Implement. Tests pass.
- [ ] **Step 3:** The `PipelinePanel` on `/dev`:
  - loads `EN_LEASE` with the three suggested questions;
  - **Run pipeline** shows the entities table, the selected clauses, the masked outbound, the guard result and the receipt JSON;
  - **Send** shows the restored answer and the network log.
- [ ] **Step 4:** `npm run verify`. Then a security pass: `npm audit --omit=dev`, `git grep -n -I -E "AIza|LLM\||BEGIN PRIVATE|debug_token"` must be empty, and a manual CSP check on the deployed page. Deploy. Commit `feat: wired privacy pipeline with receipt and dev panel`, push. **CHECKPOINT 2:** test summary, plus the masked excerpt and receipt for "Can my landlord raise the rent 20% this year?" in private and basic mode, plus the security-pass results. Update `docs/PLAN.md` (statuses: wired / built / stubbed) and `docs/harness/LESSONS.md` (first on-device prompt observations).

---

## Next plans (written after Checkpoint 2)
- `envoy-product-ui`: the four screens, About, Network inspector, logo, motion, a11y, PWA offline.
- `envoy-eval-and-tuning`: the eval harness plus Harness² prompt tuning.
- `envoy-extension`: the MV3 side panel.
- `envoy-launch`: assets (Muse), README, video (Chatterbox), Devpost text.

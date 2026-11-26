# Show the Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Envoy's device/cloud boundary visible in the main experience: a live split-screen Wiretap view with one-click samples, an explicit offline-to-cloud handoff, auto-masking OCR for photos in the Chrome extension (and the web app), and a 2:45 demo video that shows all of it.

**Architecture:** The Wiretap view reads the existing in-memory `networkLog` (extended with the cloud's reply) through a pure view-model in `packages/app`. Offline handoff adds a `held` phase to the session reducer. OCR is Tesseract.js 7.0.0, self-hosted, feeding word boxes into a pure `ocrMask` in `packages/core` that reuses `scanText`; the extension runs it in its offscreen document.

**Tech Stack:** TypeScript, React 19, Vite, Vitest + Testing Library, Firebase AI Logic (`firebase/ai`), Chrome MV3, Tesseract.js 7.0.0, Chrome DevTools Protocol scripts (`scripts/lib/envoy-browser.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-26-show-the-boundary-design.md`

## Global Constraints

- Deadline Mon 30 Nov 2026, 2:00 PM PT; our target is submitted by Mon 30 Nov, 6:00 PM Cairo. Nothing risky merges after Sun 29 Nov.
- Every PR: `npm run verify` green locally and in the PR's own CI before merge; `node scripts/allow-preview.mjs` after each PR's CI; never `firebase deploy` from a lane.
- Private steps stay `InferenceMode.ONLY_ON_DEVICE` behind `runPrivate`; no change to `packages/ai/src/device-guard.ts` semantics.
- Pane label, verbatim: "The exact text Envoy handed to Firebase AI Logic."
- Empty pane, verbatim: "Nothing has left this device."
- Offline hold button, verbatim: "Send when I'm back online". Held status, verbatim: "Held on this device: waiting for the network".
- CSP: add `'wasm-unsafe-eval'` to `script-src` only (hosting and extension). Never `'unsafe-eval'`, `blob:` or a CDN. Tesseract `workerBlobURL: false`.
- Tesseract.js pinned to exactly `7.0.0`; English LSTM data; all OCR files served from our own origin / extension package.
- No samples, held requests, photos or OCR text written to storage. Rule `Permissions-Policy: camera=()` unchanged.
- All sample people, IDs and numbers fictional (copied from `tests/eval/cases.json`).
- Hydrogen is never probed or retried; scripts that hit the cloud run the dev server with `VITE_CLOUD_MODEL=gemini-3.5-flash-lite`.
- At the start of each UI/client-JS task, consult `modern-web-guidance` (`npx -y modern-web-guidance@latest search "<query>"`, then `retrieve`) and list applied guide ids in the PR body.
- Video: target 2:45, hard limit 3:00; narration says "about a quarter of the text".
- Update `docs/PLAN.md` at the end of each part.

## Review Focus

1. A turn where nothing leaves (Local only, a local route, Basic mode with no approval yet): the pane must say "Nothing has left this device." and never show a device step as sent. → Task 2 test `nothing-left`.
2. The capable model refuses and the fast model answers: two outbound cloud requests left; the pane must show both, the first marked "refused". → Task 1 test `records the refused request and the reply`, Task 2 test `fallback-two-out`.
3. An expression left unevaluated by the restore rule (PR #55, e.g. `{{DEPOSIT * 2}}`): the pane must list it as "Not worked out", never with a value. → Task 2 test `unevaluated-expression`.
4. Network flaps while a request is held (offline → online → offline → online): the request is sent exactly once; a cloud failure after reconnect shows the normal error and clears the hold. → Task 7 tests `sends once on flapping network`, `failure after reconnect`.
5. An image with no readable text, or a very large image (> 10 MB or > 6000 px on a side): a clear message, no crash, nothing burned. → Task 8 test `no words`, Task 10 test `rejects oversized image`.

---

## Part 0: Review fixes (ship first)

### Task 0: Docs for the three review points, the spec, and the guidance reference

**Files:**
- Modify: `docs/REVIEW_RESPONSE.md` (new row: device guard), `docs/SUBMISSION_KIT.md` (Devpost "About" text: recorded Private-mode run link first, next to the hosted app), `README.md` and `docs/EVAL.md` (one line each: "The 24 Nov video says about 15%; that was before the routing fix. Today's measured figure is 23.2%, about a quarter, with better answers; video v7 says so.")
- Already staged on `lane/core-web`: the spec, this plan, `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` Modern Web Guidance line.

- [ ] **Step 1:** Write the REVIEW_RESPONSE row: every model call (private steps, warm-up, cloud step) runs through one queue (`inAiQueue` in `packages/ai/src/device-guard.ts`), so the `fetch` tripwire and the session wrapper are never shared by two calls; the tripwire refuses only `CLOUD_ENDPOINT`, so App Check and Remote Config requests pass. Remaining limit: a third-party script on the page calling the AI endpoint during a private step would be refused (fails safe).
- [ ] **Step 2:** `npm run verify` → passes (links test and `eval:check` included; run `node scripts/fix-anchors.mjs` if a links test fails on anchors).
- [ ] **Step 3:** Commit, push `lane/core-web`, PR "Docs: final-batch design, plan, review fixes", wait for CI pass (no pending checks), allow-preview, merge.

---

## Part 1: Wiretap view

### Task 1: Record the cloud's reply in the network log

**Files:**
- Modify: `packages/ai/src/network-log.ts` (add `direction`), `packages/ai/src/pipeline.ts:500-525` (cloud step records)
- Test: `packages/ai/src/pipeline.test.ts`

**Interfaces:**
- Produces: `NetworkEntry` gains `direction?: 'out' | 'in'` (absent means `'out'`) and `refused?: boolean`; after a cloud answer, the log holds the outbound prompt entry(ies) followed by one `{ step: 'reason', target: 'cloud', direction: 'in', blocked: false, payload: <raw masked reply text> }`.

- [ ] **Step 1: Write the failing tests** in `pipeline.test.ts`:
  - `records the cloud reply as an incoming entry`: run `answer()` with a mocked cloud reply `'Up to {{RENT * 1.10}}.'`; expect the last log entry `toMatchObject({ direction: 'in', target: 'cloud', payload: 'Up to {{RENT * 1.10}}.' })`.
  - `records the refused request and the reply`: capable model throws a quota error, fallback answers; expect two `direction` `'out'` cloud entries, the first with `refused: true`, then one `'in'`.
  - `on-device fallback records no incoming cloud entry`: reply `inferenceSource` ON_DEVICE → no `'in'` entry with `target: 'cloud'`.
- [ ] **Step 2:** `npx vitest run packages/ai/src/pipeline.test.ts` → the three new tests FAIL.
- [ ] **Step 3:** Add the fields; in the refused branch record `refused: true`; after `res` resolves in the cloud, record the `'in'` entry with `res.response.text()`.
- [ ] **Step 4:** Re-run → PASS. `npm run verify` → passes.
- [ ] **Step 5:** Commit `feat(ai): record the cloud's reply in the network log`.

### Task 2: Wiretap view-model

**Files:**
- Create: `packages/app/src/chat/wiretap.ts`, `packages/app/src/chat/wiretap.test.ts`

**Interfaces:**
- Consumes: `NetworkEntry` (Task 1), `RestoredSpan` from `@envoy/core`.
- Produces:
  ```ts
  export type WiretapCard =
    | { kind: 'device'; step: string; payload: string }
    | { kind: 'out'; model: string; payload: string; refused: boolean }
    | { kind: 'in'; payload: string }
    | { kind: 'worked'; expr: string; value: string | null }; // null = "Not worked out"
  export interface WiretapView { cards: WiretapCard[]; docChars: number; sentChars: number; nothingLeft: boolean }
  export function buildWiretap(entries: readonly NetworkEntry[], opts: { docText: string; cloudModel: string; spans?: RestoredSpan[]; answerText?: string; since: number }): WiretapView;
  ```
  `since` = the turn's `startedAt`; only entries with `at >= since` count. `sentChars` = sum of `'out'` payload lengths. `worked` cards: one per `{{…}}` in the last `'in'` payload; value from the matching `computed: true` span, else `null`.

- [ ] **Step 1: Write failing tests**: `nothing-left` (only device entries → `nothingLeft: true`, `sentChars: 0`, every card `kind: 'device'`); `one-cloud-turn` (device + out + in → cards in that order, `sentChars` = out payload length); `fallback-two-out` (two outs, first `refused: true`); `unevaluated-expression` (in payload `{{DEPOSIT * 2}}`, no computed span → `{ kind: 'worked', expr: '{{DEPOSIT * 2}}', value: null }`); `worked-out` (`{{RENT * 1.10}}` with span value `EGP 9,350` → value `'EGP 9,350'`); `ignores-earlier-turns` (entries before `since` excluded).
- [ ] **Step 2:** `npx vitest run packages/app/src/chat/wiretap.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `buildWiretap`.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `feat(app): wiretap view-model`.

### Task 3: Wiretap pane in the chat

**Files:**
- Create: `packages/app/src/chat/WiretapPane.tsx`
- Modify: `packages/app/src/chat/ChatApp.tsx` (layout; the "Network ledger" buttons at ~lines 535 and 586 become "What leaves"; `NetworkInspector` stays only for `?inspect=1`), `apps/web/src/app/a11y.test.tsx` if selectors change
- Test: `packages/app/src/chat/WiretapPane.test.tsx`, existing `ChatApp.test.tsx`

**Interfaces:**
- Consumes: `buildWiretap` (Task 2), `networkLog.subscribe`.
- Produces: `<WiretapPane doc={SessionDoc | null} findings={Finding[]} view={WiretapView} open={boolean} onClose={() => void} overlay={boolean} />`.

- [ ] **Step 1:** Consult modern-web-guidance: `search "responsive split pane layout"`, `search "accessible disclosure widget"`; retrieve the matches (`css-layout`, `responsive-design`, plus any disclosure guide).
- [ ] **Step 2: Write failing tests** (`WiretapPane.test.tsx`): renders heading "What you see" and "What leaves"; with `nothingLeft` shows "Nothing has left this device."; with an `out` card shows "The exact text Envoy handed to Firebase AI Logic." and the payload with `[LANDLORD]` inside a `mark`; `worked` card with `value: null` shows "Not worked out"; device cards are collapsed (`details` closed) and say "Stayed on this device"; counter text `"412 of 6,980 characters left this device"` for `sentChars 412, docChars 6980`. In `ChatApp.test.tsx`: with `matchMedia('(min-width: 1280px)')` true and not `panel`, the pane is open on load; the toolbar button "What leaves" toggles it (`aria-pressed`).
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Implement. Wide (≥ 1280 px, web app): CSS grid, thread left, pane right (sticky, own scroll). Narrow and extension side panel: overlay with close button and focus return. Open state remembered in `localStorage` key `envoy.wiretap.open` (try/catch). Use existing tokens (`text-cloud-on-tint`, `text-device-on-tint`). The pane footer links "How we know this is what left" to `docs/SECURITY.md#wiretap-check` on GitHub.
- [ ] **Step 5:** Run tests → PASS; `npm run verify` → passes.
- [ ] **Step 6:** Screenshot check: `npm run dev`, open `http://localhost:5173/app?sample=lease` at 1440×900 and 390×844; read both screenshots; fix overlap or overflow.
- [ ] **Step 7:** Commit `feat(app): What you see / What leaves split view`.

### Task 4: Prove the pane shows what left (CDP check)

**Files:**
- Create: `scripts/verify-wiretap.mjs`
- Modify: `docs/SECURITY.md` (new section `## Wiretap check` with the command and the last result), `package.json` (script `"verify:wiretap": "node scripts/verify-wiretap.mjs"`)

**Interfaces:**
- Consumes: `scripts/lib/envoy-browser.mjs` (CDP helpers), dev server on 5173 started with `VITE_CLOUD_MODEL=gemini-3.5-flash-lite`.

- [ ] **Step 1:** Script: open `/app?sample=lease&protection=basic` (Basic mode, so any Chrome works), `Network.enable`, ask "Can my landlord raise the rent 20% this year?", approve; on `Network.requestWillBeSent` to `firebasevertexai.googleapis.com` read `Network.getRequestPostData`; `JSON.parse` it; collect all `contents[].parts[].text`.
- [ ] **Step 2:** Assertions (exit 1 on failure): the pane's outbound payload (read from the DOM `[data-wiretap-out]`) occurs verbatim in the collected text; none of the lease's real values (`Karim Fathy`, `EGP 8,500`, the national IDs from `EN_LEASE`) occur in the raw post data; exactly one AI request left. Print `wiretap-check: OK <date> <model>`.
- [ ] **Step 3:** Run it → `wiretap-check: OK`. Record the line in `docs/SECURITY.md#wiretap-check`.
- [ ] **Step 4:** Commit; push; PR "Wiretap view" (Tasks 1–4); CI pass; allow-preview; merge. Update `docs/PLAN.md`.

## Part 2: One-click samples

### Task 5: Lab results and freelance contract samples

**Files:**
- Create: `packages/core/src/samples/en-lab.ts` (document of case `med-03-insurance-copay-cap`), `packages/core/src/samples/en-freelance.ts` (document of case `freelance-01-kill-fee`), `packages/app/src/chat/samples.ts`
- Modify: `packages/core/src/index.ts` (exports), `packages/app/src/chat/ChatApp.tsx:93-106` (SUGGESTIONS) and `:246-259` (`?sample=`)
- Test: `packages/app/src/chat/samples.test.ts`, `ChatApp.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type SampleId = 'lease' | 'lab' | 'freelance';
  export interface Sample { id: SampleId; label: string; doc: SessionDoc; question: string }
  export const SAMPLES: readonly Sample[];
  export function sampleFromUrl(search: string): Sample | null;
  ```
  Labels, verbatim: "Rental lease", "Lab results", "Freelance contract". Questions: lease "Can my landlord raise the rent 20% this year?"; lab "If the insurer covers 80% of the procedure fee, what is my 20% out-of-pocket co-pay?"; freelance "If the client cancels the project halfway through Milestone 2, how much of the milestone fee must they pay?" (all three: judge "correct" on Gemma 4, 24 Nov). Each `doc.notice`: "All people, IDs and numbers are fictional."

- [ ] **Step 1: Failing tests**: `samples.test.ts` — the lab and freelance texts equal the `document` of their cases in `tests/eval/cases.json` (guards drift); `sampleFromUrl('?sample=lab')?.id === 'lab'`, unknown → `null`, `?sample=lease` still works. `ChatApp.test.tsx` — empty state shows three buttons with the labels; clicking "Lab results" loads the doc title and fills the draft with the lab question. Update the four existing tests that click "Try the sample lease" to "Rental lease".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; the private-email suggestion stays as a fourth, plain suggestion.
- [ ] **Step 4:** Run → PASS; `npm run verify`.
- [ ] **Step 5:** Commit; PR "One-click samples"; CI; allow-preview; merge.

## Part 3: Offline-to-cloud handoff

### Task 6: Verify on-device answers with no network (gate)

**Files:**
- Create: `scripts/verify-offline.mjs`

- [ ] **Step 1:** Script, model Chrome on CDP 9333 + dev server 5173: open `/app?sample=lease`, wait for Private mode ready, `Network.emulateNetworkConditions({ offline: true })`, ask "What is my monthly rent?" (Gemma 4 routes it locally; each lab case has its own short document, so the lease is the one sample with both a local and a cloud question).
- [ ] **Step 2:** Assert: an answer appears labelled on-device; `networkLog` has no `target: 'cloud'` entry; `navigator.onLine === false` during the run. Print `offline-check: OK` or the exact failure.
- [ ] **Step 3:** If it fails because the SDK or App Check needs the network for on-device calls: stop Part 3, report to the owner with the error, and continue with Part 4. Otherwise commit the script.

### Task 7: Hold an approved request until the network returns

**Files:**
- Modify: `packages/app/src/app/session.ts` (phase `'held'`, actions `HOLD`, `RELEASE`), `packages/app/src/chat/ChatApp.tsx` (`approve()` ~line 365, `Approval` ~line 1009, `TurnView`), `packages/app/src/components/OfflineBanner.tsx` (copy)
- Test: `packages/app/src/app/session.test.ts`, `packages/app/src/chat/ChatApp.offline.test.tsx` (new), `packages/app/src/components/OfflineBanner.test.tsx`

**Interfaces:**
- Produces: `Phase` adds `'held'`; `{ type: 'HOLD' }` moves `review → held`; `{ type: 'RELEASE' }` moves `held → review` (cancel); sending from held uses the existing `SEND_START`.

- [ ] **Step 1: Failing tests** (`ChatApp.offline.test.tsx`, mock `navigator.onLine` false and `answer`): the approval card shows "Send when I'm back online" only while offline; clicking it shows "Held on this device: waiting for the network" and does not call `answer`; dispatching `window` `online` calls `answer` once with the same outbound text; `sends once on flapping network` (online, offline, online events → `answer` called once); `failure after reconnect` (`answer` rejects → error alert shown, no held status); "Cancel" while held → back to the approval card, `answer` never called. Banner test: offline copy is "You're offline. Envoy keeps answering on this device. Questions that need the cloud can wait here until you're back online, or get a lighter answer on this device now."
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Keep the held `{analysis, outbound, sharedTags, selectedIds}` in a `useRef` map by turn id (memory only); register a one-shot `online` listener per held turn, removed on cancel, unmount or send. Held card text adds: "If you close this tab, the held question is discarded."
- [ ] **Step 4:** Run → PASS; `npm run verify`.
- [ ] **Step 5:** Manual run in the model Chrome with `scripts/verify-offline.mjs` extended by a `--hold` flag: offline, ask "Can my landlord raise the rent 20% this year?", hold, go online, assert one cloud `'out'` entry and an answer with a worked-out value. Print `offline-hold-check: OK`.
- [ ] **Step 6:** Commit; PR "Offline handoff"; CI; allow-preview; merge. Update `docs/PLAN.md`.

## Part 4: Auto-masking OCR

### Task 8: `ocrMask` in core

**Files:**
- Create: `packages/core/src/ocr-mask.ts`, `packages/core/src/ocr-mask.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `scanText(text, opts: ScanOptions): ScanResult` (`packages/core/src/scan.ts:35`), `Finding`.
- Produces:
  ```ts
  export interface OcrWord { text: string; line: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
  export interface MaskBox { x: number; y: number; w: number; h: number; type: EntityType; value: string; on: boolean }
  export function ocrText(words: readonly OcrWord[]): { text: string; offsets: Array<{ start: number; end: number; word: number }> };
  export function ocrMask(words: readonly OcrWord[], opts?: ScanOptions & { pad?: number }): { text: string; boxes: MaskBox[] };
  ```
  Words in a line joined by one space, lines by `\n`. A finding gets one box per line it spans (union of that line's covered words), padded by `pad` (default 4 px), `on: true`.

- [ ] **Step 1: Failing tests**: phone split over two words `+20 100 901 2345` → one box covering all four word boxes; an email on line 2 → box only from line 2 words; a value wrapping across two lines → two boxes; `no words` → `{ text: '', boxes: [] }`; a custom rule (`opts.custom`) term is boxed; `pad` applied and clamped at 0.
- [ ] **Step 2:** `npx vitest run packages/core/src/ocr-mask.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; commit `feat(core): ocrMask — boxes for private details in OCR words`.

### Task 9: Self-hosted Tesseract and the CSP change

**Files:**
- Create: `packages/app/src/lib/ocr.ts`, `scripts/copy-ocr-assets.mjs`
- Modify: root/`packages/app` `package.json` (`tesseract.js` exact `7.0.0`; English data package after checking its licence is Apache-2.0 or compatible — if not, fetch `eng.traineddata.gz` once from the tesseract.js 4.0.0_best_int set into the repo and record its source and licence in `docs/THIRD_PARTY.md` or the README credits), `apps/web/package.json` and `apps/extension/package.json` (`prebuild`/`predev`: `node ../../scripts/copy-ocr-assets.mjs <public dir>`), `.gitignore` (`apps/*/public/ocr/`), `firebase.json` (CSP `script-src` + `'wasm-unsafe-eval'`), `apps/extension/public/manifest.json` (`extension_pages` `script-src 'self' 'wasm-unsafe-eval'`), `docs/SECURITY.md` (CSP note with the MDN and Chrome quotes from the spec), `scripts/check-dist.mjs` or `npm run check:dist` (assert no `cdn.jsdelivr`, `unpkg`, `projectnaptha` strings in `dist`)
- Test: `packages/app/src/lib/ocr.test.ts`

**Interfaces:**
- Produces: `export async function recognizeImage(image: Blob, base: string): Promise<OcrWord[]>` (`base` = `'/ocr'` on the web, `chrome.runtime.getURL('ocr')` in the extension); `createWorker('eng', 1, { workerPath: base + '/worker.min.js', corePath: base + '/core', langPath: base + '/lang', workerBlobURL: false })`; terminates the worker after each call. Maps Tesseract words (`data.words`, each with `text`, `bbox`, `line`) to `OcrWord`.

- [ ] **Step 1:** Consult modern-web-guidance `security` (CSP section) — already retrieved 26 Nov; confirm no `'unsafe-eval'`.
- [ ] **Step 2: Failing test** `ocr.test.ts` (mock `tesseract.js`): `createWorker` called with exactly those four options for `base '/ocr'`; result maps to `OcrWord[]`; worker `terminate` called even when `recognize` throws.
- [ ] **Step 3:** Run → FAIL; implement; run → PASS.
- [ ] **Step 4:** `copy-ocr-assets.mjs`: copy `tesseract.js/dist/worker.min.js`, the four `tesseract-core*.wasm.js` (+ `.wasm`) files into `<public>/ocr/core/`, and `eng.traineddata.gz` into `<public>/ocr/lang/`. Print total size.
- [ ] **Step 5:** `npm run verify` and `npm run check:dist` → pass; `grep -r "wasm-unsafe-eval" firebase.json apps/extension/public/manifest.json` → two hits; no `'unsafe-eval'` anywhere.
- [ ] **Step 6:** Commit `feat: self-hosted on-device OCR (Tesseract.js 7.0.0); CSP allows WebAssembly only`.

### Task 10: Photos in the web app, and the sample photo

**Files:**
- Create: `scripts/make-sample-photo.mjs`, `apps/web/public/samples/lab-bill.webp` (committed, ≤ 300 KB), `packages/app/src/components/PhotoPreview.tsx`
- Modify: `packages/app/src/lib/readFile.ts` (image branch), `packages/app/src/app/session.ts` (`SessionDoc.photo?: { url: string; boxes: MaskBox[] }`; `source` adds `'photo'`), `packages/app/src/chat/ChatApp.tsx` (file input `accept` adds `image/png,image/jpeg,image/webp`; a fourth sample card "Photo of a lab bill" that fetches `/samples/lab-bill.webp` and passes it through `readDocumentFile` like a user file), `apps/web/src/landing/Privacy.tsx` (photos: read on the device, the photo is never sent)
- Test: `packages/app/src/lib/readFile.test.ts`, `packages/app/src/components/PhotoPreview.test.tsx`

**Interfaces:**
- Consumes: `recognizeImage` (Task 9), `ocrMask` (Task 8).
- Produces: `readDocumentFile(file, { recognize?: (b: Blob) => Promise<OcrWord[]> })` returns `ReadDocument & { photo?: { boxes: MaskBox[]; width: number; height: number } }` for images; the session doc `text` is the OCR text. Web preview is read-only (the review card already controls what is unmasked; *plan call*, because in the web app the photo itself never leaves).

- [ ] **Step 1:** Consult modern-web-guidance: `search "image file upload preview"`, `search "accessible image description"`.
- [ ] **Step 2: Failing tests**: image file with mocked `recognize` → `text` from words, `photo.boxes.length` > 0 for a phone number word list; `rejects oversized image` (> 10 MB → existing message; > 6000 px side → "This image is too large to read on this device. Try a photo under 6000 pixels wide."); `no words` → `FileReadError` "Envoy couldn't find any text in this image."; `PhotoPreview` renders an `img` with alt "Your photo, with N private details boxed" and N box elements.
- [ ] **Step 3:** Run → FAIL; implement; run → PASS.
- [ ] **Step 4:** `make-sample-photo.mjs`: render `EN_LAB` text as a printed lab bill (HTML, system serif, letter width) in headless Chrome, screenshot, then in the same page draw it onto a canvas with 1.5° rotation, slight perspective, paper tint and noise; export WebP quality 0.8. Run it; check size ≤ 300 KB; Read the image to check legibility.
- [ ] **Step 5:** Real run: `npm run dev`, click "Photo of a lab bill", screenshot; boxes sit over name, ID, phone, email, address; the review card shows the same findings.
- [ ] **Step 6:** `npm run verify`; commit; PR "Photos: on-device OCR and auto-masking (web)"; CI; allow-preview; merge.

### Task 11: Auto-masking in the extension

**Files:**
- Create: `apps/extension/src/upload/boxes.ts`, `apps/extension/src/offscreen/ocr-handler.ts`
- Modify: `apps/extension/src/content/upload-ui.ts` (`setupImageEditor` ~line 408: request boxes, pre-draw, click toggles, status line; line 462 `card.innerHTML = ''` → `card.replaceChildren()`), `apps/extension/src/offscreen/main.ts` (import handler), `apps/extension/public/background.js` (route `envoy:ocr-boxes` content → offscreen, same pattern as `envoy:pdf-mask-internal`), `apps/extension/public/manifest.json` (`version` 0.1.3), `apps/extension/README` or `docs/EXTENSION.md` (OCR, store note: 0.1.3 is in the repo zip; the store may still serve 0.1.2 during judging)
- Test: `apps/extension/src/upload/boxes.test.ts`, `apps/extension/src/upload/upload.test.ts`

**Interfaces:**
- Consumes: `recognizeImage(blob, chrome.runtime.getURL('ocr'))`, `ocrMask` (with the person's rules from `apps/extension/src/rules`).
- Produces: message `{ type: 'envoy:ocr-boxes', dataUrl: string }` → `{ ok: true, boxes: MaskBox[], width: number, height: number } | { ok: false, error: string }`; `export function toggleAt(boxes: MaskBox[], x: number, y: number): MaskBox[]` (flips `on` of the top-most box containing the point; else unchanged); `burnImage` burns only `on` boxes.

- [ ] **Step 1: Failing tests**: `toggleAt` flips the containing box, leaves others, returns the same array contents when the point hits nothing; `burnImage` with one `on` and one `off` box fills only the `on` rect (mock canvas `fillRect` calls); status text "Found 6 private details on this device. Click a box to keep it visible." for 6 boxes; OCR failure → "Couldn't read text in this image. Draw boxes by hand." and the manual editor still works.
- [ ] **Step 2:** Run → FAIL; implement; run → PASS.
- [ ] **Step 3:** Build the extension (`npm run build -w apps/extension`), load unpacked in a normal Chrome profile, open a test page with a file input (`scripts/smoke-hosted.mjs` page or a local `upload-test.html`), choose `apps/web/public/samples/lab-bill.webp`; boxes appear pre-drawn; toggle one; send; the received file has the remaining boxes burned. Screenshot.
- [ ] **Step 4:** `npm run verify`; commit; PR "Extension: auto-masking photos"; CI; allow-preview; merge. Pack the 0.1.3 zip (store upload is the owner's step).

### Task 12: OCR eval

**Files:**
- Create: `tests/eval/run-ocr.mjs`, `tests/eval/ocr-results.json`, `tests/eval/ocr-page.html`
- Modify: `docs/EVAL.md` (new section "Photos: on-device OCR boxes"), `package.json` (`"eval:ocr"`)

- [ ] **Step 1:** `ocr-page.html` (served by the dev server) imports the product's `recognizeImage` and `ocrMask`. `run-ocr.mjs` (any Chrome via `scripts/lib/envoy-browser.mjs`): for 6 cases (`lease-01`, `offer-01`, `med-03`, `freelance-01`, `loan-01`, `noisy-03`), render the document, record gold rectangles of each `goldSensitive` value with DOM `Range.getClientRects()`, apply variants (clean serif, sans, 2° rotation, low contrast) via the Task 10 photo transform, then run OCR + `ocrMask`.
- [ ] **Step 2:** Metrics per variant and overall: box recall (gold rect ≥ 60% covered by `on` boxes), over-masking (box area not over any gold rect / total box area), OCR ms per page. Write `ocr-results.json` with date, Tesseract version `7.0.0`, Chrome version.
- [ ] **Step 3:** Run; write the EVAL section with the numbers and their limits (synthetic renders, English only, no handwriting).
- [ ] **Step 4:** Commit; PR "Eval: OCR boxes"; CI; merge. Update `docs/PLAN.md`.

## Part 5: Video v7 and release

### Task 13: Video v7 (target 2:45)

**Files:**
- Modify: `video/narration.json`, `video/record.mjs`, `video/record-private.mjs`, `video/film/layout.mjs`, `video/film/build.mjs` inputs; after upload: `apps/web/src/landing/demo-video.ts`, `README.md`, `docs/SUBMISSION_KIT.md`

- [ ] **Step 1:** Script the cut (scene: seconds): hook 0:00–0:12; problem 0:12–0:25; Wiretap on "Rental lease" (left real values, right tags, `{{RENT * 1.10}}` coming back, worked out here) 0:25–1:05; offline on the lease: airplane on, "What is my monthly rent?" answered locally, hold the rent-cap question, reconnect, it goes 1:05–1:40; extension photo auto-mask on the sample photo 1:40–2:10; numbers ("about a quarter of the text", 97.5% judge, 0% re-identification) 2:10–2:30; close 2:30–2:45. Narration ≈ 2.5 words/s.
- [ ] **Step 2:** Rehearse the private take (`record-private.mjs --rehearse`), then the real take through the take ledger with `VITE_CLOUD_MODEL=gemini-3.5-flash-lite` unless the ledger allows one Hydrogen take. Record the new scenes with `record.mjs`.
- [ ] **Step 3:** Narrate (stop model Chrome and the dev server first; `narrate_lowmem.py` in 4-line chunks), check every line with `check_lines.py` (≥ 90%), then `film/build.mjs --draft`; watch; final build. `ffprobe` duration ≤ 2:50; loudness about −16 LUFS.
- [ ] **Step 4:** Owner uploads to YouTube (public). Then update `demo-video.ts`, README and the kit with the new URL; `npm run verify`; PR; CI; merge.

### Task 14: Release

- [ ] **Step 1:** Re-run the `docs/SECURITY.md` release checklist on the final `main` commit, plus `npm run verify:wiretap`, `scripts/verify-offline.mjs --hold`, `npm run eval:check`, `node scripts/smoke-hosted.mjs`.
- [ ] **Step 2:** Record results in `docs/SECURITY.md`, `docs/PLAN.md`; PR; CI; merge.
- [ ] **Step 3:** Move `judging-2026-11-25` to the final commit (annotated, force-push the tag); `working-web-extension-2026-11-26` stays.
- [ ] **Step 4:** Regenerate the paste-ready Devpost, YouTube and Store texts (recorded Private-mode run link first) and give them to the owner by Mon 30 Nov 12:00 Cairo.

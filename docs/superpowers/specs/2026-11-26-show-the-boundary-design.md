# Final batch: show the boundary (design)

**Date:** 26 November 2026 · **Owner decision:** approach A, mobile skipped (no phone that runs Gemini Nano) · **Checkpoint before this batch:** tag `working-web-extension-2026-11-26` (main `59a32e1`).

## Intent

A judge has about three minutes of video and two minutes in the hosted app. Envoy's whole idea is a boundary: real values stay on the device; only masked, approved text leaves. Today that boundary is provable but hidden (the Network ledger drawer, `?inspect=1`, the eval docs). This batch makes it **visible in the main experience**, in four moments that each fit in a few seconds of video:

1. **What you see vs what leaves:** a split view, real document on one side, the exact text handed to the cloud on the other.
2. **One-click samples:** a lease, lab results and a freelance contract, so a judge never has to find a document.
3. **Offline, then online:** with no network, Envoy still answers locally; a question that needs the cloud is held on the device, then sent (masked, approved) when the network returns.
4. **Photos masked automatically:** a photo or screenshot of a document gets boxes over the private details before the person sees it, recognised on the device; they toggle boxes and send.

Then a new video cut (v7) that shows these and fixes the "about 15%" line (today's measured figure is 23.2%, "about a quarter").

**Success:** a judge who watches the video, or clicks one sample in the hosted app, sees raw values stay left and tags cross right, without opening a drawer or reading docs. Nothing shown is staged.

## Goals

- G1. Split "What you see / What leaves" view in the chat (web app and extension side panel), on by default where there is room.
- G2. Three one-click samples in the chat's empty state, reusing fictional documents from `tests/eval/cases.json`, each with a suggested question that the eval answered well.
- G3. Offline handoff: hold an approved cloud request while offline and send it on reconnect; local answers work with no network.
- G4. Auto-masking of document photos on the device (OCR + Envoy's existing detectors), in the extension's upload flow and in the web app.
- G5. Review fixes: document the device-guard queue, put the recorded Private-mode run first in the Devpost text, explain the video's 15% vs 23.2%.
- G6. Video v7, ≤ 3:00, then the final release record and the judging tag on the final commit.

## Non-goals

- Android or iOS apps.
- Firebase Authentication, Firestore, cloud sync of rules or receipts, rule packs.
- Barcode, QR or face detection (Chrome's `BarcodeDetector` is not available on Windows desktop Chrome).
- Handwriting, image-only (scanned) PDFs, languages other than English for OCR.
- Changing cloud models, re-running the cloud quality eval.

## Anti-goals (a failure even if it works)

- The "What leaves" pane shows anything other than the exact text Envoy handed to Firebase AI Logic, or implies a step left the device when it did not.
- Anything in the video that a judge can't reproduce in the hosted app or the extension.
- OCR fetching code or language data from a CDN at run time, or the raw image (or its OCR text) reaching the cloud unmasked.
- A sample or a held request persisted to storage.
- A change in the last 24 hours that breaks the judging build. Each part ships as its own PR; `main` stays releasable after every merge.

## Constraints

- Deadline Mon 30 Nov 2:00 PM PT; our target is Mon 6:00 PM Cairo. Commits after the deadline are not judged.
- Hard rules in `CLAUDE.md` stand: private steps `ONLY_ON_DEVICE` behind the device guard; no secrets or real personal data; evals use the real pipeline.
- Hydrogen: never probe or retry (20/day, failures count). Video takes go through the take ledger. Evals pin `VITE_CLOUD_MODEL=gemini-3.5-flash-lite`.
- One model Chrome (CDP 9333) at a time; model Chrome and Chatterbox can't run together on this machine. C: has ~1.6 GB free: tools and caches go on F:.
- CSP: the hosting CSP and the extension's `extension_pages` CSP have no `'wasm-unsafe-eval'`; WebAssembly OCR needs it (and `worker-src 'self'`, already set for hosting).
- The Chrome Web Store review of 0.1.2 is pending. A 0.1.3 with OCR may not clear review before judging: the repo's release zip is the judged artifact for the extension; say so in the docs.
- Lanes: Claude owns `packages/*`, `apps/web`, `apps/extension`. `tests/eval/**` and `docs/EVAL.md` are Argon's lane: small, focused edits only (new OCR eval file and one EVAL section), as in earlier batches.

## Approaches considered

| | What | Trade-off | Decision |
|---|---|---|---|
| **A. Show the boundary** | Wiretap view, samples, offline handoff, photo auto-masking, video v7 | All visible in the video, all on the privacy thesis; no new Firebase products | **Chosen by the owner** |
| B. More Firebase | A without auto-masking, plus Auth + Firestore rule sync and rule packs | Checks more product boxes; a sign-in screen and cloud storage of private words work against the thesis | Rejected |
| C. All of it | A + B | No buffer before the deadline | Rejected |

Within G4, OCR engine options: Chrome `TextDetector` (Shape Detection API) needs a flag on Windows, so judges wouldn't have it; Gemma 4 image input through the Prompt API gives text but not reliable word positions; **Tesseract.js** (Apache-2.0, WebAssembly, word bounding boxes, fully local when self-hosted) is the pick.

## Design

### 1. What you see / What leaves (G1)

- **Where:** `packages/app/src/chat/ChatApp.tsx`, so the web app and the extension side panel share it. Replaces the right-hand Network ledger drawer as the main surface; the existing `NetworkInspector` stays for `?inspect=1` and narrow screens.
- **Layout:** wide screens (≥ 1280 px): the thread on the left, a pane on the right with two stacked sections:
  - **What you see:** the current document with detected values highlighted (the same spans the review card uses).
  - **What leaves:** one card per network event from `networkLog`, newest last: device steps labelled "Stayed on this device" (collapsed, payload viewable), cloud steps labelled "Sent to <model>" with the exact payload, tags highlighted. The cloud's reply is shown as its own "Came back" card (masked text, `{{EXPR}}` highlighted), followed by "Worked out here": each expression and the restored value.
  - A one-line counter: characters in the document vs characters sent to the cloud this turn.
  - Empty state: "Nothing has left this device."
- **Narrow screens and the side panel:** a toggle in the toolbar ("What leaves"); the pane opens over the thread, same content.
- **Data:** extend `NetworkEntry` (`packages/ai/src/network-log.ts`) with `direction: 'out' | 'in'` (default `'out'`) and record the cloud reply text as an `'in'` entry in the pipeline's cloud step. Restored expressions come from the answer's `spans` (`computed: true`). No new storage: the log stays in memory for the tab.
- **Honest label:** the pane says "The exact text Envoy handed to Firebase AI Logic." It does not claim to show HTTP bytes; the SDK wraps the text in its own JSON request.
- **Default:** open by default on wide screens in the web app; remembered per viewer in `localStorage` (try/catch).

### 2. One-click samples (G2)

- Three cards in the empty state, replacing the single "Try the sample lease" button:
  - Rental lease (the current sample and question).
  - Lab results (`med-*` case document).
  - Freelance contract (`freelance-*` case document).
- Each card loads the case document as a sample doc (same path as today's lease, `source: 'sample'`) and fills in a suggested question from a case whose recorded results were good (builder picks from `tests/eval/results.json` / `quality-results.json`: correct route, full or correct judge score on Gemma 4).
- Copy the three documents into `packages/app/src/chat/samples.ts` (fictional people and IDs, as in `cases.json`). The existing `?sample=lease` link keeps working; add `?sample=lab` and `?sample=freelance`.

### 3. Offline, then online (G3)

Today: `OfflineBanner` shows; a cloud-routed question falls back to a "lighter answer on this device", or shows the offline error.

- **Add a third choice on the approval card when offline:** "Send when I'm back online". The approved, masked request is kept in memory (never stored); the turn shows "Held on this device: waiting for the network". On the `online` event it is sent through the normal cloud step (fresh App Check token), and the turn continues as usual. "Answer on this device now" (the lighter answer) stays. Cancel discards the held request.
- If the tab is closed while a request is held, it is gone (said in the card).
- **Verify the real thing in the model Chrome** (first task of this part): load the app, go offline, ask a local-route question in Private mode and confirm an on-device answer with no network (the SDK's `ONLY_ON_DEVICE` path, App Check and Remote Config must not block it). If the SDK needs the network for on-device calls, the plan reports that and the design changes before any UI work.
- Update the banner copy to match the three choices.

### 4. Photos masked automatically (G4)

**Shared core (new module, `packages/core/src/ocr-mask.ts`, pure, no network):** given OCR words with boxes, build the text with a character-offset → word-box map, run `scanText` (built-in detectors and the person's rules), and return one box per detected span (union of the word boxes it covers, padded a few pixels), each with its finding type. Unit-tested with synthetic word lists.

**OCR engine:** `tesseract.js` (pinned exact version), English `tessdata_fast` traineddata, worker and WASM core **self-hosted** (copied into the build output; `workerPath`, `corePath`, `langPath` set to our own files; no CDN). Loaded only when an image is chosen. Add `'wasm-unsafe-eval'` to `script-src` in the hosting CSP and to the extension's `extension_pages` CSP; note the change in `docs/SECURITY.md`.

**Extension (`apps/extension/src/content/upload-ui.ts`):** when an image is chosen, the content script sends the bytes to the offscreen document (it already hosts the model and PDF handling) which runs OCR + `ocr-mask` and returns boxes. The image editor opens with those boxes pre-drawn; click a box to toggle it, drag to add one (as today). Status line: "Found 6 private details on this device. Click a box to keep it visible." Burn and re-encode as today.

**Web app:** the composer accepts images (`.png`, `.jpg`, `.webp`). The photo opens in a preview with the same pre-drawn boxes (toggle as above). The OCR text becomes the session document, so the normal pipeline runs on it (review card, approval, What leaves). The photo itself is never sent; the masked text is. A fourth sample, "Photo of a lab bill", is an image of the fictional lab sample drawn on a canvas in the browser when clicked (no image file to ship; *my call*), labelled "sample photo", so a judge can try it without their own photo. OCR text reaches `readDocumentFile` callers the same way a text file does (`packages/app/src/lib/readFile.ts` gains an image branch returning text plus boxes; *my call*).

**Measured:** a small eval, `tests/eval/run-ocr.mjs`: render 6 case documents to images (two fonts, one rotated 2°, one low contrast) and run the **product's** OCR + `ocr-mask` code in a browser page driven by `scripts/lib/envoy-browser.mjs` (no model needed, so any Chrome works; *my call*, so the eval runs the same code path as the app). It reports box recall (detected PII spans that got a box) and over-masking. Results dated and labelled with the Tesseract version. One section in `docs/EVAL.md`.

### 5. Review fixes (G5)

- `docs/SECURITY.md` or `docs/REVIEW_RESPONSE.md`: the device guard already serializes every model call through one queue (`inAiQueue`), and the cloud tripwire only refuses the AI endpoint; App Check and Remote Config requests pass. State the remaining limit honestly.
- `docs/SUBMISSION_KIT.md` (Devpost text): the recorded Private-mode run link first, next to the hosted app.
- README / EVAL: one line explaining the video's figure, until v7 replaces it.

### 6. Video v7 and release (G6)

- Reuse the v2 pipeline (`video/`: record scenes, private take through the ledger, Chatterbox narration, `film/build.mjs`). New scenes: split view on a sample, offline hold and reconnect, photo auto-masking in the extension. Narration says "about a quarter of the text". ≤ 3:00.
- The owner uploads v7 to YouTube; then update `apps/web/src/landing/demo-video.ts`, README and the Devpost text with the new link.
- Release re-check (`docs/SECURITY.md` list), `npm run eval:check`, then move `judging-2026-11-25` to the final commit. `working-web-extension-2026-11-26` stays where it is.

## Order (each part a PR; stop after any part and main is releasable)

| Day (Cairo) | Work |
|---|---|
| Thu 26 | Design + plan; part 1 (What leaves) |
| Fri 27 | Part 2 (samples); part 3 (offline): verify first, then the hold |
| Sat 28 | Part 4: core + web app, then extension; OCR eval |
| Sun 29 | Part 5 docs; video v7 (record, narrate, build); owner uploads |
| Mon 30 | Buffer; release re-check; final tag; Devpost text by 6 PM Cairo |

If time runs short, cut from the end of part 4 first (extension OCR, then the OCR eval), never the video.

## Left to the builder

- Exact visual treatment of the pane (follow the existing UV theme and tokens).
- Which eval cases supply the lab and freelance questions (pick from recorded good results).
- Tesseract.js version and traineddata variant, within the self-hosting rule.
- Whether "What you see" scrolls in sync with "What leaves".
- Test layout and names.

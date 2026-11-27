# Envoy — plan and status

Statuses: **wired** (works end to end in the app) · **built** (code and tests exist, not yet in the app) · **stubbed** · **todo**. Never report built as wired.

Design: `docs/superpowers/specs/2026-11-22-envoy-design.md` · Current plan: `docs/superpowers/plans/2026-11-22-envoy-foundation-and-core.md` · Rules: `docs/HACKATHON_RULES.md` · PAIR strategy: `docs/PAIR_GUIDEBOOK_STRATEGY.md` · Skills: `docs/skills/` (`harness2`, `muse-image`, `pair-ai-ux`, `pair-ai-eval`, `chrome-built-in-ai`, `firebase-ai-logic-hybrid`)

Companion artifacts (owner's claude.ai): [plan doc](https://claude.ai/artifact/16tr6t9mttMYwaWLdh8rkH) · [mockups](https://claude.ai/artifact/5jsHsbktxxskhCPpm69Pni) · [pitch deck](https://claude.ai/artifact/BF5tb3wC4S2ubRymjDqTv6)

## Status 2026-11-27 (last batch before submission)

- **Landing:** each sentence of the slogan on its own line; "Five steps" is now a step walkthrough (this device, the guard, the cloud; plays only on screen, pause button, reduced motion respected); the guard section describes firebase-js-sdk #10635 as an open report we haven't reproduced ("Every private step is checked twice"); "Built on Firebase, on purpose" (AI Logic, App Check, Remote Config, Hosting, the Android SDK; Auth and Firestore left out on purpose). (#65, #68)
- **Documents:** .docx/.xlsx/.pptx read on the device, with zip-bomb limits (`packages/core/src/office.ts`). (#66)
- **Voice:** read aloud with local voices only; dictation only with Chrome's on-device recognition. (#66)
- **Photos:** faces (MediaPipe BlazeFace, self-hosted; its usage logging removed at build: `packages/app/src/build/no-telemetry.ts`) and licence plates (new PLATE type). Verified under the live CSP and in the extension E2E. (#66, #70)
- **Android companion (`android/`):** Kotlin + Compose, `firebase-ai` + `firebase-ai-ondevice`; device guard (`checkStatus()` before, `inferenceSource` after); parity tests against the TypeScript engine in CI; emulator: Basic protection and a real App Check-protected cloud answer, values restored. Not yet run on a phone with Gemini Nano. (#67)
- **GPU benchmark:** median 125 s (laptop CPU) to 10.6 s (cloud L4), 17/17 Private, 0 cloud calls (`docs/benchmarks`). (#67)
- **Adversarial suite:** 352 generated cases, 282/282 attacks blocked, 0/70 harmless blocked; it found and we fixed URL-encoded and letter-by-letter leaks. (#67)
- **Signed receipts** (WebCrypto ECDSA P-256; `scripts/verify-receipt.mjs`), **browser-measured request count**, **Firebase stack live in About**. (#67)
- **Extension:** pastes with private details flagged; Enter on a message that still has them is held once; "Protect AI chats" (ChatGPT, Claude, Gemini, GitHub). E2E 48/48. (#68, #70)
- **Languages:** Spanish DNI/NIE, French NIR and phones, dates in ES/FR/DE, European amounts (web and Android). (#69)
- **Enterprise:** organisation policy pack through Remote Config `policy_pack` (client support and tests; no pack published on the live project, owner decision). (#69)
- **Release:** [v0.2.0-android-extension](https://github.com/hesham88/envoy/releases/tag/v0.2.0-android-extension): extension 0.1.4 (unpacked) and the Android debug APK. The Chrome Web Store published 0.1.3 on 27 Nov (https://chrome.google.com/webstore/detail/ekmjefnebmjbeahkadaheapbgpgkabkd); 0.1.4 is on GitHub.
- **Checks (27 Nov, main `a45a46f`):** `npm run verify` 534 tests; extension E2E 48/48; hosted smoke 14/14 (live, headful); OCR eval 203/208; Android CI (unit + parity + APK) green.
- **Devpost story v2** (#73): `docs/SUBMISSION_KIT.md`, Markdown with tables, images, links, known limits and a Q&A.
- **Demo film v9 (rendered 27 Nov, 2:57; replaces v8, which the owner reviewed and which was never published):** `video/out/envoy-demo-v9.mp4` + `.srt` (not committed).
  - **Story:** it follows Mona across every surface: the intro and the problem; the promise (one clause leaves, `{{RENT * 1.10}}` on the laptop, the badge photo boxed); her real Private-mode session on Gemma 4 (approve, then the answer); the edge (the guard, offline answers, a signed receipt shown in the app); the extension holding her paste, her badge photo, the three-step Android app; Firebase on purpose (live stack, on-device model available); the measured results; "Live now, no sign-in".
  - **Narration:** lines are split into parts and placed on the moments they describe (`video/narration-v9.json`, `build.mjs --v9`).
  - **Checked:** a sync sheet (one frame per line, 28 lines); Whisper on the mix (95.9% words; the rest are digits); −16.1 LUFS.
  - **Owner notes applied:** no terminal, no crops, wait notes say only "Wait cut", the slogan never split.
  - **Owner uploads it to YouTube.** Then the video ID goes into `demo-video.ts`, the README and the Devpost field.
- **Fixed while filming (#73):** the paste chip slid under the Upload button; the held card scrolled sideways on short screens; employee, staff, payroll and badge numbers weren't masked (web and Android). Landing: the measured section now cites the adversarial suite and the GPU run.
- **Demo film v9 published (27 Nov):** https://www.youtube.com/watch?v=n7IuGRGjLbU, embedded on the landing page (`demo-video.ts`) and linked from the README and Devpost; it replaces v7.
- **Android rework (#75, #76):** three steps (Document → What leaves → Answer) with a sticky action bar, tags as coloured chips and a timeline recorder; the Envoy mark in the top bar and as the adaptive launcher icon.
- **Chrome Web Store:** 0.1.3 is published (https://chrome.google.com/webstore/detail/ekmjefnebmjbeahkadaheapbgpgkabkd); the landing page says "Add to Chrome". 0.1.4 is packed for the store, waiting for the owner to upload it.
- **Google Play (FS-T19):** sub-plan in `docs/superpowers/plans/2026-11-27-android-play-store.md`. New personal accounts need a 14-day closed test with 12 testers before production.
- **Checks (27 Nov, after the fixes):** `npm run verify` 536 tests; extension E2E 49/49; Android unit and parity tests green.
- **Next:**
  - The owner reviews and uploads v9, submits extension 0.1.4 to the Web Store (`apps/extension/envoy-extension-0.1.4-store.zip`), and says which Play developer account exists (FS-T19).
  - Then: swap the video ID in; revoke the emulator's App Check debug token after the film is approved; cut a judging tag after the freeze.

## Status 2026-11-26 (final batch: `docs/superpowers/plans/2026-11-26-show-the-boundary.md`)

- **Checkpoint:** tag `working-web-extension-2026-11-26` (main `59a32e1`), the working web app + extension before this batch.
- **Fix (#55):** an unknown tag name in a cloud expression no longer borrows another amount (`{{DEPOSIT * 2}}` with only `[RENT]` stays unevaluated).
- **What you see / What leaves (wired):** split view in the chat (`WiretapPane.tsx`, `wiretap.ts`): the document with real values highlighted on this device's side; on the wire side the exact excerpt handed to Firebase AI Logic, Envoy's fixed instructions (collapsed), what came back, and each `{{EXPR}}` worked out on the device. The network log now records the cloud's reply and refused requests. Proven against the real request by `npm run verify:wiretap` (`docs/SECURITY.md#wiretap-check`).
- **One-click samples (wired):** five fictional documents from real situations (lease, job offer, lab results and bill, freelance contract, solar loan; `packages/core/src/samples/en-more.ts`), each with questions labelled "on this device" or "cloud, masked" (`packages/app/src/chat/samples.ts`, `SampleCards.tsx`); `?sample=<id>` links. Checked live on Gemma 4 by `scripts/verify-samples.mjs` (`tests/eval/probes/sample-routes.json`): 16/16 checked questions went where their labels say, every on-device one answered on the device with 0 cloud calls; routing varies between runs, so the cards say "usually". Core now detects MRN, medical record, patient, claim, accession and specimen numbers.
- **Offline, then online (wired):** while offline the approval card offers "Send when I'm back online"; the approved, masked excerpt waits in memory and is sent once on reconnect (`held` phase in `session.ts`). Live check `scripts/verify-offline.mjs --hold` passes on Gemma 4 (26 Nov): offline, the lease question is answered on the device with 0 cloud requests; a cloud question is held, sent exactly once on reconnect, and answered.
- **Photos masked automatically (wired):** Tesseract.js 7.0.0 + zxing-wasm 3.1.6, self-hosted (`scripts/copy-ocr-assets.mjs`, CSP gains `'wasm-unsafe-eval'` only, `docs/SECURITY.md`); `ocrMask` in core maps detections to word boxes. Extension 0.1.3: the upload card reads the photo in the offscreen document and pre-draws a labelled mask on every private detail, barcodes and QR codes included; each mask is a button. Web app: a photo becomes a document (its OCR text goes through the normal pipeline; the photo shows boxed on the What you see side and is never sent); the lab card offers a sample photo (`scripts/make-sample-photo.mjs`). Measured by `npm run eval:ocr` (26 Nov, Chrome 158): 203/208 private details boxed (97.6%) across six eval documents in four looks, median 1.4 s per page, no outside host contacted (`docs/EVAL.md` section 7). Extension E2E 44/44, including six photo checks.
- **Web Store rejection fixed (extension 0.1.3):** the store rejected 0.1.2 for remotely hosted code (Firebase's gtag/api.js/reCAPTCHA URLs in the bundle). Release builds now alias `firebase/app-check` to an inert stub, strip remote defaults at build time, and `apps/extension/scripts/check-remote-code.mjs` fails any build that still names remote code (`docs/SECURITY.md`). Owner step: upload the 0.1.3 store zip (`npm run pack:store -w @envoy/extension`).
- **Demo video v7 (rendered 26 Nov, 2:58):** `video/out/envoy-demo-v7.mp4` (not committed). One continuous Private-mode take on Gemma 4 with Flash-Lite (`video/record-private.mjs`: guard kept, What leaves with `{{RENT * 1.10}}` = EGP 9,350 worked out on the device, offline answer with 0 bytes, a held question sent once on reconnect) plus the sample cards and extension photo masking (`video/record-v7.mjs`); narration `video/narration-v7.json` (Chatterbox, every line transcribed back). The Hydrogen take failed on 26 Nov (fallback after 183 s; no retry that day). Public on YouTube: https://www.youtube.com/watch?v=ZO1DbGUI4Mk (replaces v6 on the website, README, kit and Devpost text).
- **Release re-check (26 Nov, `caf2c08`):** verify 492 tests, extension E2E 44/44, offline check on Gemma 4, OCR eval 97.6%, hosted smoke 13/14 (App Check refuses automated browsers; real answer arrived), audits unchanged. `docs/SECURITY.md`. Tagged `judging-2026-11-26` on `fbfc61c` (owner decision: a new tag; `judging-2026-11-25` stays on 25 Nov's commit).
- **Chrome scratch off C: (26 Nov):** test, film and render scripts left Chrome profiles in `C:\...\Temp` (57 found; the e2e cleanup sat in a `setTimeout` that `process.exit()` skipped). Every script that starts Chrome now imports `scripts/lib/scratch.mjs` first: TEMP/TMP/TMPDIR point at `node_modules/.cache/envoy-tmp` on the repo's drive, each run deletes its own folder before exit, and leftovers older than 6 h are swept. `apps/extension/src/scratch-guard.test.ts` fails on `tmpdir()`, a delayed `rmSync`, or a Chrome launch without the import. E2E 44/44, with nothing left behind.

## Status 2026-11-25

- **Evaluation artifacts synchronized & verified (PR #48; tag `judging-2026-11-25` moved to the final commit on 25 Nov):** added `tests/eval/check-artifacts.mjs` (`npm run eval:check`, wired into `npm run verify`) to verify team rating math, exact `sha256(envoyAnswer)` hashes and `answersFrom.runId` in `tests/eval/probes/quality-ratings-team.json`, `runId` and `answerQuality.{judge,team}` in `tests/eval/summary.json`, doc numbers (`docs/SUBMISSION_KIT.md` stale `87.5%` updated to `95%`), and forbidden-wording checks. Re-ran offline `npm run eval` with zero metric drift.
- **Team check & reviewer naming:** updated wording across artifacts, landing page and docs to `Checked by the team: our AI coding assistants and human reviewer`, and renamed the outside reviewer from `ChatGPT` to `Codex Astra (OpenAI)` / `Codex Astra` (preserving website mentions).
- **Single judge route & explicit limits:** linked README's top judge CTA to `#judges-a-two-minute-test` and aligned README, `docs/DEVPOST.md`, and `docs/SUBMISSION_KIT.md` on the Chrome setup requirement, `/app?recorded=1`, and the 2-minute lease test. Documented finite benchmark scope (36 English docs / 263 details / 28 attacks; multilingual, unusual account formats, and ambiguous personal references planned next) and extension limits (manual image boxes, simplified text PDFs, embedded hosted web app for App Check). Video left unchanged as requested.
- **Release re-check (`judging-2026-11-25`; checks first run on `4240973` and `6aba52b`, re-run on `3861984` after PR #53):** `npm run verify` (410/410 tests, including `eval:check` A–E), offline `npm run eval`, extension E2E (`38/38`), live headful smoke E2E (`14/14`), and the full security sweep (`docs/SECURITY.md`) passed; live hosting headers and deployed landing JS confirmed. Later commits update docs only.
- **Bring your own keys and models (25 Nov, docs only):** `docs/BRING_YOUR_OWN.md`, linked from the README: own Firebase project, App Check, key restrictions, cloud models through Remote Config or `VITE_CLOUD_MODEL`, quota and content-free monitoring, hosting and the extension. Planned after judging: a model list in Remote Config, token usage in the flight recorder, a model check script.
- **Final polish & hardening (25 Nov):** registered `docs/BRING_YOUR_OWN.md` in `links.test.ts` and `fix-anchors.mjs`; restored `basic` arm Re-ID & attribute metrics in `tests/eval/summary.json` from the committed cache (guarded in `eval:check`); added `%` / comma support in `expr.ts` and aliased money tag resolution (`{{MONTHLY_BASE_SALARY * 1.8}}` → `[SALARY]`) in `restore.ts`; included Preamble (`id === 0`) in `selected` scope and `selectedIds` in `AppShell`; collapsed `FlightRecorder` in `review` phase so `Approve and send` is above the fold; styled `/dev` in `.envoy-uv` with back navigation; added ZIP offset bounds and 10 MB size checks in the extension upload reader; updated stale lines in `docs/REVIEW_RESPONSE.md`; added `/dev` `#10635` check to `scripts/smoke-hosted.mjs`.

## Status 2026-11-24

- **Calculation check on the route, re-measured (24 Nov evening):** questions that need a figure worked out always go to the reasoning step (`guardRoute` in `packages/core/src/prompts.ts`). Gemma 4 re-measured on it: 36/36 Private, 0 leaks, 6.1% false masks, 86.1% clause accuracy, route accuracy 80.6% (was 55.6%), 23.2% of the text sent (was 14.5%: calculation questions now send a masked excerpt instead of being answered wrongly on the device), p50 73 s; re-identification and attribute inference re-run on the new outbounds, still 0.0% / 0.0%. Answer quality on 20 questions: 97.5% (Flash-Lite judge, was 95.0%), 95.0% checked by the team (was 87.5%; 18 correct, 2 partly right, 0 wrong); Basic 97.5% both ways. AI Logic Monitoring left off on purpose (it stores prompts); traffic is watched on the metrics pages (`docs/FIREBASE_AI_LOGIC_REVIEW.md`). reCAPTCHA App Check threshold 0.3.
- **Upload with Envoy fixed (tested on Google AI Mode):** Google has no file input until its own menu opens, so the button is now offered on every message box, beside Envoy's chip above the composer frame; the rebuilt file is handed over by drop (Google accepts it), else paste, else Envoy catches the site's own attach button (no dialog). The card says which route worked, fits the room above or below, and stays left-to-right on RTL pages. Statement headings are no longer names; "Grey Inc" is an organisation. Extension e2e 37/37.
- **Clean-profile smoke test** of the hosted app (`scripts/smoke-hosted.mjs`): 12/12 in a new Chrome window, including a real cloud answer through App Check. Headless Chrome is refused at App Check's reCAPTCHA exchange (scored as automated), as expected; a failed cloud step now says why instead of showing raw SDK text.
- **Security (24 Nov):** App Check was not enforced for Firebase AI Logic and the browser key had no referrer rule (a token-less, referrer-less request was answered). On the owner's go-ahead both were fixed: App Check ENFORCED on `firebaseml.googleapis.com`, and the key limited to the site, the extension, localhost and each PR preview host (`scripts/allow-preview.mjs`; a mid-host `*` doesn't match) plus the four Firebase APIs used. Verified by behaviour.
- **Judges:** `docs/GEMMA4_SETUP.md` gives the exact Gemma 4 setup (Chrome 158.0.8127.38, one developer-trial flag, model 2026.11.3.1140). The recorded run is at `/app?recorded=1`.
- **Video:** v5 rendered (2:50, -16 LUFS, English .srt), narration names Fast, Gemini 4 Hydrogen and Local only. Owner uploads to YouTube; the site embeds it once the link exists.

## Status 2026-11-23

- **Extension end-to-end suite** (`npm run test:e2e -w @envoy/extension`): 20/20 on the real build. It found and fixed two bugs: PDF upload crashed (offscreen documents have no `chrome.storage`), and photo boxes drawn after choosing the file were never applied.
- **Security sweep:** `docs/SECURITY.md`. Extension messages are now checked by sender, origin and payload.
- **Firebase review:** `docs/FIREBASE_AI_LOGIC_REVIEW.md` and a new skill, `docs/skills/firebase-ai-logic-production`. Owner steps: restrict the API key, turn on AI monitoring, check the Hydrogen quota.
- **Review points:** `docs/REVIEW_RESPONSE.md` maps every point of both Codex Astra (OpenAI) reviews, Argon's audit and PAIR to its status.
- **Latency:** an in-memory cache reuses the on-device result for the same document, question and rules in a tab. The README says times vary by device.
- **The CLI hook (`packages/cli`, envoy-guard) was removed** on the owner's request.
- **23 Nov reviews adopted** (`docs/REVIEW_RESPONSE.md`): history is opt-in; the cloud model is a saved setting (Remote Config `cloud_default = fast`); honest skipped rows in the flight recorder; code links tested; heading names, PDF offsets, receipt clause count, secret newline, offscreen schema fixed; `/studio` and `/classic` dev-only; e2e 23/23 incl. ProseMirror and Quill.
- **Delivery (23 Nov):** PR #23 (Argon's eval upgrade) merged; merges to `main` deploy automatically through CI (least-privilege `github-deploy` service account); repo homepage set; the integration checkout and every lane branch are on `main` (old integration edits in `stash@{0}` and `_backup-1527/integration-2026-11-23`). Pending: re-measure the `nano` arm with answers after the heading fix (about an hour on the model Chrome).
- **Gemini Nano 3 dropped (23 Nov, owner rule: re-measure if it works, otherwise remove):** it ran 12 cases, then crashed repeatedly on the 16 GB laptop. Removed from the eval arms, summary, site, README and guide. Its live run did find two private-path false blocks, now fixed (generic role words as organisations, bare numbers as money). Gemma 4 is restored in `F:ChromeEnvoy` (flag on, `gemma4_component` Ready).
- **Video:** recorded on Gemma 4 (one real take, the on-device wait cut and labelled), Chatterbox narration, original music and effects, built with ffmpeg (`video/film/build.mjs`).

> **Everything below this line is history** (plans and checklists as they were written on 22 Nov). The status blocks above are current; where they disagree, they win.

## Foundation and privacy core (plan 1)

| #   | Task                                                  | Status                                                                                                                   |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Repo, workspaces, quality gate, GitHub                | built                                                                                                                    |
| 2   | Firebase project, AI Logic, Hosting config            | wired (AI Logic `gemini-developer-api`, reCAPTCHA Enterprise, App Check & localhost debug token configured 2026-11-22)   |
| 3   | `packages/ai`: init, App Check, Remote Config, models | built                                                                                                                    |
| 4   | Device guard (#10635) and network log                 | built                                                                                                                    |
| 5   | `/dev` page, deploy, CI                               | wired (live; CI deploy needs owner secrets)                                                                              |
| 6   | Types, normalize, chunk                               | built                                                                                                                    |
| 7   | Fictional sample lease                                | built                                                                                                                    |
| 8   | Rule detectors, prompts, parsers                      | wired (v1 prompts verified live on Gemini Nano 4 `gemma4_component` 2026-11-22)                                          |
| 9   | Merge, tags, masking                                  | wired                                                                                                                    |
| 10  | Outbound guard                                        | wired                                                                                                                    |
| 11  | Restore and local expressions                         | wired (`{{RENT * 1.10}}` → `EGP 9,350` verified live with `gemini-3.5-flash-lite`)                                       |
| 12  | Receipt and wired pipeline, dev panel                 | wired on /dev (Private mode on Gemini Nano 4 + cloud reasoning + local algebraic restore verified end-to-end 2026-11-22) |

## Product UI (plan 2: docs/superpowers/plans/2026-11-22-envoy-product-ui.md)

| #   | Task                                          | Status                                                                                                               |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Tooling, fonts, Tailwind tokens, jsdom tests  | built                                                                                                                |
| 2   | Logo + favicon                                | built (refine with Muse concepts at launch)                                                                          |
| 3   | composeOutbound (hide / share / clause picks) | built                                                                                                                |
| 4   | Session state machine + runtime hook          | wired                                                                                                                |
| 5   | Start screen + on-device guide                | wired                                                                                                                |
| 6   | Review screen                                 | wired (Basic protection verified in a browser)                                                                       |
| 7   | Answer screen + receipt                       | built (cloud answer needs owner steps 1–4)                                                                           |
| 8   | Offline (service worker) + banner             | wired (verified offline on the live site)                                                                            |
| 9   | About, Network inspector, a11y                | wired                                                                                                                |
| 10  | Polish gate                                   | in progress: Lighthouse a11y 100, best practices 100, SEO 91; dark-theme toggle, 1024px check and perf trace pending |

## Next plans

Motion polish → eval and Harness² tuning (**ALL 6 ARGON MILESTONES COMPLETED 2026-11-22 on `lane/eval-harness`**: **full `36/36` live arms** for Default Gemini Nano `nano_v3_cpu_component 2025.8.21.1028` (`100%` recall, `0` leaks, `83.3%` clause acc, **`10.2%` min ratio / `89.8%` reduction**, `0%` Re-ID, `0%` attr inf, `100%` quality retained), Gemma 4 `gemma4_component 2026.11.3.1140` (`100%` recall, `0` leaks, `88.9%` clause acc, `21.9%` min ratio, `0%` Re-ID, `0%` attr inf, `100%` quality retained), and Basic `36/36`; Guard red-team `11/28 -> 17/28` post-PR #11; Secrets `100%` recall / `94.1%` precision + 6/6 CustomRule; `tests/eval/summary.json` stable contract) → Chrome extension → launch (assets, README, video, Devpost).

## Chrome extension (Muse lane: lane/extension)

- **Built and E2E verified (2026-11-22):** Vite + React package (@envoy/extension) on the shared @envoy/ui design system, reusing @envoy/core + @envoy/ai. F: profile E2E: Private mode, Clause 7 only, Guard clean, 235 chars sent, EGP 9,350 restored on-device.
- **Release safety (urgent fix done):** plain `npm run build` is the release build and is the only writer to dist/; dev builds (extensiondev, debug token) go to gitignored dist-dev/. `npm run check:dist` is the pre-zip canary gate (verified: canary in dist-dev only, never in dist/). Never commit dist/, dist-dev/, tokens or .env.local.
- **Judges build:** release runs on-device only; cloud-routed questions hand off to the hosted web app (real reCAPTCHA App Check). Alternative (owner decision): a dedicated judging-only debug token, revoked after Dec 16, 2026.
- Remaining: a packed-build App Check test is only needed if the owner picks the judging-token option.
- **Milestones 1-5 done (2026-11-22, commits 89f3f38..0804fd7 on lane/extension, PR #8):** M1 per-site opt-in text-box protection (ring, findings card, Apply/Undo, offscreen deep check); M2 Upload with Envoy (masked rebuilds, EXIF strip + burn-in boxes, honest PDF rebuild, receipts); M3 Privacy Flight Recorder + Your rules (envoy-guard JSON); M4 signature motion, onboarding, offline state; M5 npm run pack zip (token-gated), real-UI store assets, DEMO.md. Open items: DelegationScene in the panel (deferred - seal used instead). Deep-finding merge and all five store screenshots were verified in the F: profile on 2026-11-22: the model added an [ADDRESS] finding beyond rules, masked in the After preview.
- **Milestone 1 done (2026-11-22):** per-site opt-in content script. Dynamic registration from the popup (host permission requested in the popup click - a service worker has no gesture), animated device-green/cloud-blue field ring with guilloche conic trace (reduced-motion safe), debounced rules scan via scanText, findings card with keep/mask, before/after preview, Apply (native setter / execCommand) and Undo. Never mounts on password/OTP/cc/payment-iframe fields. Deep check runs in an offscreen extension page through runPrivate (Prompt API is exposed on extension pages, not in content scripts). Browser-verified on a local test page incl. Apply/Undo round-trip; 7 extension unit tests green.

## Model under test (rule, 2026-11-22)

- Every on-device result so far ran on **Gemma 4** (`gemma4_component`), enabled only by the developer-trial flag `gemma4-for-built-in-ai` plus CPU-backend launch options. Judges on ordinary Chrome will most likely get the **default Gemini Nano**, and neither Firebase AI Logic nor the Prompt API can choose or report which model ran.
- **Rule:** every eval number, timing or quality claim names the model (component name and version from `chrome://on-device-internals`). The README and video quote results from the **default model**, or label Gemma 4 results as such.
- **Plan:** a second test profile `F:ChromeEnvoyNano` (flag off, TEMP on F:) so the eval and the prompt probes run on both models; the prompts are tuned to pass on the default model first.

## Cloud model

Two cloud models through Remote Config: `cloud_model_fast` = `gemini-3.5-flash-lite` (about 1.4 s) and `cloud_model` = `gemini-4-hydrogen` (10–50 s, more careful). `cloud_default` = `fast` decides what people get until they choose in the composer; their choice is saved in the browser. Override locally with `VITE_CLOUD_MODEL`. Fallback chain (23 Nov): Hydrogen runs `ONLY_IN_CLOUD`; if it fails (free tier: 20 requests/day, it ran out on 23 Nov and showed "cloud unreachable"), `deps.reasonFallback` (Flash-Lite, `PREFER_IN_CLOUD`) answers and the answer says so; only then the device. A refused request is still listed in the ledger.

**Round 3 reviews (24 Nov):** Gemma 4 re-measured on the current pipeline (36/36 Private, 0 fallbacks, 0 leaks, 7.1% false masks, 14.5% of the text sent, p50 72 s) **with answers**: 95.0% quality retained (Flash-Lite judge), 87.5% checked by the team (`tests/eval/probes/quality-ratings-team.json`); Basic 97.5% both ways. The four weak Private answers are on-device answers to calculation questions the router should have sent to the cloud (route accuracy 55.6%): a candidate fix, not done. Demo trace re-recorded (EGP 9,350 worked out on the device); README screenshot retaken in Private mode; landing table shows answer quality; Nano 3 wording dated; Chatterbox disclosed; DEVPOST 15%, recorded-run link, judge variance note.

**Demo film v4 (24 Nov):** 2:50, built by `video/film/build.mjs` from real takes (private scenes: Gemma 4 on this laptop, Flash-Lite answering; narration names all three choices: Fast, Gemini 4 Hydrogen, Local only). Smooth sub-pixel camera, Envoy mark in the opening. Output kept outside git (`_backup-1527/envoy-demo-v4.mp4`). Optional: a Hydrogen take, guarded by the Hydrogen ledger in `record-private.mjs` (20 requests/day, failures count). Next: owner uploads to YouTube (public, English subtitles from the .srt).

**Recorded run (23 Nov):** `/app?recorded=1` replays the real Gemma 4 trace (`tests/eval/probes/demo-trace-gemma4.json`, recorded 22 Nov) for judges without the model: labelled as a recording, real step times, outbound text, answer, ledger. Linked from the Basic-protection status, the private-mode guide and the landing page's judges section. `RecordedRun.test.tsx` keeps the bundled copy identical to the trace.

## Judge experience (must-have)

- Many judges can't run the on-device model (one field study found about 41% of users could), and Chrome 157+ keeps on-device AI off until it's enabled in Settings → AI.
- The hosted app shows a clear "Turn on on-device AI" guide.
- Basic protection is fully polished.
- The video shows the full on-device flow.

## Judge-feedback push (2026-11-22, after an independent review scored 7.75/10)

- **Done (Claude lane, live on main):**
  - Landing page `/` (UV-night identity, live rules-only demo labelled as such, steps with InferenceMode and code links, guard, extension, judges' test).
  - Chat app `/app` with a Privacy Flight Recorder per turn, an approval card (before/after), Local only, Your rules, and the network ledger. The old flow is at `/classic`.
  - `@envoy/core`: `scanText`, `SECRET`, `CustomRule`, `flagNames`.
  - Full README with UV-night art and real screenshots.
  - CI deploy skips with a notice until the deploy key exists.
- **Argon (eval):** PR #2 must move to `runCase`/`analyze`, run all 36 cases on Gemma 4, default Nano and Basic, add a re-identification attack, a red-team and answer quality, write `tests/eval/summary.json` (the landing page renders it).
- **Muse (extension):** PR #8 (draft). Before merge:
  - the pill must not claim "Gemini Nano" (the model can't be identified; say "Chrome's built-in model");
  - don't tell end users to enable the gemma4 developer flag;
  - PDF `/Length` must be the byte length (non-ASCII text breaks it).
- **Claude next:**
  - motion polish in the chat (fibres and the restore moment);
  - multimodal images (on-device image input is not yet verified, so images are kept local and the app says so);
  - OG image; demo video with Chatterbox narration;
  - security sweep.

## Extension (Claude lane since 2026-11-22 22:22)

- Side panel = the shared chat (`@envoy/app`, PR #18): selected text arrives as the document, rules shared with the in-page widget via chrome.storage.local, release builds hand cloud questions to the web app.
- In-page widget and upload dialog revamped (PR #16); store assets re-rendered from the real build (`apps/extension/scripts/render-store.mjs`).
- Not yet verified as an installed extension on real sites (needs the extension Chrome); do before submission.

## Stubbed / known issues

- On-device prompts (v1) have now run on the real model (2026-11-22, see the Nano 4 item below): detect / minimize / route all behave as designed on the sample lease.
- **Nano 4 (`gemma4_component`) downloaded and running on-device (resolved 2026-11-22):**
  1. **Download unblock (`op_space_check.cc:77`):** `chrome://on-device-internals` passes every hardware and storage check (`Enough VRAM: true` with 4004 MiB actual vs 3000 MiB required for `gpu_low_tier`, `Device Capable: true`, `Enough disk space to install: true` with 34,277 MiB on `F:`). The instant `0.0.0.0` `"Update error"` was caused by `components\update_client\op_space_check.cc:77`, which checks free space in `%TEMP%` (`C:\Users\hesh1\AppData\Local\Temp`, only ~3.8 GiB free on `C:`) and requires `2 × crx_size` (`8.54 GB` for `nano_v3_gpu_component` or `4.95 GB` for `gemma4_component`), aborting with `errorcat: 1, errorcode: 13` (`DISK_FULL`). Fixed by enabling `"gemma4-for-built-in-ai@1"` in `F:\ChromeEnvoy\Local State` and launching Chrome with `TEMP=F:\ChromeEnvoy-tmp` and `TMP=F:\ChromeEnvoy-tmp`; `gemma4_component` (`2026.11.3.1140`, 2,375 MiB) is now `Ready (100%)`.
  2. **Inference unblock (`OnDeviceModelForceCpuBackend`):** The 2016 Pascal GTX 1050 Ti passes the 3,000 MiB VRAM check when `--force-high-performance-gpu` is passed, but crashes the ChromeML Dawn/WebGPU shader process (`Model crash count: 3 / 3`). Passing `--enable-features=OnDeviceModelForceCpuBackend,OnDeviceModelCpuBackend` runs the installed `gemma4_component` weights on the i7-8750H CPU with 0 crashes (`Test ONLY_ON_DEVICE` and `Test structured output on-device` verified green on `/dev` with `source: on_device`).
  3. **Launch command for `F:\ChromeEnvoy`:**
     `cmd.exe /c "set TEMP=F:\ChromeEnvoy-tmp&& set TMP=F:\ChromeEnvoy-tmp&& start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir=F:\ChromeEnvoy --remote-debugging-port=9333 --no-first-run --no-default-browser-check --enable-features=OnDeviceModelForceCpuBackend,OnDeviceModelCpuBackend --window-size=1280,900 http://localhost:5173/dev"`
  4. **Independent pipeline verification (Muse session, 2026-11-22):** on `/dev` with the model warm — guarded `ONLY_ON_DEVICE` OK (8.3 s, `source: on_device`), structured output OK (12 s, valid JSON), full pipeline in **Private mode**: 20 entities, minimize selected **Clause 7 only**, route = reason in cloud, cloud excerpt = Clause 7 with `[RENT]`, Guard clean, network log shows `detect → device`. First session right after install failed once with `InvalidStateError` (warmup); a retry passed. Budget ~8–12 s per on-device call on this CPU.
- **Cloud end-to-end verified (2026-11-22, after owner steps 1–4):** on a fresh dev server (port 5174, current `.env.local`) — `PREFER_IN_CLOUD` OK (1.5 s, `source: in_cloud`, cloud model shown as `gemini-3.5-flash-lite`); pipeline → Approve and send → cloud answer `[in_cloud]` "No, your landlord cannot raise the rent 20% this year…" with receipt (reason 6.0 s `in_cloud`, Guard clean). Full flow works in Basic mode; the private-mode pipeline (Clause 7 + `[RENT]`) was verified separately on-device earlier.
- **Private pipeline fallback: fixed (verified 2026-11-23).** Earlier, 1 of 3 runs stayed Private and 2 fell back to Basic (concurrent on-device sessions on the CPU). After session cleanup and one queue for all model calls (PR #22), 5 runs in a row of the real pipeline on Gemma 4 (`gemma4_component` 2026.11.3.1140, CPU backend, profile F:ChromeEnvoy) all stayed Private: 0 fallbacks, guard clean, clause 7 chosen every time. Times: 250 s cold (with the machine busy), then 89–100 s warm. Raw results: `tests/eval/probes/fallback-check-5-runs.json`. Times vary a lot by device (CPU vs GPU, memory, other load).
- The Basic protection flagged list shows repeated names twice (dedupe in the product UI).
- Mockups say "Can [LANDLORD] raise…"; the pipeline keeps "my landlord" (not private). Update the mockups.
- firebase-js-sdk #10635 (`ONLY_ON_DEVICE` falls back to the cloud when `LanguageModel` is missing): mitigated by our device guard. Re-check before submission.

## Firebase project

- Project ID `envoy-hybrid-ai` (owner account), web app `Envoy Web` (`1:1019681797334:web:ea96219034883bfc164577`). Console: https://console.firebase.google.com/project/envoy-hybrid-ai/overview
- Local config: `apps/web/.env.local` (gitignored; template `apps/web/.env.example`).

## Owner steps (completed 2026-11-22)

1. **Enable AI Logic:** Completed (`firebasevertexai.googleapis.com` & `generativelanguage.googleapis.com` enabled + `firebaseAiLogic` provisioned on `1:1019681797334:web:ea96219034883bfc164577`).
2. **Create the reCAPTCHA Enterprise key:** Completed (score-based website key `6Lfi2iwuAAAAAG1T0dAwdfwrffSJBdt1E6VAllPa` created for `envoy-hybrid-ai.web.app` and `envoy-hybrid-ai.firebaseapp.com`; saved as `VITE_RECAPTCHA_SITE_KEY` in `apps/web/.env.local`).
3. **Register App Check:** Completed (`recaptchaEnterpriseConfig` patched on `1:1019681797334:web:ea96219034883bfc164577`).
4. **Debug token for localhost:** Completed (registered in Firebase App Check and saved as `VITE_APPCHECK_DEBUG_TOKEN` in `apps/web/.env.local`; verified `200 OK` on `:exchangeDebugToken` and `source: in_cloud` on `/dev`). Note: `gemini-3.8-flash` has a 20 req/day Free Tier limit (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`), so `VITE_CLOUD_MODEL=gemini-3.5-flash-lite` (the SDK's `DEFAULT_HYBRID_IN_CLOUD_MODEL`) is set in `.env.local` while on Free Tier.
5. **Chrome test profile** (`F:\ChromeEnvoy`): Completed (`gemma4_component` `2026.11.3.1140` installed and verified `available` + `source: on_device` on `/dev` with `--enable-features=OnDeviceModelForceCpuBackend,OnDeviceModelCpuBackend`).
6. **Automatic deploys from `main`** (one time): run `! bash scripts/setup-ci.sh` from the repo, then `! firebase init hosting:github --project envoy-hybrid-ai` and answer **No** to both workflow questions. Until then CI builds and tests but skips the deploy with a notice.

**Live:** https://envoy-hybrid-ai.web.app (`/dev` for the feasibility tests).

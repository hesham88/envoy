# Envoy — plan and status

Statuses: **wired** (works end to end in the app) · **built** (code and tests exist, not yet in the app) · **stubbed** · **todo**. Never report built as wired.

Design: `docs/superpowers/specs/2026-11-22-envoy-design.md` · Current plan: `docs/superpowers/plans/2026-11-22-envoy-foundation-and-core.md` · Rules: `docs/HACKATHON_RULES.md` · PAIR strategy: `docs/PAIR_GUIDEBOOK_STRATEGY.md` · Skills: `docs/skills/` (`harness2`, `muse-image`, `pair-ai-ux`, `pair-ai-eval`, `chrome-built-in-ai`, `firebase-ai-logic-hybrid`)

Companion artifacts (owner's claude.ai): [plan doc](https://claude.ai/artifact/16tr6t9mttMYwaWLdh8rkH) · [mockups](https://claude.ai/artifact/5jsHsbktxxskhCPpm69Pni) · [pitch deck](https://claude.ai/artifact/BF5tb3wC4S2ubRymjDqTv6)

## Status 2026-11-23

- **Extension end-to-end suite** (`npm run test:e2e -w @envoy/extension`): 20/20 on the real build. It found and fixed two bugs: PDF upload crashed (offscreen documents have no `chrome.storage`), and photo boxes drawn after choosing the file were never applied.
- **Security sweep:** `docs/SECURITY.md`. Extension messages are now checked by sender, origin and payload.
- **Firebase review:** `docs/FIREBASE_AI_LOGIC_REVIEW.md` and a new skill, `docs/skills/firebase-ai-logic-production`. Owner steps: restrict the API key, turn on AI monitoring, check the Hydrogen quota.
- **Review points:** `docs/REVIEW_RESPONSE.md` maps every point of both ChatGPT reviews, Argon's audit and PAIR to its status.
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

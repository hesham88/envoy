# Envoy — plan and status

Statuses: **wired** (works end to end in the app) · **built** (code and tests exist, not yet in the app) · **stubbed** · **todo**. Never report built as wired.

Design: `docs/superpowers/specs/2026-11-22-envoy-design.md` · Current plan: `docs/superpowers/plans/2026-11-22-envoy-foundation-and-core.md` · Rules: `docs/HACKATHON_RULES.md` · PAIR strategy: `docs/PAIR_GUIDEBOOK_STRATEGY.md` · Skills: `docs/skills/` (`harness2`, `muse-image`, `pair-ai-ux`, `pair-ai-eval`, `chrome-built-in-ai`, `firebase-ai-logic-hybrid`)

Companion artifacts (owner's claude.ai): [plan doc](https://claude.ai/artifact/16tr6t9mttMYwaWLdh8rkH) · [mockups](https://claude.ai/artifact/5jsHsbktxxskhCPpm69Pni) · [pitch deck](https://claude.ai/artifact/BF5tb3wC4S2ubRymjDqTv6)

## Foundation and privacy core (plan 1)

| # | Task | Status |
| --- | --- | --- |
| 1 | Repo, workspaces, quality gate, GitHub | built |
| 2 | Firebase project, AI Logic, Hosting config | wired (AI Logic `gemini-developer-api`, reCAPTCHA Enterprise, App Check & localhost debug token configured 2026-11-22) |
| 3 | `packages/ai`: init, App Check, Remote Config, models | built |
| 4 | Device guard (#10635) and network log | built |
| 5 | `/dev` page, deploy, CI | wired (live; CI deploy needs owner secrets) |
| 6 | Types, normalize, chunk | built |
| 7 | Fictional sample lease | built |
| 8 | Rule detectors, prompts, parsers | wired (v1 prompts verified live on Gemini Nano 4 `gemma4_component` 2026-11-22) |
| 9 | Merge, tags, masking | wired |
| 10 | Outbound guard | wired |
| 11 | Restore and local expressions | wired (`{{RENT * 1.10}}` → `EGP 9,350` verified live with `gemini-3.5-flash-lite`) |
| 12 | Receipt and wired pipeline, dev panel | wired on /dev (Private mode on Gemini Nano 4 + cloud reasoning + local algebraic restore verified end-to-end 2026-11-22) |

## Product UI (plan 2: docs/superpowers/plans/2026-11-22-envoy-product-ui.md)

| # | Task | Status |
| --- | --- | --- |
| 1 | Tooling, fonts, Tailwind tokens, jsdom tests | built |
| 2 | Logo + favicon | built (refine with Muse concepts at launch) |
| 3 | composeOutbound (hide / share / clause picks) | built |
| 4 | Session state machine + runtime hook | wired |
| 5 | Start screen + on-device guide | wired |
| 6 | Review screen | wired (Basic protection verified in a browser) |
| 7 | Answer screen + receipt | built (cloud answer needs owner steps 1–4) |
| 8 | Offline (service worker) + banner | wired (verified offline on the live site) |
| 9 | About, Network inspector, a11y | wired |
| 10 | Polish gate | in progress: Lighthouse a11y 100, best practices 100, SEO 91; dark-theme toggle, 1024px check and perf trace pending |

## Next plans
Motion polish → eval and Harness² tuning (**ALL 5 ARGON SPRINT MILESTONES COMPLETED 2026-11-22 on `lane/eval-harness`**: **M1** real in-browser Firebase AI Logic SDK `ONLY_IN_CLOUD` attacks `36/36` across all 3 arms (`0.0%` exact/partial Re-ID & `0.0%` attr inf for `nano` & `gemma4` vs `1.5%`/`6.5%` `[REDACTED]` and `85.5%`/`67.5%` raw) + real verbatim `runCase({ withAnswer: true })` answer quality (`nano`: `66.7%` unattended / `92.3%` unblocked `n=18`, `basic`: `75.0%` unattended / `100.0%` unblocked `n=20`); **M2** per-metric `metricsN` in `tests/eval/summary.json`; **M3** 8 new false-positive red-team controls verifying PR #22's guard (`28/28` blocked, `0` bypasses, `10/10` controls clean); **M4** verbatim recorded on-device traces `tests/eval/probes/demo-trace-nano.json` & `demo-trace-gemma4.json`; **M5** tested `envoy-guard init claude|gemini`, honest Basic-protection README, and `n=24` CLI eval `100%` recall / `100%` precision) → Chrome extension → launch (assets, README, video, Devpost).

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
`gemini-3.8-flash` through Remote Config key `cloud_model` (default in code). Override locally with `VITE_CLOUD_MODEL`.

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
- **Argon (eval + packages/cli):** PR #2 must move to `runCase`/`analyze`, run all 36 cases on Gemma 4, default Nano and Basic, add a re-identification attack, a red-team and answer quality, write `tests/eval/summary.json` (the landing page renders it), and build `envoy-guard`.
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
- **Private pipeline is intermittent:** 1 of 3 pipeline runs stayed Private; the others fell back to Basic mid-run (device steps appear in the network log, then `analyze` catches the error and resets). The `/dev` panel does not display `Analysis.fallbackReason`, so the failing step is not visible there — surface it in the panel, then chase the session failure (suspect sequential `LanguageModel` session contention on this CPU).
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

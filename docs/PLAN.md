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
Motion polish → eval and Harness² tuning (**Milestones 1, 2a, 3, 4, 5, 6 landed 2026-11-22 on `lane/eval-harness`**: `gemma4` (`gemma4_component 2026.11.3.1140` CPU) **full `36/36`** (`100%` recall, `0` leaks, `88.9%` clause acc, `21.9%` min ratio, `0.0%` Re-ID, **`0.0%` attribute inference**, `100%` PAPILLON quality retained) + `basic` **full `36/36`**, `summary.json`, Guard red-team `11/28` + Issue #7, Secrets `100%` recall / `94.1%` precision + 6/6 CustomRule, and `@envoy/cli` `envoy-guard`; next: Milestone 2b full `36/36` on default Gemini Nano `nano_v3_cpu_component 2025.8.21.1028`) → Chrome extension → launch (assets, README, video, Devpost).

## Chrome extension (separate track, 2026-11-22)
- Build-free MV3 side-panel scaffold in `apps/extension` (no `package.json`, so the web workspace, `tsc -b`, Vite and `npm run verify` never pick it up; web build and typecheck verified green with it present). It mirrors the web design tokens, adds a live Nano prerequisite gate and a selection context-menu intake (session storage only, no content script).
- Not wired to Firebase/`@envoy/ai` yet. Integration path and the App Check on `chrome-extension://` question are assessed in `apps/extension/INTEGRATION.md`. Load via `chrome://extensions` → Developer mode → Load unpacked (branded Chrome ignores `--load-extension`).

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

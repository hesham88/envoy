# Envoy Chrome extension (separate track)

A Manifest V3 side-panel scaffold that reuses Envoy's idea — *select or paste private text, let the on-device model minimize it, approve what the cloud sees* — without touching the web app's build.

## Load it (unpacked, no build)

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** → choose this `apps/extension` folder.
3. Pin Envoy, click its toolbar icon (or select text → right-click → **Ask Envoy about this selection**). The side panel opens.

There is no `package.json`, bundler or build step here on purpose: the root workspace glob (`apps/*`), `tsc -b` references and Vite never pick this folder up, so `npm run verify` in the web track is unaffected.

## What works today

- MV3 side panel with Envoy's design tokens (green = on-device, blue = cloud, always labelled), dark-mode aware, AA contrast, 44px targets, reduced-motion safe.
- A live **prerequisite gate** in the panel: Side Panel/Prompt API presence, Gemini Nano `LanguageModel.availability()`, a one-click **Enable private mode** download (real user gesture, progress in the pill), and hardware/storage hints.
- Context-menu intake of the current selection via `chrome.storage.session` only (cleared on browser close). No content script, no DOM scraping, no host permissions — per design §12.

## What is not wired yet

Firebase AI Logic, App Check, the `@envoy/core` detectors and the `@envoy/ai` guarded pipeline. The **Analyze privately** button stays disabled until integration provides `window.__envoyExtension.analyze`. No cloud call is made from this scaffold. See [INTEGRATION.md](INTEGRATION.md).

## Prerequisites to use it for real

| Need | Why | Fallback |
| --- | --- | --- |
| Chrome 138+ desktop (extensions Prompt API; web needs 148+) | `LanguageModel` in the side-panel page | Basic protection (rules only) |
| Gemini Nano downloaded (`availability() === 'available'`) | Private steps must be `ONLY_ON_DEVICE` | Basic protection; never raw text to cloud |
| ~22 GB free on the profile volume; >4 GB VRAM or 16 GB RAM + 4 cores; unmetered network for first download | Google's hardware bar for Nano | Basic protection |
| Chrome Settings → AI → On-device AI enabled (Chrome 157+) | Model stays off until enabled | In-panel guide + status check |
| Firebase AI Logic + App Check configured for the extension origin | Cloud *reason* step needs a valid App Check token; reCAPTCHA Enterprise does not run naturally on `chrome-extension://` pages | Local-only answers until solved (see INTEGRATION.md) |

**Solved on the dev machine (2026-11-22, see `docs/PLAN.md`):** the Nano v3 GPU component is refused on a 4 GB Pascal GPU, and Chrome's installer also aborts if `%TEMP%` lacks 2× the package size free (~5 GB for Gemma 4), regardless of profile-drive space. Working recipe: enable `chrome://flags/#gemma4-for-built-in-ai`, launch Chrome with `TEMP`/`TMP` redirected to a roomy drive (e.g. `F:\ChromeEnvoy-tmp`), and add `--enable-features=OnDeviceModelForceCpuBackend,OnDeviceModelCpuBackend` on older GPUs. The panel's gate surfaces these fixes when availability is not `available`.

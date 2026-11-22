# Envoy Chrome extension (Muse lane)

A Manifest V3 side panel that runs the same Envoy flow as the web app, reusing `@envoy/core`, `@envoy/ai` and the shared `@envoy/ui` design system: select or paste private text, let the on-device model minimize it, approve exactly what the cloud sees.

## Build and load (unpacked)

```sh
npm install
npm run build -w @envoy/extension        # release build -> dist/ (never contains a debug token)
npm run check:dist -w @envoy/extension   # pre-zip gate: fails if token material reached dist/
```

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** -> choose `apps/extension/dist`.
3. Click the Envoy toolbar icon, or select text -> right-click -> **Ask Envoy about this selection**.

For local development against the live model and cloud:

```sh
npm run build:dev -w @envoy/extension    # extensiondev build -> dist-dev/ (gitignored)
```

That build bakes in the App Check debug token from `apps/web/.env.local`. **Never share, zip or commit `dist-dev/`, any token, or `.env.local`.** Before any zip for judges, rebuild with plain `npm run build` and run `npm run check:dist` (optionally with `VITE_APPCHECK_DEBUG_TOKEN=CANARY-1234` in the environment: the canary must not appear in `dist/`).

## Judges build: on-device only (implemented)

Release builds (`vite build`, any mode other than `extensiondev`) make **no cloud calls**: detect / minimize / route / local answers run on-device, and a question that needs cloud reasoning shows a handoff to the hosted app (https://envoy-hybrid-ai.web.app), which has real reCAPTCHA Enterprise App Check. This avoids shipping any App Check debug token. The alternative (owner decision) is a dedicated judging-only debug token, revoked after judging ends on Dec 16, 2026; the everyday token is never zipped.

## What works

- Side panel on the shared design system (`@envoy/ui`): `Logo`, `StatusPill`, `ModeChip`, `AnalyzingPanel`, `TaggedText`, `RestoredText`, `EnvoySeal`, `StepEmblem`. Green = on-device, blue = cloud, always with an icon and a word. Basic protection is a normal, explained state.
- Full flow in the panel: prerequisite gate with the solved Nano recipe (Gemma 4 flag, %TEMP% space, CPU-backend flags), live per-step progress, masked-excerpt review with Guard status and editing, approve, restored answer with a compact privacy receipt, and the `fallbackReason` shown when a run falls back to Basic.
- Context-menu intake via `chrome.storage.session` only. No content script, no DOM scraping, no host permissions.
- Verified (2026-11-22): end-to-end in the F: Chrome profile - Private mode, Clause 7 only, 235 chars sent, derived amount EGP 9,350 restored on-device; and the revamped panel loads and renders in a clean profile.

## Prerequisites

| Need | Why | Fallback |
| --- | --- | --- |
| Chrome 138+ desktop | Side Panel + Prompt API in extensions | - |
| Gemini Nano (Gemma 4) downloaded, `availability() === 'available'` | Private steps are `ONLY_ON_DEVICE` | Basic protection (rules only) |
| ~22 GB free on the profile volume; >4 GB VRAM or 16 GB RAM + 4 cores; ~5 GB free in %TEMP% for the download | Google's hardware bar + Chrome's installer space check | Basic protection |
| Settings -> AI -> On-device AI on (Chrome 157+) | Model is off until enabled | Gate shows the fix |

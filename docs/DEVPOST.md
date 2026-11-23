# Devpost submission draft

A draft for the owner to paste into the Devpost form. Every claim links to evidence in the repo. Nothing here has been submitted.

## Field checklist

| Required field                                                           | Status                                                   | Where it comes from                                                                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Platform                                                                 | ✅ Best Web/Chrome                                       | Web app + Chrome extension (one platform)                                                                      |
| How Firebase AI Logic is used, features, value                           | ✅ Draft below                                           | README "How Envoy uses Firebase AI Logic"                                                                      |
| What was built during the submission period, pre-existing work, AI tools | ✅ Draft below                                           | README "Built during the contest, and with what"                                                               |
| Public GitHub repo, AI Logic imported and called at runtime              | ✅                                                       | `packages/ai/src/firebase.ts` (`getAI`), `models.ts` (`getGenerativeModel`), `pipeline.ts` (`generateContent`) |
| Open-source licence in the About section                                 | ✅ Apache-2.0                                            | `LICENSE`                                                                                                      |
| App Check                                                                | ✅ reCAPTCHA Enterprise, limited-use tokens              | `packages/ai/src/firebase.ts`                                                                                  |
| YouTube video, public, 3:00 or less, English                             | ⏳ Waiting for the owner's go-ahead                      | —                                                                                                              |
| Hosted URL                                                               | ✅ https://envoy-hybrid-ai.web.app                       | Firebase Hosting                                                                                               |
| No real personal data, secrets or third-party branding                   | ✅ Fictional samples; secrets scan in `docs/SECURITY.md` | —                                                                                                              |

## Tagline

Ask the cloud. Keep your secrets.

## What it does

Envoy is your private AI agent to the cloud. You ask a question about a private document (a lease, an offer letter, a lab report) or type a message with private details. Chrome's built-in model, on your device, finds the private details, keeps only the parts of the document the question needs, and replaces names, IDs, accounts and amounts with tags that keep their meaning, like [LANDLORD] and [RENT]. You see the exact text that would leave your device and approve it. Gemini in the cloud reasons over the tags and can write maths like {{RENT * 1.10}}; your device turns the tags back into your real details and does the maths locally. Questions the document can answer never leave the device at all.

## How we used Firebase AI Logic

- One `GenerativeModel` per step, each with its own `InferenceMode`: finding details, choosing clauses, routing and local answers use `ONLY_ON_DEVICE`; only the reasoning step uses `PREFER_IN_CLOUD`. Structured output is configured on both sides from one JSON Schema (`responseConstraint` on the device, `responseJsonSchema` in the cloud).
- We don't trust the default. Because of firebase-js-sdk issue #10635 (`ONLY_ON_DEVICE` can silently use the cloud when Chrome's model is missing), every private step goes through a device guard: an availability check, a network tripwire on the AI Logic endpoint, an `inferenceSource === ON_DEVICE` assertion, and session cleanup. A blocked request stops the run; it never falls back to the cloud.
- `initializeDeviceModel` downloads the model from a click, with progress. App Check (reCAPTCHA Enterprise, limited-use tokens) protects the cloud step. Remote Config chooses the cloud model: Gemini 3.5 Flash-Lite by default for speed, or Gemini 4 Hydrogen, which the user can pick in the composer.

## Measured

36 test documents, 263 private details, run through the real pipeline on Chrome's default Gemini Nano, on Gemma 4 (the model Gemini Nano 4 is built on), and in Basic protection: every detail masked and 0 raw details sent in all three. With the on-device model, the cloud sees about 10–22% of the document. A 28-attack red team (encodings, homoglyphs, number words, reversed and split text) is fully blocked. Details: `docs/EVAL.md`.

## Built during the submission period, and with what

The repository starts on 22 November 2026; no code predates it. Claude Code (Anthropic) built the core, the AI layer, the web app, the extension and the visual identity; Antigravity (Google, Gemini) built the eval harness; both used the Firebase agent skills. All art is drawn in code. Open-source libraries: Firebase JS SDK, React, Vite, Tailwind CSS, pdf.js, Lucide icons, Fraunces and IBM Plex fonts (OFL). Inspired by PAPILLON (Li et al., NAACL 2025) and designed with Google PAIR's People + AI Guidebook.

## Testing instructions for judges

1. Open https://envoy-hybrid-ai.web.app/app?sample=lease (the sample lease and everyone in it are fictional).
2. Ask "Can my landlord raise the rent 20% this year?" and watch the flight recorder: each step says where it ran.
3. Read what the cloud will see, then approve. Add `?inspect=1` to the address to see the network ledger.
4. Private mode needs desktop Chrome with on-device AI turned on (`chrome://settings/ai`, then `chrome://on-device-internals`). Without it, Envoy runs in Basic protection and says so. On-device steps can take about a minute on a CPU-only laptop; times vary a lot by device.

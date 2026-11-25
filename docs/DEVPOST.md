# Devpost submission draft

> **Current, paste-ready version: [SUBMISSION_KIT.md](SUBMISSION_KIT.md)** (24 Nov 2026). This file is the earlier draft.

The earlier draft of the Devpost entry, kept for the record. Every claim links to evidence in the repo. **Submitted on 24 November 2026**; the demo film is public at https://www.youtube.com/watch?v=yvChwFT2770.

## Field checklist

| Required field                                                           | Status                                                   | Where it comes from                                                                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Platform                                                                 | ✅ Best Web/Chrome                                       | Web app + Chrome extension (one platform)                                                                      |
| How Firebase AI Logic is used, features, value                           | ✅ Draft below                                           | README "How Envoy uses Firebase AI Logic"                                                                      |
| What was built during the submission period, pre-existing work, AI tools | ✅ Draft below                                           | README "Built during the contest, and with what"                                                               |
| Public GitHub repo, AI Logic imported and called at runtime              | ✅                                                       | `packages/ai/src/firebase.ts` (`getAI`), `models.ts` (`getGenerativeModel`), `pipeline.ts` (`generateContent`) |
| Open-source licence in the About section                                 | ✅ Apache-2.0                                            | `LICENSE`                                                                                                      |
| App Check                                                                | ✅ reCAPTCHA Enterprise, limited-use tokens              | `packages/ai/src/firebase.ts`                                                                                  |
| YouTube video, public, 3:00 or less, English                             | ✅ https://www.youtube.com/watch?v=yvChwFT2770           | —                                                                                                              |
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

36 test documents, 263 private details, run through the real pipeline on Chrome's Gemma 4 model (the model Gemini Nano 4 is built on) and in Basic protection: every detail masked and 0 raw details sent in both. With the on-device model, the cloud sees about 23% of the document's text. Answer quality on 20 questions: Gemini 3.5 Flash-Lite, grading against an answer from the whole document, scored Private mode at 97.5% of that answer's quality; because it also wrote some of the answers, every answer was also checked by the team (our AI coding assistants and human reviewers, reading each answer against its document), which scored Private mode 95% and Basic protection 97.5%. Questions that need a calculation always go to the reasoning step. Measured 24 November 2026 on Gemma 4 (`gemma4_component` 2026.11.3.1140). A 28-attack red team (encodings, homoglyphs, number words, reversed and split text) is fully blocked. Details: `docs/EVAL.md`.

## Built during the submission period, and with what

The repository starts on 22 November 2026; no code predates it. Claude Code (Anthropic) built the core, the AI layer, the web app, the extension and the visual identity; Antigravity (Google, Gemini) built the eval harness; both used the Firebase agent skills. Meta Muse Wonder (Meta) did the extension's early development; on 22 November Claude Code (Claude Opus) and Antigravity's Gemini Neon coding agent took it over. Codex Astra (OpenAI), Claude and Antigravity were also used as outside reviewers, playing the judges. All art is drawn in code. The demo video's narration is generated locally with Chatterbox TTS (Resemble AI, MIT licence); its music and sound effects are synthesised in code. Open-source libraries: Firebase JS SDK, React, Vite, Tailwind CSS, pdf.js, Lucide icons, Fraunces and IBM Plex fonts (OFL). Inspired by PAPILLON (Li et al., NAACL 2025) and designed with Google PAIR's People + AI Guidebook.

## Testing instructions for judges

**Before you start (Chrome setup):** Any desktop Chrome runs this test. Without Chrome's on-device model, Envoy uses Basic protection (local rules) and says so. Private mode needs desktop Chrome with the built-in model (`chrome://settings/ai`, then check `chrome://on-device-internals`), or follow https://github.com/hesham88/envoy/blob/main/docs/GEMMA4_SETUP.md for our exact Gemma 4 setup (Chrome 158, one developer-trial flag, about 10 minutes plus the model download). Private mode was measured on Gemma 4 (Gemini Nano 4); on Chrome's default model, results may vary. On-device steps can take about a minute on a CPU-only laptop; times vary a lot by device. Can't run it? Open the recorded run at https://envoy-hybrid-ai.web.app/app?recorded=1: a real Gemma 4 run, word for word, labelled as a recording.

1. Open https://envoy-hybrid-ai.web.app/app?sample=lease (the sample lease and everyone in it are fictional).
2. Ask "Can my landlord raise the rent 20% this year?" and watch the flight recorder: each step says where it ran.
3. Read **What the cloud will see**. Names, IDs, the IBAN and the rent are tags. Share or hide something, then approve.
4. The answer comes back with your real numbers, restored in green. Add `?inspect=1` to the address to open the network ledger.

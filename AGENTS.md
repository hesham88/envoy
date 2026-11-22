# Envoy — instructions for every agent (Claude Code, Antigravity, Gemini, others)

Envoy is our entry for the Firebase **#BuildHybridAI 2026** hackathon. Hard deadline: **Mon 30 Nov 2026, 2:00 PM PT (00:00 Tue 1 Dec Cairo)**. Our target: submitted by Mon 30 Nov, 6:00 PM Cairo.

## Read first, every session
1. `docs/HACKATHON_RULES.md`: contest rules, eligibility, submission checklist, and what must never be committed. **Non-negotiable.**
2. `docs/BRIEF.md`: the product and build brief. Read its **Amendments** block first.
3. `docs/superpowers/specs/2026-11-22-envoy-design.md`: the approved design.
4. `docs/PLAN.md`: current status, what's stubbed, known issues.

## Commands
`npm run verify` (lint, typecheck, tests and build; required before every commit) · `npm test` · `npm run dev` · `npm run eval` · `npm run deploy`

## Layout
`packages/core` (pure TS privacy engine, no network) · `packages/ai` (Firebase AI Logic, App Check, Remote Config, device guard) · `apps/web` (Vite React SPA) · `apps/extension` (stretch) · `tests/eval` · `docs/`

## Decisions already made (don't reopen)
- Web app first (Best Web/Chrome). The Chrome extension is a stretch goal; Android is a later stretch.
- English only for now.
- GitHub account `hesham88`; commit author `Hesham Aboul-Fetouh <hesham1988@gmail.com>`. Google/Firebase account: `hesham1988@gmail.com` only. Never use a work account.
- No backend server of our own. The only network calls are to Firebase services.

## Hard rules
- Never commit secrets, `.env`, API keys, App Check debug tokens, or real personal data. Sample people and IDs are fictional.
- Private steps (detect, minimize, route, local answer) use `InferenceMode.ONLY_ON_DEVICE`. They must never fall back to the cloud, and raw document text never goes to the cloud.
- **Known SDK bug (firebase-js-sdk #10635, open):** `ONLY_ON_DEVICE` silently calls the cloud when Chrome's `LanguageModel` API is missing. Before every private step, check that `'LanguageModel' in self` and `await LanguageModel.availability() === 'available'`; otherwise use Basic protection (local rules only). After the call, assert `response.inferenceSource === InferenceSource.ON_DEVICE`. Keep the tests for this guard green.
- Don't guess Firebase AI Logic APIs. Check the installed typings in `node_modules/@firebase/ai`.
- When you finish a task, update `docs/PLAN.md`.

## Shared skills (every agent)
- `docs/skills/harness2/SKILL.md`: improve prompts and workflows with Propose–Probe–Compose, and log lessons in `docs/harness/LESSONS.md`.
- `docs/skills/muse-image/SKILL.md`: generate images with Meta Muse Image. There's a **$8 total cap**, enforced by a ledger. Never commit the key.
- Claude Code also has these installed globally in `~/.claude/skills/`.
- **Working style:** don't fan out multiple subagents; do the work in-session or through scripts.

This file is mirrored to `CLAUDE.md` and `GEMINI.md`. Change all three together.

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
- Web app first (Best Web/Chrome), plus the Chrome extension. **Owner decision 26 Nov 2026 (final batch): an Android companion (`android/`, Kotlin + Compose, `firebase-ai` + `firebase-ai-ondevice`) is now in scope.** Android SDK, Gradle cache and AVDs live on F: only (`F:/Android`).
- English first. **Owner decision 26 Nov 2026: masking adds more languages** — only those Chrome's Prompt API lists (en, ja, es, de, fr), each with its own local rules; the app, docs and video stay in English.
- GitHub account `hesham88`; commit author `Hesham Aboul-Fetouh <hesham1988@gmail.com>`. Google/Firebase account: `hesham1988@gmail.com` only. Never use a work account.
- No backend server of our own. The only network calls are to Firebase services.

## Who owns what (owner decision, 2026-11-22) — don't edit another lane's files without asking
| Lane | Agent | Owns |
| --- | --- | --- |
| Core + web AI + visual identity | Claude Code | `packages/core`, `packages/ai`, `apps/web`, `docs/img/`, brand/motion assets |
| Eval harness | Antigravity (Gemini, "Argon") | `tests/eval/**`, `npm run eval`, `docs/EVAL.md` |
| Chrome extension | Claude Code (taken over from Muse, owner decision 2026-11-22 22:22) | `apps/extension/**` |
Shared files (`docs/PLAN.md`, `AGENTS.md`, root `package.json`): small, focused edits only, and pull before you push.

## Worktrees: one folder and one branch per agent (owner decision, 2026-11-22 15:27)
| Agent | Work ONLY in this folder | Branch |
| --- | --- | --- |
| Claude Code | `F:/Projects/Envoy-wt/claude` | `lane/core-web` |
| Argon (Antigravity) | `F:/Projects/Envoy-wt/argon` | `lane/eval-harness` |
| Muse | `F:/Projects/Envoy-wt/muse` | `lane/extension` |
- `F:/Projects/Envoy` is the **integration checkout only**. Don't edit, build or commit there.
- Commit only your own lane's files, never `git add -A` across lanes. Run `npm run verify` before every commit; push your lane branch and open a PR into `main`. Merges into `main` are deliberate (Claude or the owner), after CI is green.
- To pick up others' merged work: `git fetch origin && git merge origin/main` in your own worktree.
- Each worktree has its own `node_modules` (run `npm install` once) and its own `apps/web/.env.local` (already copied; never commit it).
- **Deploys:** only `main` reaches https://envoy-hybrid-ai.web.app, through CI (`firebase-hosting-merge.yml`). Never run `firebase deploy` from a lane worktree. Until the CI deploy key exists, Claude deploys by hand only from a checkout whose HEAD equals `origin/main`. PRs get preview channels once the key exists.
- Dev server ports: Claude 5173, Argon 5174, Muse 5175 (`npm run dev -- --port <n>`). Only one agent drives the model Chrome (port 9333) at a time: on a CPU, parallel sessions starve each other.

## Hard rules
- Never commit secrets, `.env`, API keys, App Check debug tokens, or real personal data. Sample people and IDs are fictional.
- Private steps (detect, minimize, route, local answer) use `InferenceMode.ONLY_ON_DEVICE`. They must never fall back to the cloud, and raw document text never goes to the cloud.
- **Known SDK bug (firebase-js-sdk #10635, open):** the issue reports `ONLY_ON_DEVICE` requests reaching the cloud when Chrome's `LanguageModel` API is missing (we haven't reproduced it ourselves; in public copy, describe it as an open report, never as a fault of the SDK team). Before every private step, check that `'LanguageModel' in self` and `await LanguageModel.availability() === 'available'`; otherwise use Basic protection (local rules only). After the call, assert `response.inferenceSource === InferenceSource.ON_DEVICE`. Keep the tests for this guard green.
- Don't guess Firebase AI Logic APIs. Check the installed typings in `node_modules/@firebase/ai`.
- **Evals and probes measure the real product:** every on-device or cloud result must come from the real pipeline (`analyze` / `answer` in `@envoy/ai`) running through **Firebase AI Logic hybrid inference** (`initEnvoy` → `createStepModel` with `ONLY_ON_DEVICE` / `PREFER_IN_CLOUD` → `runPrivate` and the device guard) inside the Chrome that has the model. Use `scripts/lib/envoy-browser.mjs`. Never synthesize model outputs from gold labels; an "oracle" upper bound may exist only if it is labelled as such and kept out of headline numbers. Every result names the model (component and version) and the date.
- When you finish a task, update `docs/PLAN.md`.

## Shared skills (every agent)
- `docs/skills/harness2/SKILL.md`: improve prompts and workflows with Propose–Probe–Compose, and log lessons in `docs/harness/LESSONS.md`.
- `docs/skills/muse-image/SKILL.md`: generate images with Meta Muse Image. There's a **$8 total cap**, enforced by a ledger. Never commit the key.
- `docs/skills/pair-ai-ux/SKILL.md`: design and audit AI UX, calibrated trust, explainability, human-in-the-loop control and graceful fallbacks with Google PAIR's People + AI Guidebook (Ch. 3–6 & 23 patterns).
- `docs/skills/pair-ai-eval/SKILL.md`: apply PAIR Guidebook Ch. 1–2 to AI value-fit, interaction design policies, precision/recall trade-offs, noisy-data evaluation (`tests/eval`) and hackathon judge framing. See `docs/PAIR_GUIDEBOOK_STRATEGY.md`.
- `docs/skills/chrome-built-in-ai/SKILL.md`: build, debug and test with Chrome's Built-in AI APIs (`LanguageModel` Prompt API, `Summarizer`, `Translator`, `LanguageDetector`, `Writer`, `Rewriter`, `Proofreader`, WebMCP, hardware/disk/`%TEMP%`/CPU-flag requirements and `chrome://on-device-internals`).
- `docs/skills/firebase-ai-logic-hybrid/SKILL.md`: configure Firebase AI Logic (`firebase/ai` in `firebase@13.x`) hybrid on-device + cloud inference (`HybridParams`, `InferenceMode`, `InferenceSource`, dual structured output, App Check debug/production setup, CSP headers, and the 4-layer device guard for SDK bug #10635).
- `docs/skills/firebase-ai-logic-production/SKILL.md`: production-readiness review for Firebase AI Logic (App Check, API key restrictions, stable models via Remote Config, monitoring, quotas, hybrid specifics). Envoy's result: `docs/FIREBASE_AI_LOGIC_REVIEW.md`.
- **Modern Web Guidance** (Google Chrome, plugin `modern-web-guidance@googlechrome`; CLI `npx -y modern-web-guidance@latest search "<2–5 word query>"`, then `retrieve <id>`): consult it at the start of any web UI, CSS or client-side JS task (security headers, CSP, layout, accessibility, performance) and name the guides used in the PR. Claude Code users: `claude plugin marketplace add GoogleChrome/modern-web-guidance` then `claude plugin install modern-web-guidance@googlechrome`.
- Claude Code, Antigravity and other agents also have these installed globally (`~/.claude/skills/`, `~/.agents/skills/`, `~/.gemini/config/skills/`) and via `.agents/skills.json`.
- **Working style:** don't fan out multiple subagents; do the work in-session or through scripts.
- **Keep going, no stopping:** at a checkpoint, post a short status and continue with the next task. Stop only when truly blocked (you need the owner's input or credentials, or an action is destructive or irreversible).

This file is mirrored to `CLAUDE.md` and `GEMINI.md`. Change all three together.

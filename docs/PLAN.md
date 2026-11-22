# Envoy — plan and status

Statuses: **wired** (works end to end in the app) · **built** (code and tests exist, not yet in the app) · **stubbed** · **todo**. Never report built as wired.

Design: `docs/superpowers/specs/2026-11-22-envoy-design.md` · Current plan: `docs/superpowers/plans/2026-11-22-envoy-foundation-and-core.md` · Rules: `docs/HACKATHON_RULES.md`

Companion artifacts (owner's claude.ai): [plan doc](https://claude.ai/artifact/16tr6t9mttMYwaWLdh8rkH) · [mockups](https://claude.ai/artifact/5jsHsbktxxskhCPpm69Pni) · [pitch deck](https://claude.ai/artifact/BF5tb3wC4S2ubRymjDqTv6)

## Foundation and privacy core (plan 1)

| # | Task | Status |
| --- | --- | --- |
| 1 | Repo, workspaces, quality gate, GitHub | in progress |
| 2 | Firebase project, AI Logic, Hosting config | todo |
| 3 | `packages/ai`: init, App Check, Remote Config, models | todo |
| 4 | Device guard (#10635) and network log | todo |
| 5 | `/dev` page, deploy, CI | todo |
| 6 | Types, normalize, chunk | todo |
| 7 | Fictional sample lease | todo |
| 8 | Rule detectors, prompts, parsers | todo |
| 9 | Merge, tags, masking | todo |
| 10 | Outbound guard | todo |
| 11 | Restore and local expressions | todo |
| 12 | Receipt and wired pipeline, dev panel | todo |

## Next plans
Product UI (screens, logo, motion, a11y, PWA) → eval and Harness² tuning → Chrome extension → launch (assets, README, video, Devpost).

## Cloud model
`gemini-3.8-flash` through Remote Config key `cloud_model` (default in code). Override locally with `VITE_CLOUD_MODEL`.

## Judge experience (must-have)
- Many judges can't run the on-device model (one field study found about 41% of users could), and Chrome 157+ keeps on-device AI off until it's enabled in Settings → AI.
- The hosted app shows a clear "Turn on on-device AI" guide.
- Basic protection is fully polished.
- The video shows the full on-device flow.

## Stubbed / known issues
- firebase-js-sdk #10635 (`ONLY_ON_DEVICE` falls back to the cloud when `LanguageModel` is missing): mitigated by our device guard. Re-check before submission.

## Owner steps
_(filled in by Task 2: reCAPTCHA key, App Check registration, debug token, GitHub secrets)_

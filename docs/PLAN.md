# Envoy — plan and status

Statuses: **wired** (works end to end in the app) · **built** (code and tests exist, not yet in the app) · **stubbed** · **todo**. Never report built as wired.

Design: `docs/superpowers/specs/2026-11-22-envoy-design.md` · Current plan: `docs/superpowers/plans/2026-11-22-envoy-foundation-and-core.md` · Rules: `docs/HACKATHON_RULES.md`

Companion artifacts (owner's claude.ai): [plan doc](https://claude.ai/artifact/16tr6t9mttMYwaWLdh8rkH) · [mockups](https://claude.ai/artifact/5jsHsbktxxskhCPpm69Pni) · [pitch deck](https://claude.ai/artifact/BF5tb3wC4S2ubRymjDqTv6)

## Foundation and privacy core (plan 1)

| # | Task | Status |
| --- | --- | --- |
| 1 | Repo, workspaces, quality gate, GitHub | built |
| 2 | Firebase project, AI Logic, Hosting config | built (AI Logic + App Check need owner steps 1–4) |
| 3 | `packages/ai`: init, App Check, Remote Config, models | built |
| 4 | Device guard (#10635) and network log | built |
| 5 | `/dev` page, deploy, CI | wired (live; CI deploy needs owner secrets) |
| 6 | Types, normalize, chunk | built |
| 7 | Fictional sample lease | built |
| 8 | Rule detectors, prompts, parsers | built (prompts untested on a real model) |
| 9 | Merge, tags, masking | built |
| 10 | Outbound guard | built |
| 11 | Restore and local expressions | built |
| 12 | Receipt and wired pipeline, dev panel | wired on /dev (Basic protection verified in a browser; private mode awaits a machine with the model) |

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
Motion polish → eval and Harness² tuning → Chrome extension → launch (assets, README, video, Devpost).

## Cloud model
`gemini-3.8-flash` through Remote Config key `cloud_model` (default in code). Override locally with `VITE_CLOUD_MODEL`.

## Judge experience (must-have)
- Many judges can't run the on-device model (one field study found about 41% of users could), and Chrome 157+ keeps on-device AI off until it's enabled in Settings → AI.
- The hosted app shows a clear "Turn on on-device AI" guide.
- Basic protection is fully polished.
- The video shows the full on-device flow.

## Stubbed / known issues
- On-device prompts (v1) haven't run on a real model yet: they need the F: Chrome profile with on-device AI on (owner step 5).
- The Basic protection flagged list shows repeated names twice (dedupe in the product UI).
- Mockups say "Can [LANDLORD] raise…"; the pipeline keeps "my landlord" (not private). Update the mockups.
- firebase-js-sdk #10635 (`ONLY_ON_DEVICE` falls back to the cloud when `LanguageModel` is missing): mitigated by our device guard. Re-check before submission.

## Firebase project
- Project ID `envoy-hybrid-ai` (owner account), web app `Envoy Web` (`1:1019681797334:web:ea96219034883bfc164577`). Console: https://console.firebase.google.com/project/envoy-hybrid-ai/overview
- Local config: `apps/web/.env.local` (gitignored; template `apps/web/.env.example`).

## Owner steps (one-time, about 10 minutes)
1. **Enable AI Logic** (interactive; pick "Envoy Web" when asked): `npx -y firebase-tools@latest init ailogic --project envoy-hybrid-ai`. This enables the Gemini Developer API. It doesn't change `firebase.json`; if it does, keep our hosting block.
2. **Create the reCAPTCHA Enterprise key:** Google Cloud console → Security → reCAPTCHA (project `envoy-hybrid-ai`) → Create key → Website, score-based, no checkbox challenge. Domains: `envoy-hybrid-ai.web.app` and `envoy-hybrid-ai.firebaseapp.com` (don't add localhost). Put the site key in `apps/web/.env.local` as `VITE_RECAPTCHA_SITE_KEY`.
3. **Register App Check:** Firebase console → Security → App Check → Apps → Envoy Web → reCAPTCHA Enterprise, paste the site key, Save. AI Logic enforcement is on by default.
4. **Debug token for localhost:** quickest: copy the token from the console line "Firebase App Check debug token: …", then run `firebase appcheck:debugtokens:create <token> --project envoy-hybrid-ai --app 1:1019681797334:web:ea96219034883bfc164577`. Or run `npm run dev`, open `http://localhost:5173/dev`, copy the `App Check debug token: …` line from the browser console, then Firebase console → App Check → Apps → ⋮ → Manage debug tokens → Add. Optionally save it as `VITE_APPCHECK_DEBUG_TOKEN` in `.env.local` so it stays stable. Never commit it.
5. **Chrome test profile** (already created on F:): in that window, Settings → AI → turn on **On-device AI**, then check `chrome://on-device-internals`.
6. **GitHub secrets for CI deploys** (workflows are in `.github/workflows/`). From the repo root in Git Bash:
   - `while IFS='=' read -r k v; do case "$k" in VITE_FIREBASE_*|VITE_RECAPTCHA_SITE_KEY) [ -n "$v" ] && printf '%s' "$v" | gh secret set "$k" -R hesham88/envoy;; esac; done < apps/web/.env.local`
   - Service account: `firebase init hosting:github` (interactive). It creates `FIREBASE_SERVICE_ACCOUNT_ENVOY_HYBRID_AI`. When it offers to write workflow files, answer **No** (ours already exist).

**Live:** https://envoy-hybrid-ai.web.app (`/dev` for the feasibility tests). Until steps 2–4 are done, `/dev` shows "Missing VITE_RECAPTCHA_SITE_KEY" in production; that's expected.

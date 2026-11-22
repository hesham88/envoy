# Envoy — design (2026-11-22)

Status: **awaiting owner approval**. Inputs: `docs/BRIEF.md` (build brief), `docs/HACKATHON_RULES.md`, `reports/Gemini Nano via Firebase AI Logic.md`, the plan doc, mockups canvas and pitch deck (links in `docs/PLAN.md`).

## 1. Intent and why

Envoy turns **Privacy-Conscious Delegation** (PAPILLON, NAACL 2025) into a product. A trusted small model on your own computer (Chrome's built-in model, reached through Firebase AI Logic) reads your private document and your question first. It decides what the cloud needs to know, hides identities behind meaning-preserving role tags, shows you exactly what will be sent, and only then asks cloud Gemini. The answer comes back and is personalized locally. Simple questions never leave the device.

Why now: the #BuildHybridAI 2026 contest closes **Mon 30 Nov, 2:00 PM PT**. Goal: the Grand Prize. Realistic floor: Best Web/Chrome. Success means a polished, working, verifiable product: judges can open the hosted URL, see the privacy guarantees hold (Network inspector, receipt), and read real eval numbers in the README.

## 2. Goals, non-goals, anti-goals

**Goals**
- End-to-end flow on the English sample contract: detect → minimize → approve → reason → restore, with a privacy receipt.
- Local-first routing: simple factual questions are answered on the device with 0 cloud calls, including offline.
- Safe fallback: without the on-device model, "Basic protection" (local rules only), and never raw text to the cloud.
- A Chrome extension (side panel) reusing the same engine. Stretch, day 7.
- A stunning repo, README, demo video and assets in Envoy's own calm visual language.
- Measured leakage numbers (eval harness), with the on-device prompts tuned by Harness² Propose–Probe–Compose.
- **Judge experience** (added 2026-11-22): many judges' machines can't run the on-device model (about 41% could in one field study), and Chrome 157+ keeps on-device AI off until Settings → AI.
  - Basic protection must look as polished as private mode.
  - The app shows a short "Turn on on-device AI" guide with a live status check.
  - The video carries the full on-device flow, because judges may judge from the video alone.

**Non-goals:** Android/iOS (no Nano 4 phone available); Arabic documents or UI; accounts or saved history; DOCX/OCR; our own backend server; payments.

**Anti-goals** (failure even if it "works"):
- Any raw document text reaching the cloud, including through the SDK bug #10635.
- Demoing anything that isn't real.
- Real PII or secrets in the repo, form or video.
- Cartoonish or generic "AI sparkle" visuals.
- Third-party logos or trademarks.
- A pile of half-finished features.

## 3. Constraints

- Contest rules (`docs/HACKATHON_RULES.md`): App Check required; AI Logic imported and called at runtime; public repo with Apache-2.0 visible; YouTube video of 3:00 or less in English; disclose pre-existing work and AI tools (Claude Code, Antigravity, Firebase agent skills, Muse Image, Chatterbox).
- On-device model: English only; **9,216-token** context per call; single-turn; new session per request; desktop Chrome; the user must enable it.
- SDK: `firebase@13.x`. `ONLY_ON_DEVICE` falls back to the cloud when `LanguageModel` is missing (#10635, open), so Envoy must guard it itself.
- Dev machine: model only on a Chrome profile at `F:\ChromeEnvoy` (22 GB rule); CPU path (no qualifying GPU), so expect slow on-device calls; C: almost full, so all tools and caches go on F:.
- Budget: Muse Image **$8** cap (ledger). Gemini Developer API free tier. No subagent swarms.

## 4. Approaches considered

| | Approach | Trade-off | Decision |
| --- | --- | --- | --- |
| **A** | One repo with a shared `core` engine; web app first, polished by Fri 27; Chrome extension on Sat 28; Android only if a gate passes | Safest route to a complete product and Best Web/Chrome; multi-platform only if time allows | **Chosen by owner** |
| B | Web plus Android in parallel (Kotlin port of the engine), no extension | Strongest multi-platform story, but needs a Nano 4 phone; two half-polished apps risk the Design score | Rejected: no phone, too much risk |
| C | Web, extension and Android all at once | Highest ceiling, most likely to miss the deadline | Rejected |

## 5. Architecture

```
envoy/                     npm workspaces, TypeScript strict
  packages/core/           pure TS, no network, 100% unit-tested
    normalize chunk rules tags guard restore(+expressions) receipt
    prompts/ (detect, minimize, route, answer; versioned; Harness²-tuned)
  packages/ai/             Firebase init, App Check, Remote Config,
                           model factories per step, DEVICE GUARD, inference-source log
  apps/web/                Vite + React + Tailwind v4 + motion; PWA service worker
  apps/extension/          MV3 side panel (day 7) reusing core + ai
  tests/eval/              cases.json + Playwright runner (real model, local only)
  docs/  scripts/  .github/workflows/
```

### Inference per step

| Step | Runs | Mode | Unavailable model → |
| --- | --- | --- | --- |
| Detect (names, roles, orgs, addresses) | device | `ONLY_ON_DEVICE` + guard | rules only, "Basic protection", names flagged for review |
| Minimize (pick clause IDs) | device | `ONLY_ON_DEVICE` + guard | user picks clauses (default: all, masked) |
| Route (answerable locally?) | device | `ONLY_ON_DEVICE` + guard | always the Reason step (masked) |
| Local answer | device | `ONLY_ON_DEVICE` + guard | n/a |
| Reason (masked excerpt) | cloud | `PREFER_IN_CLOUD`; model from Remote Config (default `gemini-3.8-flash`) | offline: on-device, labelled "lighter on-device answer" |
| Restore | code | plain TS | always local |

### Device guard (fixes SDK bug #10635), in `packages/ai/device-guard.ts`
1. **Pre-check:** `'LanguageModel' in self`, and `await LanguageModel.availability(sameOptions) === 'available'`. Otherwise throw `DeviceUnavailable`, and the UI switches to Basic protection.
2. **Call** with `ONLY_ON_DEVICE`.
3. **Post-check:** `response.inferenceSource === InferenceSource.ON_DEVICE`. Otherwise discard the result, raise a privacy alarm and block the flow.
4. **Tripwire:** while a private step runs, a `fetch` wrapper rejects any request to `firebasevertexai.googleapis.com` and logs it in the Network inspector.
5. Unit tests for every branch. A dev toggle "Simulate missing LanguageModel" shows the guard working in the video.

### Detection, tagging, restore
- Rules first (email, phone E.164 and Egyptian formats kept generic, IBAN mod-97, cards with Luhn, money, dates, a light address heuristic). Then Nano JSON (enum roles). **Drop any entity Nano returns that isn't a verbatim span of the source.** Rules win on overlap.
- Consistent role tags (`[LANDLORD]`, `[TENANT]`, `[RENT]`, `[ACCOUNT]`, `[DATE_1]` …), held in memory only and cleared on "Clear session" and when the tab closes.
- **Derived amounts (gap #1):** the cloud prompt asks for arithmetic on tags as `{{RENT * 1.10}}`. `restore.ts` evaluates a whitelisted grammar locally (numbers, tags, + − × ÷, parentheses; no `eval`), formats the currency, and highlights the result in green. This makes "EGP 9,350" real.
- **Guard (outbound):** right before the cloud call, rerun every detector and check every original value against the outbound text. Any hit blocks the send and highlights it.

### Firebase products
- **AI Logic** (Gemini Developer API backend).
- **App Check** (reCAPTCHA Enterprise; debug token on localhost and CI).
- **Remote Config** (cloud model name, prompt versions, feature flags, with safe in-app defaults).
- **Hosting** (live plus PR preview channels via GitHub Actions).
- **No Firestore or Auth:** Envoy stores nothing, and that's the point.

### Offline
A service worker (vite-plugin-pwa) precaches the app shell, so the offline scene works for real.

## 6. Product, screens and fixes to the mockups

The four states (Start, Review, Answer, Local/Offline), About dialog, Network inspector (`?inspect=1`) and `/dev` page follow BRIEF §4. Resolved gaps:

| Gap | Resolution |
| --- | --- |
| Derived amounts | The tag-expression restore above |
| Clause 7 layout | The sample contract puts rent amount and cap in **Clause 7**; bank details go in **Clause 8 (Payment)**, so the excerpt is one clause and `[ACCOUNT]` is never sent |
| Start screen | Add **Enable private mode** (the user gesture for `initializeDeviceModel`), a paste tab and suggested-question chips. File types: **PDF, TXT, paste** (no DOCX). No Arabic sample |
| Counts | Every count on screen comes from the receipt object; nothing is hard-coded |
| Offline banner | "Questions that need the cloud get a lighter on-device answer, labelled as such" (no queue) |

## 7. Visual direction: "privacy instrument" (not cartoonish)

- **UI:** BRIEF §5 tokens (IBM Plex Sans/Mono; ink #16181D on paper #F7F7F5; on-device green #0F7B5F; cloud blue #2557D6; detected amber; restored green). Hairlines, 10/16 px radii, no gradients, no emoji, light and dark themes. Green always means device, blue always means cloud, and both always come with icon and label.
- **Logo:** an original, hand-written SVG: a minimal shield/seal with a forward chevron (a trusted messenger carrying a sealed message). Legible at 16 px. Muse is used only to explore concepts, never as the deliverable.
- **Art (README banners, hero, OG image, video stills):**
  - Editorial still-life with precise fine-line engraving and technical-drawing linework on warm paper. Muted ink tones with a single green or blue accent per image. Soft daylight, subtle paper grain.
  - Motifs: sealed envelopes and wax seals, folded documents with redaction bars, a courier's dispatch case, glass and light passing through a shield, a desk-to-sky path between "device" and "cloud".
  - **No characters or faces, no cartoon, no neon, no brands, no text in the image.**
  - Generated with Muse (budget plan: about 60–120 images, $0.60–$1.20, well under $8). Text is set in code (Plex) with a small compositor script.
- **README** (the playfellow-coop structure in Envoy's style):
  - centered logo, then an animated hero (real app capture as WebP)
  - a row of **five step emblems** (Detect, Minimize, Approve, Reason, Restore) as matched SVG seals
  - an icon and text feature table
  - a full-width banner before every section
  - architecture (Mermaid), the inference-mode table with code links, and eval charts
  - "Judges: try it", tests, "What it does and does not do", glossary, credits and licence

## 8. Motion and accessibility

BRIEF §6 throughout:
- logo draw-in; scan line over the document; staggered highlights; value → tag scramble;
- shared-layout clause move; envelope travel on approve; count-up receipt.

All motion respects reduced motion. `aria-live` announcements, full keyboard flow, AA contrast in both themes. Built with the `animate`, `emil-design-eng`, `web-accessibility` and `frontend-design` skills.

## 9. Demo video (≤ 2:50)

- Script from the plan doc.
- Real screen capture from the F: Chrome profile, recorded by Playwright, with OBS as a fallback.
- Narration with **Chatterbox** (the owner already has a local Chatterbox install). Licence checked before use. A neutral voice; no real person's cloned voice.
- Assembled with ffmpeg (and HyperFrames for title cards if time allows) by the `craft-video` and `video-narration` skills. English captions burned in plus an `.srt`. Uploaded to YouTube by the owner.

## 10. Quality, governance, security

- **Gate:** `npm run verify` (lint, typecheck, unit tests, build) must pass before every commit. CI runs the same, and `main` always deploys.
- **Constitution:** a lean version of the project-constitution / claude-bible pattern. `docs/PLAN.md` holds the checklist, decisions and stubbed list; the "may this leave?" gate is the verify command plus the rules checklist; no fake claims (statuses are wired, built or stubbed, never inflated).
- **Reviews:** one reviewer at a time at each checkpoint (EGM reviewer agents, run sequentially; never a swarm). Fix findings before moving on.
- **Security sweep** (end of Phase 2 and before submission): `security-review` + CSO checklist, CSP, dependency audit, secret scan, guard tests.
- **Harness²:** tune the on-device prompts against `tests/eval`, logging results in `docs/harness/LESSONS.md`.

## 11. Schedule (Cairo days)

| Day | Phase | Done when |
| --- | --- | --- |
| Sun 22 | 0–1: repo, Firebase project, App Check, workspaces, `/dev` page, first deploy | One on-device and one cloud call return text on the hosted URL |
| Mon 23 | 2: core engine + guard + tests | Masked excerpt for Mona's question; guard tests green |
| Tue 24 | 2–3: pipeline wired, Review screen | Sample answered end to end with restore |
| Wed 25 | 3: Answer, receipt, Local and Offline, inspector | All four states on a preview URL |
| Thu 26 | 4: logo, assets, motion, a11y, dark theme | Lighthouse ≥ 90; animations listed |
| Fri 27 | 5: eval + Harness² tuning, hardening, README | Eval table filled; feature freeze for the web app |
| Sat 28 | Extension (side panel) + polish | Extension loads unpacked and runs the flow |
| Sun 29 | Video, Devpost text, final README | Video uploaded; checklist ticked |
| Mon 30 | Buffer, submit by 18:00 Cairo | Submitted |

## 12. Calls I made (owner may override)

- Repo `hesham88/envoy`, public from day 1, Apache-2.0. Firebase project ID `envoy-hybrid-ai`, or the closest available.
- Cloud model `gemini-3.8-flash` via Remote Config (falls back to the SDK default `gemini-3.5-flash-lite`).
- No Firestore or Auth. Remote Config is the extra Firebase product.
- Chrome extension = a side panel with the same flow on pasted or selected text. No content-script DOM scraping.

## 13. Left to the builder

Exact prompt wording (Harness² tunes it); component breakdown; chart styling; banner copy; video edit timing.

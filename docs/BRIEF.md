# Envoy — build brief for Claude Code

> **Amendments 2026-11-22 (owner decisions; these override the text below):**
> - **English only.** Drop the Arabic sample, IBM Plex Sans Arabic, and Arabic-specific tests from scope (Chrome's on-device model doesn't support Arabic). Keep Egyptian formats (national ID, +20 phones, EG IBAN), because the persona lives in Cairo.
> - **Chrome extension is a stretch goal** (owner, 2026-11-22) after the web app. It replaces the "no Chrome extension" line in §10. Android is out for now.
> - **SDK bug #10635:** every private step goes through our device guard (see `AGENTS.md` and the design doc).
> - **Sample layout:** rent amount and 10% cap in Clause 7; bank details in a separate Clause 8.
> - **Derived amounts:** the cloud writes `{{RENT * 1.10}}`, and restore evaluates it locally.
> - **Firebase products:** AI Logic, App Check, Remote Config and Hosting. No Firestore or Auth.
> - **Judge experience:** many judges' machines can't run the on-device model, so Basic protection must look polished too. Ship a short "turn on on-device AI" guide, and make the video show the full on-device flow.
> - **Keep going, no stopping:** checkpoints are status posts, not pauses (owner, 2026-11-22). Stop only when truly blocked.
> - Full design: `docs/superpowers/specs/2026-11-22-envoy-design.md`. Rules: `docs/HACKATHON_RULES.md`.

You are the main builder of **Envoy**, a web app for the Firebase **#BuildHybridAI 2026** hackathon.
Deadline: **Mon 30 Nov 2026, 2:00 PM PST (midnight Cairo)**. Our own target: submitted by Mon 30 Nov, 6:00 PM Cairo.
Judges score: Technological Implementation, Design, Potential Impact, Quality of the Idea. A polished, working, small product beats a big unfinished one.

This file is the source of truth. Save it as `docs/BRIEF.md` and re-read it at the start of every session.

---

## 0. How to work

- Work in the **phases** in section 9. **Keep going; don't stop at checkpoints.** At every **CHECKPOINT**, post a short status (what you did, what works, what is stubbed, and what I need to do) and continue straight into the next phase in the same session. Stop only when you're truly blocked: you need my input, credentials or a console step that the next work depends on, or an action is destructive or irreversible.
- Use small commits with conventional messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). Run `npm test` and `npm run build` before every commit. Never commit a red build.
- Branching: one short-lived branch per phase (`phase-2-privacy-engine`, …). Open a PR with `gh` so the PR gets a Firebase preview URL. Merge when green. `main` must always deploy.
- Never commit secrets or `.env`. Commit `.env.example`.
- **Do not guess SDK APIs.** Before using any Firebase AI Logic function, open the installed type definitions (`node_modules/firebase/ai` and `node_modules/@firebase/ai/dist/*.d.ts`) and confirm the exact names: `getAI`, `getGenerativeModel`, `GoogleAIBackend`, `InferenceMode`, the on-device initialization method, how to set the cloud model, structured output (`responseSchema`), and how a response reports whether it ran on-device or in the cloud. If something in this brief doesn't match the typings, follow the typings and tell me.
- Keep `docs/PLAN.md` updated: checklist with status, and a "Stubbed / known issues" list.
- Other AI agents (Antigravity, Claude on claude.ai, others) will also work on this repo. Write `AGENTS.md` (and copy it to `CLAUDE.md` and `GEMINI.md`) containing: folder structure, the inference-mode rules (section 2), the privacy rules (section 3), commands, code style, commit style, and "update docs/PLAN.md when you finish a task".

---

## 1. Product

**Envoy — your private AI agent to the cloud.**

A user drops in a private document (rental contract, offer letter, lab report) and asks a question. Envoy's **on-device** model (Gemini Nano in Chrome):
1. finds the personal data,
2. keeps only the parts of the document the question needs,
3. replaces identities with **meaning-preserving role tags** (`[LANDLORD]`, `[TENANT]`, `[RENT]`).

The user then **reviews and approves exactly what the cloud will see**. Cloud Gemini answers from that masked excerpt. Envoy **restores the real values locally** and shows a **privacy receipt**. Simple factual questions are answered **on-device with zero cloud calls**.

Concept: *Privacy-Conscious Delegation*, from PAPILLON (Li et al., NAACL 2025): a trusted small local model uses a powerful cloud model as a tool. Credit it as **inspiration** (not "implements PAPILLON") in the About panel and the README.

What sets it apart from existing masking extensions: they mask blindly and send the whole text. Envoy's local model reasons about the question, shares the minimum, keeps the meaning, needs the user's approval, and works with Arabic and Egyptian formats.

Demo persona: **Mona**, a tenant in Cairo. Her landlord wants a 20% rent increase. Her 6-page contract has her national ID, phone, address and bank details.

---

## 2. Hard technical requirements (non-negotiable)

- **Stack:** Vite + React + TypeScript (strict), Tailwind CSS v4 with design tokens as CSS variables, `motion` (Framer Motion), `lucide-react`, `pdfjs-dist` (text PDFs only), Vitest + Testing Library, ESLint + Prettier.
- **No backend server.** It's a static SPA on Firebase Hosting. No document text ever reaches any server of ours. The only network calls are Firebase services (AI Logic cloud inference with the masked excerpt, App Check, optional Remote Config).
- **All AI calls go through the Firebase AI Logic web SDK** (`firebase` package ≥ 12.5.0, imported from `firebase/ai`) and run in the browser at runtime. Do **not** use `@google/genai` or any other SDK for the main flow.
- **One model instance per step, with a deliberate mode:**
  | Step | Mode | If the on-device model is unavailable |
  | --- | --- | --- |
  | detect (names, roles, places) | `InferenceMode.ONLY_ON_DEVICE` | rule-based detection only, "Basic protection" banner, names flagged for manual review |
  | minimize (pick needed clauses) | `InferenceMode.ONLY_ON_DEVICE` | user picks clauses manually (default: whole doc, masked); show a clear notice |
  | route (can it be answered locally?) | `InferenceMode.ONLY_ON_DEVICE` | always go to reason step (still masked) |
  | local answer | `InferenceMode.ONLY_ON_DEVICE` | n/a |
  | reason (answer masked excerpt) | `InferenceMode.PREFER_IN_CLOUD` | when offline: falls back to on-device, labeled "lighter on-device answer" |
  | restore | plain TypeScript | always local |
- **Never** let a private step silently fall back to the cloud, and never send raw text to the cloud as a fallback.
- Initialize the on-device model **only after a user gesture** (the "Enable private mode" button). Show states: Checking → Downloading (progress if available) → Ready → Unavailable (→ Basic protection).
- Use **structured JSON output** (`responseSchema`) for detect, minimize and route.
- Record which inference source served every step (use what the SDK returns; see section 0) and show it in the UI and the receipt.
- Cloud model name configurable via `VITE_CLOUD_MODEL`. Pick a current Gemini Flash-class model supported by the SDK, and say which in `docs/PLAN.md`.
- **App Check** with reCAPTCHA Enterprise (`VITE_RECAPTCHA_SITE_KEY`). In dev, enable the debug token (`self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before init) and document how to register it in the console.
- Firebase config from env: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_STORAGE_BUCKET`.
- **Hosting:** `firebase.json` (SPA rewrite to `/index.html`, long cache for hashed assets, no cache for `index.html`, security headers incl. a strict Content-Security-Policy that allows only self + Firebase/Google endpoints you actually use), `.firebaserc`. GitHub Actions: deploy to live on push to `main`, preview channel on every PR (`FirebaseExtended/action-hosting-deploy`, secret `FIREBASE_SERVICE_ACCOUNT_<PROJECT>`). Tell me exactly how to create the secret.
- npm scripts: `dev`, `build`, `preview`, `test`, `lint`, `typecheck`, `eval`, `deploy` (`firebase deploy --only hosting`).

---

## 3. Privacy engine (`src/privacy/`)

All pure TypeScript, fully unit-tested, no network.

- **`normalize.ts`:** convert Arabic-Indic (٠–٩) and Eastern Arabic-Indic (۰–۹) digits to ASCII for matching, while keeping a character-offset map back to the original text.
- **`rules.ts`:** deterministic detectors, each returning `{type, value, start, end, confidence}`:
  - email
  - phone: Egypt (`+20` / `0020` / `01x` mobile, landlines) and international E.164
  - **Egyptian national ID:** 14 digits; 1st digit century (2 = 1900s, 3 = 2000s); digits 2–7 a valid YYMMDD birth date; digits 8–9 a governorate code from an allowlist (01–04, 11–35, 88); don't reject on the final check digit
  - **EG IBAN:** `EG` + 27 digits (spaces allowed), verified with mod-97; generic IBAN mod-97 for others
  - card numbers (13–19 digits, Luhn)
  - money amounts with currency (EGP, LE, ج.م, جنيه, USD, $, €)
  - dates (common English and Arabic formats)
  - street addresses: a light heuristic only; addresses are mainly Nano's job
- **`nano.ts`:** on-device prompts:
  - `detectEntities(text, question)` → persons, organizations, addresses, each with a **role** relevant to the document (landlord, tenant, employer, employee, patient, doctor, …)
  - `selectClauses(chunks, question)` → ids of the minimum set of chunks needed, plus a one-line reason
  - `route(question, chunks)` → `{answerable_locally: boolean, reason}`
  - `answerLocally(question, chunks)` for simple factual questions
  - Chunk the document into numbered clauses/paragraphs first (`chunk.ts`). Keep prompts short and explicit; small models need it.
- **Merge:** rules win on overlap; Nano adds what rules can't find.
- **`tags.ts`:** consistent role tags (`[LANDLORD]`, `[TENANT]`, `[TENANT_2]`, `[RENT]`, `[ACCOUNT]`, `[NATIONAL_ID]`, `[PHONE]`, `[ADDRESS]`, `[DATE_1]` …). The same value always gets the same tag. The tag ↔ value map lives **only in memory** (never localStorage/IndexedDB, never sent), cleared on "Clear session" and tab close.
- **Meaning preservation:** amounts can keep relationships when the question needs them. For example, keep percentages and "increase from [RENT] by 20%"; never send the absolute private amount.
- **`guard.ts` — outbound leak check:** right before any cloud call, run every detector again on the outbound text and check every original detected value. If anything raw is found, **block the send**, highlight it, and ask the user. Unit-test this hard.
- **`restore.ts`:** swap tags back into the cloud answer; return spans so the UI can highlight restored values.
- **`receipt.ts`:** counts of items found / shared / kept, characters sent, pages sent vs total, per-step timings and inference source.
- **Tests:** every detector with positive and negative cases in English and Arabic, including Arabic-Indic digits; tag consistency; restore round-trip; guard blocks a leak; chunking.

---

## 4. Screens and flow

A single page with four states (no router needed except a `/dev` page):

1. **Start:** logo + header with a model status pill ("Private mode on · Gemini Nano ready" / "Downloading 42%" / "Basic protection"). Hero: **"Ask the cloud. Keep your secrets."** Sub: "Envoy's on-device AI reads your document and question first, then shares only what the cloud needs to answer." Drop zone (PDF, TXT, paste) + **Try a sample contract** + **Try an Arabic sample**. Question textarea. **Analyze privately** button. Side panel "How Envoy handles your question": 1 Detect & minimize (On-device), 2 Reason (Cloud · only if needed), 3 Restore (On-device), plus the line "No on-device model? Envoy switches to built-in local rules. It never falls back to sending your raw document to the cloud."
2. **Review:** progress "1 Detect ✓ — 2 Review — 3 Answer". Your question at the top. Left: document viewer with detected items highlighted (amber) and a legend; the selected clause outlined (dashed blue) with "Clause 7 · selected by on-device AI"; irrelevant parts collapsed ("… pages 2–3 not relevant …"). Click a highlight to toggle share/hide. Right: **"What the cloud will see"** card (monospace, tags as dark chips), stats "1 clause shared, out of 6 pages" / "0 identities leave your device", buttons **Approve and send** / **Edit excerpt** (editable textarea, re-checked by `guard.ts`). Below: "Found on device" list by type with counts and what happens to each.
3. **Answer:** a one-line verdict in bold, then explanation with restored values highlighted green. Chips: "Reasoned in the cloud" + "Personalized on device". Small print: "Values highlighted in green were restored on your device. This explains your document; it isn't legal advice." Buttons: Draft a reply / Copy answer. Follow-up input. Right: **Privacy receipt** ("Left your device: 1 clause · 312 characters" / "Stayed on device: 14 personal items · 6 pages") + "What happened" timeline (time, step, Device/Cloud).
4. **Local / offline:** dark banner "You're offline. Envoy keeps working with your on-device model." Answer card with "Answered on device" and stats "0 cloud calls · 0 bytes left this computer · 1.6s". Side cards: routing explanation, and the "Basic protection" explanation.

Also:
- **About / How it works** dialog: the 5-step diagram, inference mode per step, research credit with link.
- **Dev-only Network inspector** drawer (visible with `?inspect=1`): every outbound AI request with the exact payload text. This is our proof in the video.
- **`/dev` page** (Phase 1): raw tests of each model and mode.

### Sample documents (`src/samples/`)
Fictional people, structurally valid but fake IDs:
- **English:** "Residential lease, Cairo", 6 short pages: Landlord **Karim Fathy**, Tenant **Mona Adel**, national IDs, phone `+20 100 555 0192`, address `14 El-Nadi St, Flat 7, Maadi, Cairo`, start date 1 September 2024, 3-year term, monthly rent **EGP 8,500**, IBAN `EG38 0019 0005 0000 0000 2631 8000 2`. **Clause 7:** "The Landlord may increase the rent once per contract year by no more than 10%, with at least 60 days' written notice to the Tenant." Also clauses on deposit, utilities, maintenance, termination.
- **Arabic:** the same contract in Modern Standard Arabic, rendered RTL, with Arabic-Indic digits in some places.
- Suggested questions as chips: "Can my landlord raise the rent 20% this year?", "When does my contract end?", "What happens to my deposit if I leave early?"

---

## 5. Visual design: high fidelity, distinctive

- **Mood:** calm, precise, trustworthy, a "privacy instrument". Light theme first, with a polished dark theme toggle (respect `prefers-color-scheme`).
- **Type:** IBM Plex Sans (UI), IBM Plex Mono (masked text, tags, timings), IBM Plex Sans Arabic (Arabic text). Use a clear type scale, e.g. 44 / 24 / 18 / 16 / 14 / 13 px.
- **Color tokens (light):** ink `#16181D`, paper `#F7F7F5`, surface `#FFFFFF`, line `#E2E2DD`, muted text `#4E5461` / `#5B616E`.
  On-device green `#0F7B5F` (tint `#E3F1EC`, text-on-tint `#0B5E48`). Cloud blue `#2557D6` (tint `#E6ECFB`, text-on-tint `#1F45AD`). Detected item amber `#FFE3BF` with underline `#B4540A`. Restored value `#DDF0E8`.
  **Green always means on-device and blue always means cloud**, and every badge also has an icon and a label (never color alone). WCAG AA contrast everywhere, in both themes.
- Radius: 10 px controls, 16 px cards. Hairline borders, no drop-shadow soup, no decorative gradients, no emoji, no generic AI sparkle icons. Lucide icons at 1.75 stroke.
- **Logo:** design an original SVG mark for Envoy: a minimal geometric shield/seal combined with a forward chevron (a trusted messenger carrying a sealed message), plus a wordmark in IBM Plex Sans Bold. It must work at 16 px and must not resemble any existing brand. Deliver it as a React component (`<Logo animated />`), `favicon.svg`, `apple-touch-icon.png`, and a 1200×630 OG image.

---

## 6. Motion and micro-interactions

Use `motion`; wrap everything in a reduced-motion check (reduced = instant state changes, no movement).
- Logo stroke draws in on first load (under 900 ms).
- **Detection:** a thin scan line sweeps the document; detected items highlight in sequence (staggered 40 ms).
- **Masking:** in the "What the cloud will see" panel, each real value visibly collapses into its tag (short text scramble → tag chip).
- **Minimization:** irrelevant parts fade and collapse; the selected clause lifts and slides into the cloud panel (shared-layout animation).
- **Approve:** a small sealed-envelope glyph travels from the device zone to a cloud icon; while waiting, a calm pulse on the cloud chip; when the answer returns, restored values flash green once.
- Receipt numbers count up; timeline rows appear one by one.
- Status pill animates download progress.
- Durations 150–600 ms, eased, interruptible, never blocking input.
- **Accessibility:** full keyboard flow, visible focus rings, `aria-live="polite"` announcements for each step ("Found 14 personal items on your device"), real buttons and labels, alt text, RTL correct for Arabic.

---

## 7. Repo and docs

- `README.md`: one-paragraph pitch, screenshot/GIF placeholders, architecture diagram (Mermaid), **"How we use Firebase AI Logic"** with links to the exact files and lines, the inference-mode table, privacy guarantees (and their limits, honestly), setup in 5 steps, eval results table (filled in Phase 5), research credit, license.
- `LICENSE`: Apache-2.0 (check the repo already has it).
- `AGENTS.md` + `CLAUDE.md` + `GEMINI.md` (same content), `docs/BRIEF.md` (this file), `docs/PLAN.md`.
- Folder structure:
  ```
  src/app        app shell, state machine, routes
  src/ai         firebase.ts (init + App Check), models.ts (one factory per step), inference-source.ts
  src/privacy    normalize, chunk, rules, nano, tags, guard, restore, receipt
  src/screens    Start, Review, Answer, Local
  src/components Logo, StatusPill, ModeChip, DocumentViewer, CloudPreview, Receipt, Timeline, NetworkInspector, …
  src/samples    en-lease.ts, ar-lease.ts
  src/styles     tokens.css, globals.css
  tests/         unit tests + eval/
  ```
- Use a small explicit state machine for the flow (idle → loaded → detecting → review → sending → answered / local / error). No global state library needed.

---

## 8. Evaluation harness (Phase 5)

- `tests/eval/cases.json`: 30–50 cases (English and Arabic), each with document text, question, and gold list of sensitive values.
- `npm run eval` runs in a headless Chrome with on-device AI if available (Playwright with the local Chrome channel), else rules-only. It reports:
  - leakage for **Nano alone**, **rules alone**, and **Envoy layered**: % of gold sensitive values that appear in the outbound excerpt
  - excerpt size vs document size
- Write the results to `docs/EVAL.md` and the README table. Quality of answers is judged manually; give me a simple sheet to rate 20 answers.

---

## 9. Phases and checkpoints

Checkpoints are **status posts, not pauses**. Post the status, then keep building.

**Phase 0 — Environment (15 min).** Check Node ≥ 20, npm, git remote, `gh` auth, `firebase-tools` (use `npx firebase-tools` if not installed). Ask me for the Firebase project ID and web config if `.env` is missing; create `.env.example`.

**Phase 1 — Scaffold and feasibility.** Vite React TS, deps, lint/test setup, tokens.css, `src/ai/firebase.ts`, `src/ai/models.ts`, and a **`/dev` page** with buttons: "Enable private mode" (initialize on-device), "Test ONLY_ON_DEVICE", "Test PREFER_IN_CLOUD", "Test structured output on-device", and an Arabic test prompt. Show the response, latency, inference source, and any error verbatim. Add the Firebase Hosting config, GitHub Actions, AGENTS.md / CLAUDE.md / GEMINI.md, docs/PLAN.md. Deploy once.
→ **CHECKPOINT 1:** tell me how to run it locally and the live URL. I'll test in desktop Chrome and report whether Nano works (English and Arabic).

**Phase 2 — Privacy engine.** Everything in section 3 with tests, plus a dev-page panel that runs the full pipeline on the sample contract and prints the masked excerpt, the guard result, and the receipt.
→ **CHECKPOINT 2:** test summary, plus the masked excerpt for "Can my landlord raise the rent 20% this year?"

**Phase 3 — Product UI.** Logo, design system, the four screens, sample documents, About dialog, Network inspector. Wire to the real engine.
→ **CHECKPOINT 3:** live preview URL and screenshots of each state.

**Phase 4 — Motion, polish, accessibility.** Section 6, dark theme, empty/loading/error states, responsive down to 1024 px (mobile is a bonus), Lighthouse ≥ 90 for performance and accessibility.
→ **CHECKPOINT 4:** preview URL and a list of animations implemented.

**Phase 5 — Hardening, eval, docs.** Basic-protection path tested (simulate an unavailable model), offline path, guard edge cases, eval harness and results, README complete, OG image, final deploy.
→ **CHECKPOINT 5:** final URL, eval numbers, and a list of anything not done.

---

## 10. Do not build

Accounts, saved history, analytics on document content, server-side processing, a Chrome extension, image OCR, DOCX parsing, payments, i18n of the whole UI (Arabic document support is enough; UI stays English).

## 11. Done means

- `npm run build`, `npm test`, `npm run lint`, `npm run typecheck` all pass; CI green.
- With Gemini Nano available: the full flow works end to end on both samples; the Network inspector proves the cloud saw only the approved, masked excerpt.
- Without Nano: Basic protection is shown clearly and the flow still completes safely.
- Offline: "When does my contract end?" is answered on-device with 0 cloud calls.
- No console errors, no layout shift, live on Firebase Hosting.

# Envoy Product UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (owner preference: native, in-session; no subagent swarms; keep going at checkpoints). Steps use checkbox (`- [ ]`) syntax.

**Goal:** The real Envoy app at `/`, wired to the tested engine: Start → Review → Answer and Local/Offline, plus About, the Network inspector, a "turn on on-device AI" guide, a polished Basic protection mode, offline support, and the Envoy logo.

**Architecture:** The React SPA in `apps/web` holds one in-memory session in a `useReducer` state machine (`src/app/session.ts`), so nothing is persisted. Engine calls go through `@envoy/ai` (`analyze`, `answer`) and a new pure `composeOutbound` that recomputes the excerpt when the user hides, shares or picks clauses. Tailwind v4 maps the BRIEF §5 tokens; `motion` handles animation; `lucide-react` provides icons; fonts are self-hosted (CSP `font-src 'self'`).

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), `motion`, `lucide-react`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, `pdfjs-dist` (text PDFs), `vite-plugin-pwa`, Vitest with `@testing-library/react` and `jsdom`.

**Spec:** `docs/superpowers/specs/2026-11-22-envoy-design.md`, BRIEF §4–6, mockups canvas (https://claude.ai/artifact/5jsHsbktxxskhCPpm69Pni), and the gap resolutions in design §6.

## Global Constraints
- Green (`--device`) always means on-device; blue (`--cloud`) always means cloud. Every badge also has an icon and a text label.
- No colour alone. WCAG AA in both themes. Touch targets ≥ 44px.
- Every count on screen comes from the `Receipt` / `Analysis` objects. Nothing is hard-coded.
- The tag↔value map and the document text live in memory only. "Clear session" and tab close drop them.
- `initializeDeviceModel()` is called only inside the **Enable private mode** click handler.
- Basic protection is a first-class, polished mode, never an error screen.
- Copy follows BRIEF §4 wording, with the design §6 fixes:
  - file types are PDF, TXT and paste (no DOCX);
  - no Arabic sample;
  - the offline banner says cloud questions get a "lighter on-device answer".
- Motion respects `prefers-reduced-motion`. Durations are 150–600 ms and never block input.
- No emoji, no gradients, no AI-sparkle icons. Lucide icons at stroke 1.75.

## Review Focus
1. **The user hides a value, then re-shares it, then edits the excerpt by hand.** The outbound text and guard must follow each change, and Approve stays disabled while the guard reports leaks. → Task 3 test `composeOutbound honours hidden and shared tags`, Task 6 test `approve disabled while guard has leaks`.
2. **The model download is in progress** (`downloading`) **when the user clicks Analyze.** The app must run in Basic protection with a clear notice, never wait silently. → Task 4 test `analyze during download uses basic mode with notice`.
3. **The network drops between Review and Approve.** Expect a lighter on-device answer, labelled, or a clear error; never a hang. → Task 8 test `offline answer is labelled lighter`.
4. **A PDF with no text layer (a scan).** Expect a clear "This PDF has no selectable text" message, and no empty analysis. → Task 5 test `scanned pdf shows no-text message`.
5. **Keyboard-only use** through Start → Review → Answer, with focus moved to each new screen's heading and an `aria-live` announcement per step. → Task 9 test `keyboard flow and announcements`.

---

### Task 1: Tooling, fonts, Tailwind tokens, test environment
**Files:** `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/src/styles/app.css` (Tailwind `@import` plus `@theme` mapping the `tokens.css` variables), `apps/web/src/test/setup.ts`, `apps/web/vitest.config.ts` (jsdom).
- [ ] Install the stack above. Self-host Plex via `@fontsource` imports in `main.tsx`.
- [ ] Smoke test `renders the app shell`, via Testing Library, asserting the `banner` landmark exists.
- [ ] Commit `chore(web): tailwind v4, motion, lucide, plex fonts, jsdom tests`.

### Task 2: Logo
**Files:** `apps/web/src/components/Logo.tsx`, `apps/web/public/favicon.svg`.
**Produces:** `<Logo size?: number; animated?: boolean; withWordmark?: boolean />`.
- [ ] The mark is an original geometric shield/seal combining a forward chevron with an envelope-flap notch, drawn as a single 24×24 stroke path set. It must read at 16px (check `favicon.svg` rendered at 16px). The wordmark is "Envoy" in Plex Sans Bold.
- [ ] `animated`: the stroke draws in over ≤ 900 ms on first mount (`pathLength`); the final state is immediate under reduced motion.
- [ ] Test `logo has accessible name "Envoy"`. Commit `feat(web): Envoy logo and favicon`.

### Task 3: `composeOutbound` (engine, pure)
**Files:** `packages/ai/src/pipeline.ts` (refactor), `packages/ai/src/pipeline.test.ts`.
**Produces:** `composeOutbound(a: Analysis, opts: { selectedIds: number[]; hiddenTags: Set<string>; sharedTags: Set<string> }): { outbound: string; guard: …; receipt: Receipt }`.
- Hidden tags: the whole sentence containing that tag is replaced by `[…]`.
- Shared tags: the real value is shown (the user chose this; the guard treats it as allowed). Add an `allowed?: string[]` parameter to `checkOutbound` for this.

`analyze` calls `composeOutbound` with defaults.
- [ ] Tests:
  - `composeOutbound honours hidden and shared tags` (hide `[RENT]` → the sentence is gone; share `[RENT]` → "EGP 8,500" appears and the guard is ok);
  - `custom clause selection changes the outbound and receipt`.
- [ ] Commit `feat(ai): composeOutbound for review edits`.

### Task 4: Session state machine and the Envoy runtime hook
**Files:** `apps/web/src/app/session.ts` (reducer), `apps/web/src/app/useEnvoy.ts`, tests.
**Produces:**
- States: `idle | loaded | analyzing | review | sending | answered | error`.
- Actions: `LOAD_DOC{text,title,source}`, `SET_QUESTION`, `ANALYZE_START`, `ANALYZE_DONE{analysis,notice?}`, `TOGGLE_TAG{tag,mode:'hide'|'share'|'default'}`, `SET_CLAUSES{ids}`, `EDIT_OUTBOUND{text}`, `SEND_START`, `ANSWER_DONE{result}`, `FAIL{message}`, `CLEAR`.
- `useEnvoy()` returns `{ status: 'checking'|'no-api'|'unavailable'|'downloadable'|'downloading'|'available'; progress: number|null; settings; enablePrivateMode(): void; deps: Deps | null; configError: string|null }`. It polls `getDeviceStatus` while downloading.
- [ ] Tests:
  - every legal transition;
  - `CLEAR` wipes document, analysis and outbound;
  - `analyze during download uses basic mode with notice` (the notice copy is "Your on-device model is still downloading, so this run uses Basic protection.").
- [ ] Commit `feat(web): session state machine and runtime hook`.

### Task 5: Start screen
**Files:** `src/screens/Start.tsx`, `src/components/{AppHeader,StatusPill,DropZone,QuestionBox,HowItWorks,OnDeviceGuide}.tsx`, `src/lib/readFile.ts` (TXT via `File.text()`, PDF via `pdfjs-dist` text extraction, joining pages with `--- Page N ---` markers).
- [ ] Layout and copy per the mockup's Start artboard, plus:
  - **Enable private mode** (primary button while the model isn't ready);
  - the paste tab;
  - suggested-question chips;
  - **Try a sample contract**, which shows `EN_LEASE.notice`.
- [ ] The `OnDeviceGuide` card appears when status ≠ available. It gives three steps (Chrome 148+ desktop; Settings → AI → On-device AI; click Enable private mode) with a live status check, and links to `chrome://on-device-internals` as copyable text.
- [ ] Tests:
  - `analyze disabled until a document and question exist`;
  - `scanned pdf shows no-text message`;
  - `sample button loads the lease and shows the fictional notice`.
- [ ] Commit `feat(web): start screen`.

### Task 6: Review screen
**Files:** `src/screens/Review.tsx`, `src/components/{ProgressSteps,DocumentViewer,CloudPreview,FoundList,TagChip}.tsx`.
- [ ] `DocumentViewer`:
  - entities highlighted amber with an underline; legend;
  - selected clauses outlined dashed blue, labelled "Clause N · selected by on-device AI" (or "· included by Basic protection");
  - unselected runs collapsed to "… Clauses a–b not shared …";
  - each highlight is a button that cycles share/hide/default through `TOGGLE_TAG`;
  - clause checkboxes call `SET_CLAUSES`.
- [ ] `CloudPreview`:
  - mono text with tag chips;
  - stats from the receipt;
  - **Approve and send** is disabled while `guard.ok` is false;
  - **Edit excerpt** opens a textarea; every change is re-checked and leaks are highlighted inline with the reason.
- [ ] `FoundList` shows counts by type from `receipt.found` and what happens to each (masked as role / not shared / flagged for review).
- [ ] Tests:
  - `approve disabled while guard has leaks`;
  - `hiding a highlighted value updates the preview`;
  - `basic mode shows flagged names once each`.
- [ ] Commit `feat(web): review screen`.

### Task 7: Answer screen, receipt and timeline
**Files:** `src/screens/Answer.tsx`, `src/components/{Receipt,Timeline,ModeChip,RestoredText}.tsx`.
- [ ] Verdict = the first sentence, in bold. Restored spans are highlighted `--restored` (they flash once unless reduced motion is on).
- [ ] Chips: "Reasoned in the cloud" and "Personalized on device", or "Answered on device", or "Lighter on-device answer".
- [ ] Small print per BRIEF §4. Receipt and timeline come from `receipt.steps`.
- [ ] Buttons: **Copy answer** and **Draft a reply**. Draft a reply is a second masked cloud call through the same guard and approve flow. A follow-up input re-runs `analyze` with the same document.
- [ ] Tests:
  - `answer shows restored values and receipt numbers from the receipt`;
  - `local answer shows zero bytes sent`.
- [ ] Commit `feat(web): answer screen with privacy receipt`.

### Task 8: Offline and Local mode, PWA
**Files:** `vite.config.ts` (`vite-plugin-pwa`: precache the app shell, `registerType: 'autoUpdate'`), `src/app/useOnline.ts`, `src/screens/Local.tsx`, `src/components/OfflineBanner.tsx`.
- [ ] The dark offline banner uses the design copy. When the model is available, the route-local answer works with zero network. Cloud-routed questions get the lighter on-device answer, labelled as such.
- [ ] Tests:
  - `offline answer is labelled lighter`;
  - `offline banner appears and clears with connectivity`.
- [ ] Verify the built `sw.js` exists, then deploy. Check in DevTools offline mode that the app shell loads.
- [ ] Commit `feat(web): offline support and local answers`.

### Task 9: About dialog, Network inspector, accessibility pass
**Files:** `src/components/{AboutDialog,NetworkInspector,LiveRegion}.tsx`.
- [ ] `AboutDialog` (native `<dialog>`):
  - the five-step diagram (SVG);
  - the inference mode for each step;
  - the device-guard explanation (#10635);
  - "Inspired by PAPILLON (Li et al., NAACL 2025)" with a link;
  - the Apache-2.0 notice and repo link.
- [ ] `NetworkInspector` drawer (shown with `?inspect=1` or Ctrl+Shift+I inside the app). It lists `networkLog` entries with their full payload, target and blocked state.
- [ ] `LiveRegion`: announcements such as "Found 14 personal items on your device".
- [ ] Focus moves to each screen's `<h1>`, and focus rings are visible.
- [ ] Tests:
  - `keyboard flow and announcements`;
  - `inspector lists the exact payload sent`.
- [ ] Commit `feat(web): about, network inspector, accessibility`.

### Task 10: Polish gate
- [ ] Dark theme toggle, persisted in `localStorage` (a convenience only), wrapped in try/catch.
- [ ] Responsive down to 1024px; phone is a bonus.
- [ ] Lighthouse ≥ 90 for performance and accessibility on the deployed preview.
- [ ] Zero console errors.
- [ ] Update `docs/PLAN.md` and post a Checkpoint 3 status (live URL plus screenshots of every state). Then continue into the motion plan.

## Next plans
`envoy-motion-polish` (BRIEF §6 choreography with the craft animation skills) → `envoy-eval-and-tuning` → `envoy-extension` → `envoy-launch`.

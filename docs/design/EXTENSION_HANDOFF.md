# Chrome extension: design revamp and a release-safety fix (for Muse)

From Claude (core, web and visual-identity lane), 2026-11-22. Two things, most urgent first. The extension stays Muse's lane: nothing here edits `apps/extension`.

## 1. Urgent: keep the App Check debug token out of anything you share

**What's wrong today** (in `lane/extension`):
- `package.json` → `"build": "vite build --mode extensiondev"`. So the everyday `npm run build` takes the `extensiondev` path in `src/env.ts`, which **bakes `VITE_APPCHECK_DEBUG_TOKEN` into the bundle**.
- Dev and release builds both write to the same `dist/`. A zip made from `dist/` after a normal build would contain the token. The token skips App Check, so anyone holding it can spend our Gemini quota.

`src/env.ts` already strips the token in release mode (good); the problem is which build ends up in `dist/`.

**Please change:**
1. Make `build` the release build: `"build": "vite build"`. Rename the dev one to `"build:dev": "vite build --mode extensiondev --outDir dist-dev"`, and gitignore `dist-dev/`. Then `dist/` can only ever hold a token-free build.
2. Add a canary check before any zip:
   `VITE_APPCHECK_DEBUG_TOKEN=CANARY-1234 npm run build -w apps/extension && ! grep -rq CANARY-1234 apps/extension/dist`
   It should fail if the token can reach `dist/`. The web app passes the same check: its bundle compiles the token to `void 0`.
3. **For judges, choose one** (owner's call; tell the owner which):
   - **(a) Recommended: on-device only in the extension.** The panel runs detect / minimize / route / local answers with no cloud and no token. For cloud reasoning it hands off to the hosted app (`https://envoy-hybrid-ai.web.app`), which has real reCAPTCHA Enterprise App Check.
   - **(b) A dedicated judging token:** create a separate debug token just for the judging build, list it in `docs/PLAN.md` (name only, never the value), and **revoke it after judging ends (Dec 16, 2026)**. The everyday token is never zipped.
4. Never commit `dist/`, `dist-dev/`, the token or `.env.local`.

## 2. The revamp: use the shared design system `@envoy/ui`

The web app's look now lives in a workspace package, so the side panel can render the **same components** instead of hand-copied tokens (`src/styles.css` mirrors them today and will drift).

**What it gives you** (`packages/ui`, on branch `lane/core-web`, coming to `main` via PR):

| Export | Use in the side panel |
| --- | --- |
| `@envoy/ui/styles.css` | Tokens (light and dark), the Tailwind theme, reduced-motion guard, seal animation keyframes. Replaces the hand-written token block. |
| `Logo` | Header mark (`<Logo withWordmark animated />`; use `size={20}` in the narrow header). |
| `StatusPill` | Checking → Downloading % → Private mode on → Basic protection, with icon and words. Takes `status` + `progress`. |
| `ModeChip` | "On-device" (green, laptop icon) / "Cloud" (blue, cloud icon) chips. |
| `AnalyzingPanel` | Live per-step progress (on-device steps take 8–60 s on a laptop CPU). Feed it `analyze(..., { onProgress })`. |
| `TaggedText` | The "What the cloud will see" excerpt with `[TAG]` and `[…]` chips. |
| `RestoredText` | The answer, with values restored on the device highlighted green. |
| `EnvoySeal`, `StepEmblem`, `STEP_EMBLEMS`, `ringBand`, `hypotrochoid`, `waveBand` | The security-print visual language (guilloche). The seal (try `size={160}`, `interactive={false}`) belongs on the empty and onboarding states; the step emblems suit the "how it works" strip. |

**How to adopt** (all in `apps/extension`):
1. `git fetch origin && git merge origin/main` once the `lane/core-web` PR lands. Before that, `git merge origin/lane/core-web`.
2. Add `"@envoy/ui": "0.1.0"`, plus devDependencies `tailwindcss` and `@tailwindcss/vite` (same versions as `apps/web`); `npm install` from the repo root.
3. `vite.config.ts`: add `tailwindcss()` from `@tailwindcss/vite` to `plugins`.
4. `src/main.tsx`: `import '@envoy/ui/styles.css';` and delete the hand-copied token block in `src/styles.css`. Keep only panel-specific layout.
5. Fonts: the web app self-hosts IBM Plex via `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` imports in `main.tsx`. Do the same (an extension CSP can't load Google Fonts).
6. Replace hand-built pieces with the components above. Keep your own flow logic, gate and context-menu intake.

**Side-panel design rules** (from the approved design; same rules as the web app):
- **Narrow-first single column** (the panel is about 360–420 px wide): sticky header (Logo + StatusPill), then cards with a 16 px radius, hairline borders, 16 px side padding, 44 px touch targets.
- **Green always means this device; blue always means cloud**, always with an icon and a word, never colour alone.
- **Flow:** Start (paste or selection, question, suggested chips) → Analyzing (`AnalyzingPanel`) → Review (`TaggedText` excerpt, the guard result in words, Approve and send / Edit) → Answer (`RestoredText`, ModeChips, compact receipt: "Left your device: N clause · M characters" / "Stayed on device: K items").
- **Empty state:** a small `EnvoySeal` with one line ("Select text on any page, right-click → Ask Envoy privately") instead of a blank panel.
- **Basic protection is a first-class state**, not an error: explain it in one sentence and list the flagged names.
- **Motion:** reduced motion = instant. The seal's slow rotation is decorative and already respects it.
- **Accessibility:** real buttons and labels, visible focus, `aria-live` announcements for each step.

**Reference implementation:** a living side-panel mockup at `/studio/sidepanel` on the web app (being built on `lane/core-web`), at real panel width, every state, built from the same components. Copy the layout from working code, not from screenshots.

Questions: leave them in `docs/PLAN.md` under "Extension", or ask the owner to relay.

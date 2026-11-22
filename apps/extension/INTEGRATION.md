# Extension integration assessment (for the Claude/web track to pick up)

## Verdict

Feasible and low-risk if kept as a **second surface on the same engine**, not a second product. The scaffold in this folder is deliberately build-free so it cannot collide with the web track. Integrate only after the web polish gate (PLAN Task 10) and the eval harness exist.

## Why it does not collide today

- No `package.json` → npm workspaces (`apps/*`) ignore it; root `tsc -b` references only `packages/core`, `packages/ai`, `apps/web`; Vite builds only `apps/web`.
- Vanilla HTML/CSS/JS mirrors `apps/web/src/styles/tokens.css` values instead of importing them. One source of truth stays in the web app; copy token changes across at integration.
- No changes to `firebase.json`, Hosting, CI, or `docs/PLAN.md` status lines for the web tasks.

## Integration steps (ordered)

1. **Bundle, don't rewrite.** Add a Vite build for this folder with `@vitejs/plugin-react` (same versions as `apps/web`), entry = the side-panel page, output `dist/` loaded unpacked. Reuse the React screens/components from `apps/web/src` where the narrow panel allows, and import `@envoy/core` + `@envoy/ai` exactly as the web app does. Delete the vanilla `sidepanel.js` gate and replace it with the shared device-guard (`packages/ai/src/device-guard.ts`): pre-check `LanguageModel.availability()`, `ONLY_ON_DEVICE`, assert `inferenceSource === ON_DEVICE`, keep the fetch tripwire.
2. **Expose one hook.** The scaffold expects `window.__envoyExtension.analyze(text, question)`. At integration, implement it from the existing `analyze`/`answer` pipeline in `packages/ai/src/pipeline.ts` (plus `composeOutbound` for Review edits), so detect → minimize → approve → reason → restore and the receipt are identical to the web flow.
3. **Solve App Check for `chrome-extension://` — the one real blocker.** AI Logic requires App Check, and reCAPTCHA Enterprise expects a web domain; an extension origin may not attest cleanly. Options to test in order: (a) register the extension's web-accessible hosted page and run the cloud *reason* step from a hosted Envoy page in an iframe/tab (keeps one App Check setup, adds a hop); (b) an App Check debug token for unpacked dev only (never ship it); (c) local-only mode in the extension (detect/minimize/route/local-answer on-device, no cloud) with the web app as the cloud path. Do not ship (b). Decide from a real test against project `envoy-hybrid-ai` after owner steps 1–4 are done.
4. **Permissions stay minimal.** Keep `sidePanel`, `contextMenus`, `storage` (session only). Add `activeTab`/`scripting` only if a future "grab selection" button needs it — the context-menu path already delivers `selectionText` with no host access. No `<all_urls>`, no content script, per design §12.
5. **Package for judges.** Load-unpacked from `dist/` for the demo, plus a zipped release. `minimum_chrome_version: 138` is already set; state the Nano prerequisites in the listing/README exactly as the panel's gate reports them.

## Stunning side-panel UX (what "good" means here)

- **Persistent companion, not a popup:** the panel survives tab switches, so Review can sit beside the source page. Open on toolbar click via `setPanelBehavior({ openPanelOnActionClick: true })`, and from the selection context menu.
- **Narrow-first layout:** single column, sticky header with brand + status pill, cards at 16px radius, hairline borders, no gradients/emoji — the web tokens already in `sidepanel.css`.
- **Trust choreography, cheap version:** status pill narrates Checking → Downloading % → Ready → Basic protection; detected items amber, restored values green flash once, cloud content in blue-tinted mono chips; every colour paired with an icon/label.
- **Keyboard and screen readers:** real buttons/labels, visible focus ring, `aria-live` for step announcements, 44px targets, `prefers-reduced-motion` disables transitions.

## Risks

- App Check on extension origins (above) can force the hosted-iframe design; test before promising the cloud step in the panel.
- Nano in extensions is stable since Chrome 138, but each profile still needs the one-time download and Settings → AI enabled; the gate must stay a first-class screen, not an error.
- The extension is the same Web/Chrome platform for the contest, not a second platform; it strengthens Best Web/Chrome only.

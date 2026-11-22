# Extension integration — done, with one release blocker left

Status 2026-11-22: the side panel is a real Vite + React workspace package
(`@envoy/extension`) on the shared `@envoy/ui` design system, wired to
`@envoy/core` + `@envoy/ai`, now merged with origin/main. Release builds are
token-free by construction: plain `npm run build` is the only writer to
`dist/`, dev builds (extensiondev + App Check debug token) write to
gitignored `dist-dev/`, and `npm run check:dist` is the pre-zip canary gate.
Release builds also make no cloud calls (on-device only, with a handoff to
the hosted web app for cloud-routed questions), so no App Check token ships
to judges at all.

## How it is wired

- `public/manifest.json` + `public/background.js` are copied verbatim into
  `dist/`; `sidepanel.html` + `src/` build the React panel.
- Firebase config comes from `apps/web/.env.local` at build time
  (`envDir: '../web'`). Only the listed variables are inlined; the App Check
  debug token is included **only** for `--mode extensiondev` builds, which
  are for local unpacked use. `dist/` is gitignored and must never ship.
- The panel builds the same `Deps` as the web `/dev` panel
  (`createStepModel` per step with the core schemas, `runPrivate`,
  `getDeviceStatus`) and calls the shared `analyze` (with `onProgress`) and
  `answer`. Mode, clause selection, route, Guard result, receipt summary and
  `fallbackReason` are all shown to the user.
- Permissions stay minimal: `sidePanel`, `contextMenus`, `storage`
  (session only). Text arrives from paste, the sample, or the context-menu
  selection. No content script, no host permissions, per design §12.

## Remaining blocker: App Check for a packed release

Unpacked development works with the App Check debug token. A Chrome Web
Store build cannot ship that token, and reCAPTCHA Enterprise does not attest
a `chrome-extension://` origin naturally. Options, in order: run the cloud
reason step from a hosted Envoy page (one App Check setup, extra hop);
ship the extension local-only (detect/minimize/route/local answers) with the
web app as the cloud path. Do not ship a debug token. Decide after a real
test against project `envoy-hybrid-ai` with a packed build.

## Verification done

- `npm run build -w @envoy/extension`, `npm run typecheck -w @envoy/extension`,
  ESLint and the `gate` unit tests pass; root workspace build still passes.
- The built `dist/` was loaded unpacked in a separate Chrome profile via CDP
  (`Extensions.loadUnpacked`): the service worker registered and the panel
  rendered with its prerequisite gate live.
- Not yet done: a full Nano pipeline run inside the extension panel (needs
  the model downloaded in that test profile), and the packed/App Check test
  above.

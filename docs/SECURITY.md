# Security sweep (23 November 2026)

What was checked, what was found, and what was fixed. Re-run the checks before each release.

| Area | Check | Result |
| --- | --- | --- |
| Dependencies | `npm audit --omit=dev` | 0 vulnerabilities in what ships |
| Dependencies (dev) | `npm audit` | 4 moderate, all in build tooling (`vite-plugin-pwa` → `workbox-build` → `glob`/`minimatch`); none reach the browser. Fix needs a breaking upgrade; tracked |
| Secrets in the repo | tracked `.env`, `.pem`, credential files; UUID-shaped tokens | none (`apps/web/.env.example` has placeholders only; `*.pem` is ignored) |
| Secrets in release bundles | web `dist`, extension `dist`, store zip: App Check debug token, UUID literals | none. The only key is the Firebase web API key, which is public by design; restricting it is an owner step (see `FIREBASE_AI_LOGIC_REVIEW.md`) |
| Source maps | store zip | none shipped |
| Unsafe HTML | `innerHTML =`, `dangerouslySetInnerHTML`, `insertAdjacentHTML`, `eval`, `new Function` in app and extension source | none (only `innerHTML = ''` to clear) — all text goes through `textContent` or React |
| Hosting headers | live `/app` | CSP (`default-src 'self'`, scripts only self + reCAPTCHA, `connect-src` only Firebase), `frame-ancestors` only the extension, HSTS preload, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (no camera, mic, location), COOP |
| Web ↔ extension bridge | `postMessage` | both sides check `origin` and `source`, and post only to the exact origin |
| Extension messages | service worker and offscreen listeners | **fixed:** every listener now ignores messages from anything but this extension; the site switch can only be changed from the extension's own pages and only for an `http(s)` origin; payload types and sizes are checked. Web pages can't message the extension (no `externally_connectable`). Covered by the e2e suite |
| Extension permissions | manifest | `activeTab`, `scripting`, `sidePanel`, `contextMenus`, `storage`, `offscreen`; site access is optional and asked per site |
| Stored data | history and rules | AES-GCM 256 with a non-extractable key in IndexedDB, fresh IV per record, tamper detection, optional passcode (PBKDF2-SHA-256, 600k iterations, AES-KW). Unit-tested (`packages/app/src/lib/vault.test.ts`) |
| Outbound text | the guard | every approved excerpt is re-checked for raw or disguised values; red team 28/28; unreadable encoded text is blocked |
| Model output | restored answers | tags inside links are never restored, so an injected link can't carry a real value out |
| App Check | release vs development | debug tokens only in development builds; enforced in production |
| Removed attack surface | `packages/cli` (the CLI hook) | removed on the owner's request |

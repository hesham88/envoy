/**
 * Build-time guard for Manifest V3's "no remotely hosted code" rule (Chrome Web Store rejection
 * "Blue Argon", 26 Nov 2026). Libraries ship URLs of remote scripts as defaults we never use; the
 * store rejects the package for containing them. This plugin, used only for the extension build:
 *  - empties Firebase's Trusted Types script allowlist (gtag.js, api.js, reCAPTCHA): with an empty
 *    list the SDK cannot create a script URL at all, so it fails closed;
 *  - points Tesseract.js / zxing-wasm CDN defaults at a path inside the package that does not
 *    exist, so an accidental use fails locally instead of fetching code (we always pass our own
 *    packaged paths).
 * `scripts/check-remote-code.mjs` then fails the build if anything remote is left.
 */
import type { Plugin } from 'vite';

export const NO_REMOTE = '/no-remote-code/';
const REMOTE_DEFAULTS = /https:\/\/(?:cdn|fastly)\.jsdelivr\.net\/|http:\/\/localhost:3000\//g;

/** Rewrite one module's source; exported for the unit test. */
export function stripRemoteCode(id: string, code: string): string {
  let out = code;
  if (/[\\/]@firebase[\\/]app[\\/]/.test(id))
    out = out.replace(/const ALLOWED_SCRIPT_URLS = \[[^\]]*\];/, 'const ALLOWED_SCRIPT_URLS = [];');
  if (/[\\/]node_modules[\\/]/.test(id)) out = out.replace(REMOTE_DEFAULTS, NO_REMOTE);
  return out;
}

export function noRemoteCode(): Plugin {
  return {
    name: 'envoy-no-remote-code',
    enforce: 'pre',
    transform(code, id) {
      const out = stripRemoteCode(id, code);
      return out === code ? null : { code: out, map: null };
    },
  };
}

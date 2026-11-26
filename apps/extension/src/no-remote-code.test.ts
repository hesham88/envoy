import { describe, expect, it } from 'vitest';
import { NO_REMOTE, stripRemoteCode } from '../no-remote-code';

// Web Store rejection "Blue Argon" (26 Nov 2026): these exact strings were in the package.
const FIREBASE_APP = `const ALLOWED_SCRIPT_URLS = [
    'https://www.googletagmanager.com/gtag/js',
    'https://apis.google.com/js/api.js',
    'https://www.google.com/recaptcha/api.js',
    'https://www.google.com/recaptcha/enterprise.js'
];`;

describe('stripRemoteCode (extension build)', () => {
  it("empties Firebase's script allowlist, so no remote script URL can be created", () => {
    const out = stripRemoteCode('/x/node_modules/@firebase/app/dist/esm/index.esm.js', FIREBASE_APP);
    expect(out).toBe('const ALLOWED_SCRIPT_URLS = [];');
    expect(out).not.toMatch(/https:/);
  });

  it('points CDN defaults (Tesseract.js, zxing-wasm) inside the package, where nothing exists', () => {
    const src =
      'w="https://cdn.jsdelivr.net/npm/tesseract.js@v7/dist/worker.min.js";z=`https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/`;d="http://localhost:3000/dist/tesseract.min.js"';
    const out = stripRemoteCode('C:\\x\\node_modules\\tesseract.js\\src\\index.js', src);
    expect(out).not.toMatch(/jsdelivr|localhost:3000/);
    expect(out.split(NO_REMOTE)).toHaveLength(4);
  });

  it("leaves Envoy's own code alone", () => {
    const own = "const u = 'https://cdn.jsdelivr.net/npm/x.js';";
    expect(stripRemoteCode('/x/apps/extension/src/a.ts', own)).toBe(own);
  });
});

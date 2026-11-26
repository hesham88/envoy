#!/usr/bin/env node
/* global console, process */
/**
 * Manifest V3 forbids remotely hosted code, and the Chrome Web Store rejects an extension whose
 * package even contains the URL of a remote script (rejection "Blue Argon", 26 Nov 2026: Firebase's
 * gtag.js, api.js and reCAPTCHA URLs in assets/src-*.js). This scans the built package and fails
 * the build if any remote script, module or WebAssembly URL, or a known script loader host, is left.
 *
 * Usage: node scripts/check-remote-code.mjs [dir=dist]   (runs after every extension build)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const RULES = [
  // Any absolute URL that names a script, module or WebAssembly file. A repository page whose
  // name ends in ".js" (github.com/<owner>/<name>.js) is a link, not code.
  [
    /https?:\/\/(?!github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?(?=[\s"'`)?#]|$))[^\s"'`)]+?\.(?:m?js|wasm)(?=[\s"'`)?#]|$)/g,
    'remote script or WebAssembly URL',
  ],
  // Script loaders and CDNs, however the path is built.
  [/https?:\/\/(?:[a-z0-9-]+\.)*(?:jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|googletagmanager\.com)\b/gi, 'CDN or tag-manager host'],
  [/https?:\/\/(?:www\.)?google\.com\/recaptcha\//gi, 'reCAPTCHA script'],
  [/https?:\/\/apis\.google\.com\/js\//gi, 'Google API loader'],
];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js|html|json|css)$/.test(name)) files.push(p);
  }
})(root);

const hits = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const [re, why] of RULES)
    for (const m of text.matchAll(re)) hits.push(`${relative(root, f)}: ${why}: ${m[0]}`);
}
if (hits.length) {
  console.error(`check-remote-code: FAIL ${hits.length} remote-code reference(s) in ${root}`);
  for (const h of [...new Set(hits)]) console.error(`  ${h}`);
  process.exit(1);
}
console.log(`check-remote-code: OK, ${files.length} files in ${relative(process.cwd(), root) || '.'}, no remote code`);

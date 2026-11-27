#!/usr/bin/env node
/**
 * Checks an Envoy signed privacy receipt (the "Save signed receipt" button under an answer):
 * the ECDSA P-256 signature over the receipt's canonical JSON, and each sent excerpt against its
 * SHA-256. Prints what left the device. Uses only Node's built-in WebCrypto.
 * Usage: node scripts/verify-receipt.mjs envoy-receipt-2026-11-27T....json
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/verify-receipt.mjs <receipt.json>');
  process.exit(2);
}
const r = JSON.parse(readFileSync(file, 'utf8'));
const canonical = (v) =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .sort()
          .filter((k) => v[k] !== undefined)
          .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
          .join(',')}}`
      : JSON.stringify(v);
const { subtle } = globalThis.crypto;
const key = await subtle.importKey(
  'jwk',
  r.publicKey,
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify'],
);
const sig = Buffer.from(r.signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const signed = await subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  key,
  sig,
  new TextEncoder().encode(canonical(r.body)),
);
const hex = async (t) =>
  Buffer.from(await subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('hex');
let hashes = true;
for (const s of r.body.sent) if ((await hex(s.text)) !== s.sha256) hashes = false;

const b = r.body;
console.log(
  `signature: ${signed ? 'valid' : 'INVALID'}; excerpt hashes: ${hashes ? 'match' : 'DO NOT MATCH'}`,
);
console.log(`issued ${b.issuedAt} by ${b.origin}, ${b.mode} mode`);
console.log(`steps: ${b.steps.map((s) => `${s.step} (${s.source})`).join(', ')}`);
console.log(
  `left this device: ${b.sent.length} request(s), ${b.sent.reduce((n, s) => n + s.chars, 0)} characters, tags ${b.tagsSent.join(' ') || 'none'}`,
);
console.log(
  `counted by the browser: ${b.aiRequestsCountedByBrowser ?? 'n/a'} AI request(s); blocked attempts: ${b.blockedAttempts}`,
);
for (const s of b.sent) console.log(`\n--- ${s.step}, ${s.chars} characters ---\n${s.text}`);
process.exit(signed && hashes ? 0 : 1);

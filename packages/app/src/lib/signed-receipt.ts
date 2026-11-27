/**
 * A signed privacy receipt you can keep and anyone can check: what left this device (the exact
 * excerpt, already tags, and its SHA-256), where each step ran, the browser's own count of
 * requests to the AI endpoint, and the guard's result. It never contains a raw private value.
 *
 * Signed in the browser with WebCrypto (ECDSA P-256, SHA-256). The private key is created for this
 * session, can't be exported, and never leaves memory; the public key travels in the receipt, so
 * changing any byte of it breaks the signature (scripts/verify-receipt.mjs checks one). It proves
 * the receipt wasn't edited after Envoy issued it; it doesn't identify a person (no accounts).
 */
import type { NetworkEntry } from '@envoy/ai';
import type { Receipt } from '@envoy/core';

export interface ReceiptBody {
  kind: 'envoy-privacy-receipt';
  version: 1;
  issuedAt: string;
  origin: string;
  mode: Receipt['mode'];
  steps: Receipt['steps'];
  /** Every request that left this device, as sent: tags only. */
  sent: { step: string; chars: number; sha256: string; text: string }[];
  blockedAttempts: number;
  aiRequestsCountedByBrowser: number | null;
  privateDetailsFound: Receipt['found'];
  privateDetailsKept: number;
  tagsSent: string[];
}

export interface SignedReceipt {
  body: ReceiptBody;
  algorithm: 'ECDSA P-256 / SHA-256';
  publicKey: JsonWebKey;
  /** base64url of the raw (r||s) signature over canonicalJson(body). */
  signature: string;
}

/** JSON with keys sorted at every level, so the signed bytes are the same everywhere. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let keyPair: Promise<CryptoKeyPair> | null = null;
const sessionKey = () =>
  (keyPair ??= crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ]) as Promise<CryptoKeyPair>);

export async function buildReceiptBody(args: {
  receipt: Receipt;
  network: readonly NetworkEntry[];
  aiRequests: number | null;
  origin?: string;
  now?: Date;
}): Promise<ReceiptBody> {
  const out = args.network.filter((e) => e.target === 'cloud' && e.direction !== 'in');
  return {
    kind: 'envoy-privacy-receipt',
    version: 1,
    issuedAt: (args.now ?? new Date()).toISOString(),
    origin: args.origin ?? globalThis.location?.origin ?? 'unknown',
    mode: args.receipt.mode,
    steps: args.receipt.steps,
    sent: await Promise.all(
      out
        .filter((e) => !e.blocked)
        .map(async (e) => ({
          step: String(e.step),
          chars: e.payload.length,
          sha256: await sha256Hex(e.payload),
          text: e.payload,
        })),
    ),
    blockedAttempts: out.filter((e) => e.blocked).length,
    aiRequestsCountedByBrowser: args.aiRequests,
    privateDetailsFound: args.receipt.found,
    privateDetailsKept: args.receipt.keptTotal,
    tagsSent: args.receipt.sharedTags,
  };
}

export async function signReceipt(body: ReceiptBody): Promise<SignedReceipt> {
  const { privateKey, publicKey } = await sessionKey();
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(canonicalJson(body)),
  );
  return {
    body,
    algorithm: 'ECDSA P-256 / SHA-256',
    publicKey: await crypto.subtle.exportKey('jwk', publicKey),
    signature: b64url(sig),
  };
}

export async function verifyReceipt(r: SignedReceipt): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      r.publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const bodyOk = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromB64url(r.signature),
      new TextEncoder().encode(canonicalJson(r.body)),
    );
    // Each excerpt must also match its own hash.
    const hashesOk = (
      await Promise.all(r.body.sent.map(async (s) => (await sha256Hex(s.text)) === s.sha256))
    ).every(Boolean);
    return bodyOk && hashesOk;
  } catch {
    return false;
  }
}

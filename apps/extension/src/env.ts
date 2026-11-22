import type { FirebaseEnv } from '@envoy/ai';

const str = (v: string | undefined): string => (typeof v === 'string' ? v.trim() : '');

// Only listed variables reach the bundle. The App Check debug token is included
// only in `extensiondev` builds (local unpacked use; dist/ is gitignored and
// must never be published). Release builds (`vite build`, default mode) drop it.
const BUILD_ENV = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as
    string | undefined,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  VITE_RECAPTCHA_SITE_KEY: import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined,
  VITE_CLOUD_MODEL: import.meta.env.VITE_CLOUD_MODEL as string | undefined,
  VITE_APPCHECK_DEBUG_TOKEN:
    import.meta.env.MODE === 'extensiondev'
      ? (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined)
      : undefined,
};

const REQUIRED: [keyof FirebaseEnv, string][] = [
  ['apiKey', 'VITE_FIREBASE_API_KEY'],
  ['authDomain', 'VITE_FIREBASE_AUTH_DOMAIN'],
  ['projectId', 'VITE_FIREBASE_PROJECT_ID'],
  ['appId', 'VITE_FIREBASE_APP_ID'],
  ['messagingSenderId', 'VITE_FIREBASE_MESSAGING_SENDER_ID'],
  ['storageBucket', 'VITE_FIREBASE_STORAGE_BUCKET'],
];

export function readFirebaseEnv(): FirebaseEnv {
  const missing = REQUIRED.filter(
    ([, name]) => !str(BUILD_ENV[name as keyof typeof BUILD_ENV]),
  ).map(([, name]) => name);
  if (missing.length) {
    throw new Error(
      `Missing Firebase settings: ${missing.join(', ')}. They are read from apps/web/.env.local at build time.`,
    );
  }
  const cfg = Object.fromEntries(
    REQUIRED.map(([key, name]) => [key, str(BUILD_ENV[name as keyof typeof BUILD_ENV])]),
  ) as unknown as FirebaseEnv;
  cfg.recaptchaSiteKey = str(BUILD_ENV.VITE_RECAPTCHA_SITE_KEY);
  const debug = str(BUILD_ENV.VITE_APPCHECK_DEBUG_TOKEN);
  if (debug) cfg.appCheckDebugToken = debug;
  return cfg;
}

export function cloudModelOverride(): string | undefined {
  return str(BUILD_ENV.VITE_CLOUD_MODEL) || undefined;
}

/** Unpacked (developer-mode) extensions have no update_url. */
export function isUnpacked(): boolean {
  try {
    return !chrome.runtime.getManifest().update_url;
  } catch {
    return false;
  }
}

/**
 * Cloud reasoning is enabled only in extensiondev (local unpacked) builds, where the
 * App Check debug token attests the panel. Release builds run on-device only and hand
 * cloud-routed questions to the hosted web app, which has real reCAPTCHA App Check.
 */
export const CLOUD_ENABLED = import.meta.env.MODE === 'extensiondev';
export const HOSTED_APP_URL = 'https://envoy-hybrid-ai.web.app';

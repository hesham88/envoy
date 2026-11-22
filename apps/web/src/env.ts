import type { FirebaseEnv } from '@envoy/ai';

type RawEnv = Record<string, string | boolean | undefined>;

const REQUIRED = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
} as const;

const str = (v: string | boolean | undefined): string => (typeof v === 'string' ? v.trim() : '');

/** Reads the Firebase config from Vite env vars; throws one error listing everything missing. */
export function readFirebaseEnv(env: RawEnv = import.meta.env): FirebaseEnv {
  const missing = Object.values(REQUIRED).filter((name) => !str(env[name]));
  if (missing.length) {
    throw new Error(`Missing Firebase settings: ${missing.join(', ')}. Copy apps/web/.env.example to .env.local.`);
  }
  const cfg: FirebaseEnv = {
    apiKey: str(env[REQUIRED.apiKey]),
    authDomain: str(env[REQUIRED.authDomain]),
    projectId: str(env[REQUIRED.projectId]),
    appId: str(env[REQUIRED.appId]),
    messagingSenderId: str(env[REQUIRED.messagingSenderId]),
    storageBucket: str(env[REQUIRED.storageBucket]),
    recaptchaSiteKey: str(env.VITE_RECAPTCHA_SITE_KEY),
  };
  const debugToken = str(env.VITE_APPCHECK_DEBUG_TOKEN);
  if (debugToken) cfg.appCheckDebugToken = debugToken;
  return cfg;
}

/** Optional local override of the cloud model (Remote Config wins otherwise). */
export function cloudModelOverride(env: RawEnv = import.meta.env): string | undefined {
  return str(env.VITE_CLOUD_MODEL) || undefined;
}

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';

export interface FirebaseEnv {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
  storageBucket: string;
  recaptchaSiteKey: string;
  /** Optional stable debug token for localhost; never committed. */
  appCheckDebugToken?: string;
}

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

/**
 * Starts Firebase with App Check (required by AI Logic) and returns the AI instance.
 * `dev` comes from the app (`import.meta.env.DEV`); only then is the App Check debug provider enabled.
 */
export function initEnvoy(
  cfg: FirebaseEnv,
  opts: { dev: boolean },
): { app: FirebaseApp; ai: AI; appCheck: AppCheck } {
  if (!cfg.recaptchaSiteKey && !opts.dev) {
    throw new Error(
      'Missing VITE_RECAPTCHA_SITE_KEY: App Check cannot start, and AI Logic requires it.',
    );
  }
  if (opts.dev) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = cfg.appCheckDebugToken || true;
  }
  const app = initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    appId: cfg.appId,
    messagingSenderId: cfg.messagingSenderId,
    storageBucket: cfg.storageBucket,
  });
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(cfg.recaptchaSiteKey || 'debug-only'),
    isTokenAutoRefreshEnabled: true,
  });
  const ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true });
  return { app, ai, appCheck };
}

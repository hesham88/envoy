import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  CustomProvider,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
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
/**
 * How App Check is set up:
 * - 'recaptcha' (web pages): reCAPTCHA Enterprise, which loads Google's script.
 * - 'no-script' (extension pages): extension pages may not load remote scripts (Manifest V3), so no
 *   reCAPTCHA. Development builds still reach the cloud with the debug token; release builds hand
 *   cloud questions to the hosted web app instead.
 * - 'none' (on-device-only contexts such as the extension's offscreen document): no App Check at all;
 *   ONLY_ON_DEVICE requests never need it.
 */
export type AppCheckMode = 'recaptcha' | 'no-script' | 'none';

export function initEnvoy(
  cfg: FirebaseEnv,
  opts: { dev: boolean; appCheck?: AppCheckMode },
): { app: FirebaseApp; ai: AI; appCheck: AppCheck | null } {
  const mode = opts.appCheck ?? 'recaptcha';
  if (mode === 'recaptcha' && !cfg.recaptchaSiteKey && !opts.dev) {
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
  const appCheck =
    mode === 'none'
      ? null
      : initializeAppCheck(app, {
          provider:
            mode === 'recaptcha'
              ? new ReCaptchaEnterpriseProvider(cfg.recaptchaSiteKey || 'debug-only')
              : new CustomProvider({
                  getToken: () =>
                    Promise.reject(new Error('App Check has no reCAPTCHA in extension pages.')),
                }),
          isTokenAutoRefreshEnabled: mode === 'recaptcha',
        });
  const ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true });
  return { app, ai, appCheck };
}

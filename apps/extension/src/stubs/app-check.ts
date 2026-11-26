/**
 * The release extension's stand-in for `firebase/app-check` (aliased in vite.config.ts; developer
 * builds keep the real module for the debug token). The release extension runs Firebase AI Logic on
 * the device only and hands cloud questions to the hosted web app, so it never needs an App Check
 * token. The real module carries the reCAPTCHA script loader, which Manifest V3 forbids and the
 * Chrome Web Store rejected (remotely hosted code, 26 Nov 2026).
 *
 * Inert on purpose: building a provider or "initializing" works, so the on-device chat starts; only
 * asking for a token fails, with a clear message, and nothing is ever loaded.
 */
export type AppCheck = { readonly app: unknown };

const NO_TOKEN = 'App Check is not available in the Envoy extension: cloud questions open the web app.';

export function initializeAppCheck(app: unknown): AppCheck {
  return { app };
}

export function getLimitedUseToken(): Promise<{ token: string }> {
  return Promise.reject(new Error(NO_TOKEN));
}

export function getToken(): Promise<{ token: string }> {
  return Promise.reject(new Error(NO_TOKEN));
}

export class ReCaptchaEnterpriseProvider {
  constructor(readonly siteKey?: string) {}
}

export class CustomProvider {
  constructor(readonly options?: unknown) {}
}

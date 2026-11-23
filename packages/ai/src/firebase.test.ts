import { afterEach, describe, expect, it, vi } from 'vitest';

const initializeApp = vi.fn((_c: unknown) => ({ name: 'app' }));
const initializeAppCheck = vi.fn();
const getAI = vi.fn((..._a: unknown[]) => ({ ai: true }));
const Provider = vi.fn();

vi.mock('firebase/app', () => ({ initializeApp: (c: unknown) => initializeApp(c) }));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: (...a: unknown[]) => initializeAppCheck(...a),
  ReCaptchaEnterpriseProvider: class {
    constructor(key: string) {
      Provider(key);
    }
  },
  CustomProvider: class {},
}));
vi.mock('firebase/ai', async (orig) => ({
  ...(await orig<typeof import('firebase/ai')>()),
  getAI: (...a: unknown[]) => getAI(...a),
}));

const { initEnvoy } = await import('./firebase');

const cfg = {
  apiKey: 'k',
  authDomain: 'd',
  projectId: 'envoy-hybrid-ai',
  appId: 'a',
  messagingSenderId: 'm',
  storageBucket: 's',
  recaptchaSiteKey: 'site-key',
};

afterEach(() => {
  delete (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN;
  vi.clearAllMocks();
});

describe('initEnvoy', () => {
  it("in on-device-only extension pages ('none'), starts no App Check and so loads no reCAPTCHA script", () => {
    const out = initEnvoy({ ...cfg, recaptchaSiteKey: '' }, { dev: false, appCheck: 'none' });
    expect(initializeAppCheck).not.toHaveBeenCalled();
    expect(Provider).not.toHaveBeenCalled();
    expect(out.appCheck).toBeNull();
  });

  it("in extension pages ('no-script'), never uses the reCAPTCHA provider", () => {
    initEnvoy({ ...cfg, recaptchaSiteKey: '' }, { dev: true, appCheck: 'no-script' });
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(Provider).not.toHaveBeenCalled();
  });

  it('turns on App Check with reCAPTCHA Enterprise before creating the AI instance', () => {
    initEnvoy(cfg, { dev: false });
    expect(Provider).toHaveBeenCalledWith('site-key');
    expect(initializeAppCheck).toHaveBeenCalledWith(
      { name: 'app' },
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    );
    expect(initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(
      getAI.mock.invocationCallOrder[0]!,
    );
  });

  it('asks AI Logic for limited-use App Check tokens (replay protection)', () => {
    initEnvoy(cfg, { dev: false });
    expect(getAI).toHaveBeenCalledWith(
      { name: 'app' },
      expect.objectContaining({ useLimitedUseAppCheckTokens: true }),
    );
  });

  it('sets the debug token only in development', () => {
    initEnvoy(cfg, { dev: false });
    expect(
      (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN,
    ).toBeUndefined();
    initEnvoy(cfg, { dev: true });
    expect(
      (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN,
    ).toBe(true);
    initEnvoy({ ...cfg, appCheckDebugToken: 'stable-token' }, { dev: true });
    expect(
      (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN,
    ).toBe('stable-token');
  });

  it('refuses to start without a reCAPTCHA site key outside development', () => {
    expect(() => initEnvoy({ ...cfg, recaptchaSiteKey: '' }, { dev: false })).toThrow(
      /VITE_RECAPTCHA_SITE_KEY/,
    );
  });
});

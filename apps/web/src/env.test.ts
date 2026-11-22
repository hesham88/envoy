import { describe, expect, it } from 'vitest';
import { readFirebaseEnv } from './env';

const full = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'd',
  VITE_FIREBASE_PROJECT_ID: 'p',
  VITE_FIREBASE_APP_ID: 'a',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'm',
  VITE_FIREBASE_STORAGE_BUCKET: 's',
  VITE_RECAPTCHA_SITE_KEY: 'r',
};

describe('readFirebaseEnv', () => {
  it('maps VITE_* values to the Firebase config', () => {
    expect(readFirebaseEnv(full)).toMatchObject({
      apiKey: 'k',
      projectId: 'p',
      recaptchaSiteKey: 'r',
    });
  });

  it('names every missing required variable in one readable error', () => {
    expect(() =>
      readFirebaseEnv({ ...full, VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_APP_ID: undefined }),
    ).toThrow(/VITE_FIREBASE_API_KEY.*VITE_FIREBASE_APP_ID/);
  });

  it('treats the reCAPTCHA key and debug token as optional here (initEnvoy enforces the key in production)', () => {
    const { VITE_RECAPTCHA_SITE_KEY: _drop, ...rest } = full;
    expect(readFirebaseEnv(rest).recaptchaSiteKey).toBe('');
  });
});

describe('review fix I2: debug token', () => {
  it('never returns the App Check debug token outside development', () => {
    expect(
      readFirebaseEnv({ ...full, VITE_APPCHECK_DEBUG_TOKEN: 'secret' }, { dev: false })
        .appCheckDebugToken,
    ).toBeUndefined();
    expect(
      readFirebaseEnv({ ...full, VITE_APPCHECK_DEBUG_TOKEN: 'secret' }, { dev: true })
        .appCheckDebugToken,
    ).toBe('secret');
  });
});

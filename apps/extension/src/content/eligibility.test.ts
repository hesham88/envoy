// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isEnvoyField, type FieldLike } from './eligibility';

const base: FieldLike = { tagName: 'INPUT', type: 'text' };

describe('isEnvoyField never-list', () => {
  it('rejects password, OTP and payment fields', () => {
    expect(isEnvoyField({ ...base, type: 'password' })).toBe(false);
    expect(isEnvoyField({ ...base, autocomplete: 'one-time-code' })).toBe(false);
    expect(isEnvoyField({ ...base, autocomplete: 'cc-number' })).toBe(false);
    expect(isEnvoyField({ ...base, name: 'card_cvc' })).toBe(false);
    expect(isEnvoyField({ ...base, inputMode: 'numeric', maxLength: 6 })).toBe(false);
  });

  it('accepts the text field kinds Envoy targets', () => {
    for (const type of ['text', 'search', 'email', 'url', 'tel']) expect(isEnvoyField({ ...base, type })).toBe(true);
    expect(isEnvoyField({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEnvoyField({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('rejects file inputs and editor hosts containing iframes (payment embeds)', () => {
    expect(isEnvoyField({ ...base, type: 'file' })).toBe(false);
    expect(isEnvoyField({ tagName: 'DIV', isContentEditable: true, ownerIframes: 1 })).toBe(false);
  });
});

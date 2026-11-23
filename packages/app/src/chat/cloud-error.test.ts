import { describe, expect, it } from 'vitest';
import { cloudErrorMessage } from './ChatApp';

describe('cloudErrorMessage', () => {
  it('turns a quota error into something a person can act on', () => {
    const msg = cloudErrorMessage(
      new Error('[429 Too Many Requests] RESOURCE_EXHAUSTED: Quota exceeded for metric'),
    );
    expect(msg).toMatch(/usage limit/);
    expect(msg).toMatch(/switch the cloud model/);
  });

  it('explains a network failure', () => {
    expect(cloudErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Couldn't reach the cloud/);
  });

  it('keeps other messages as they are', () => {
    expect(cloudErrorMessage(new Error('Something else'))).toBe('Something else');
    expect(cloudErrorMessage(new Error('Order 4290 shipped'))).toBe('Order 4290 shipped');
  });
});

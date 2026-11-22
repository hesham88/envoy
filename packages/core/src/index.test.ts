import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

describe('@envoy/core', () => {
  it('exposes its version', () => {
    expect(VERSION).toBe('0.1.0');
  });
});

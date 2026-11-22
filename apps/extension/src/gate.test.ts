import { describe, expect, it } from 'vitest';
import { gateState } from './gate';

describe('gateState', () => {
  it('is ready only when the model is available', () => {
    expect(gateState('available')).toMatchObject({ ready: true, showEnable: false });
    expect(gateState('downloadable').ready).toBe(false);
    expect(gateState('no-api').ready).toBe(false);
  });

  it('offers Enable and fix hints while the model is downloadable', () => {
    expect(gateState('downloadable')).toMatchObject({ showEnable: true, showFixHints: true });
    expect(gateState('unavailable').showEnable).toBe(false);
  });
});

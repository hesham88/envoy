import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppCheck } from 'firebase/app-check';

const getLimitedUseToken = vi.fn();
vi.mock('firebase/app-check', () => ({ getLimitedUseToken }));
const { diagnoseCloud } = await import('./cloud-check');

const appCheck = {} as AppCheck;

describe('diagnoseCloud', () => {
  beforeEach(() => getLimitedUseToken.mockReset());

  it('offline comes first, without asking App Check', async () => {
    const p = await diagnoseCloud(appCheck, false);
    expect(p.kind).toBe('offline');
    expect(getLimitedUseToken).not.toHaveBeenCalled();
  });

  it('names App Check when it rejects the browser (403, then throttled)', async () => {
    getLimitedUseToken.mockRejectedValueOnce(
      Object.assign(new Error('AppCheck: 403 error. Attempts allowed again after 01d:00m:00s'), {
        code: 'appCheck/initial-throttle',
      }),
    );
    const p = await diagnoseCloud(appCheck, true);
    expect(p.kind).toBe('app-check');
    expect(p.message).toMatch(/App Check didn't accept this browser/);
    expect(p.message).toMatch(/ordinary Chrome window/);
  });

  it('blames the model when App Check is fine', async () => {
    getLimitedUseToken.mockResolvedValueOnce({ token: 't' });
    const p = await diagnoseCloud(appCheck, true);
    expect(p.kind).toBe('model');
  });
});

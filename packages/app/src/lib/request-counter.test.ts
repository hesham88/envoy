import { afterEach, describe, expect, it, vi } from 'vitest';
import { _resetRequestCounter, aiRequestsSince } from './request-counter';

describe('browser-measured AI requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetRequestCounter();
  });

  it('counts only requests to the Firebase AI Logic endpoint, and only since the question', () => {
    let deliver: (entries: { name: string; startTime: number }[]) => void = () => {};
    class FakeObserver {
      constructor(cb: (list: { getEntries: () => unknown[] }) => void) {
        deliver = (entries) => cb({ getEntries: () => entries });
      }
      observe() {}
    }
    vi.stubGlobal('PerformanceObserver', FakeObserver);
    const origin = performance.timeOrigin;
    expect(aiRequestsSince(origin + 1000)).toBe(0);
    deliver([
      { name: 'https://firebasevertexai.googleapis.com/v1beta/projects/x:generateContent', startTime: 500 },
      { name: 'https://content-firebaseappcheck.googleapis.com/v1/x:exchange', startTime: 1500 },
      { name: 'https://envoy-hybrid-ai.web.app/assets/app.js', startTime: 1600 },
      { name: 'https://firebasevertexai.googleapis.com/v1beta/projects/x:generateContent', startTime: 2000 },
    ]);
    // The one before the question doesn't count; App Check and the app's own files aren't the AI endpoint.
    expect(aiRequestsSince(origin + 1000)).toBe(1);
  });

  it('says it cannot count where the browser has no PerformanceObserver', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    expect(aiRequestsSince(0)).toBeNull();
  });
});

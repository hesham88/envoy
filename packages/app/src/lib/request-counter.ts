/**
 * Requests to the Firebase AI Logic endpoint, counted by the browser itself (Resource Timing via
 * PerformanceObserver), not by Envoy's own log. It is independent evidence: during the private steps
 * the count stays at 0, and it reaches 1 only when you approve the excerpt.
 */
import { useSyncExternalStore } from 'react';

const AI_HOST = 'firebasevertexai.googleapis.com';
const seen: number[] = []; // epoch ms of each request to the AI endpoint
const listeners = new Set<() => void>();
let started = false;
let version = 0;

function start() {
  if (started || typeof PerformanceObserver === 'undefined') return;
  started = true;
  try {
    const po = new PerformanceObserver((list) => {
      let changed = false;
      for (const e of list.getEntries()) {
        try {
          if (new URL(e.name).host === AI_HOST) {
            seen.push(performance.timeOrigin + e.startTime);
            changed = true;
          }
        } catch {
          // not a URL (never for resource entries)
        }
      }
      if (changed) {
        version++;
        for (const l of listeners) l();
      }
    });
    po.observe({ type: 'resource', buffered: true });
  } catch {
    started = false;
  }
}

/** How many AI-endpoint requests the browser saw since `since` (epoch ms); null if it can't count. */
export function aiRequestsSince(since: number): number | null {
  if (typeof PerformanceObserver === 'undefined') return null;
  start();
  return seen.filter((t) => t >= since - 5).length;
}

export function useAiRequestCount(since: number | undefined): number | null {
  useSyncExternalStore(
    (cb) => {
      start();
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => 0,
  );
  return since === undefined ? null : aiRequestsSince(since);
}

/** For tests. */
export function _resetRequestCounter() {
  seen.length = 0;
  started = false;
  version++;
}

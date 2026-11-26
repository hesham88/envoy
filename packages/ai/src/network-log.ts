import type { Step } from '@envoy/core';

/** One AI request (or blocked attempt), shown in the Network inspector as proof of what left the device. */
export interface NetworkEntry {
  at: number;
  step: Step | 'tripwire';
  target: 'device' | 'cloud';
  blocked: boolean;
  /** The exact text sent (or attempted), or for `direction: 'in'` the reply. Memory only. */
  payload: string;
  /** 'in' is the cloud's reply coming back; absent means outbound. */
  direction?: 'out' | 'in';
  /** The model refused this request (quota, busy), so another model was asked. */
  refused?: boolean;
}

type Listener = (entries: readonly NetworkEntry[]) => void;

const entries: NetworkEntry[] = [];
const listeners = new Set<Listener>();

export const networkLog = {
  get entries(): readonly NetworkEntry[] {
    return entries;
  },
  record(entry: NetworkEntry): void {
    entries.push(entry);
    for (const fn of listeners) fn(entries);
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  clear(): void {
    entries.length = 0;
    for (const fn of listeners) fn(entries);
  },
};

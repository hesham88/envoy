import type { Step } from '@envoy/core';

/** One AI request (or blocked attempt), shown in the Network inspector as proof of what left the device. */
export interface NetworkEntry {
  at: number;
  step: Step | 'tripwire';
  target: 'device' | 'cloud';
  blocked: boolean;
  /** The exact text sent (or attempted). Kept in memory only. */
  payload: string;
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

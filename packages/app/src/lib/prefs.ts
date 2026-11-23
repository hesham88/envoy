/**
 * Small preferences kept in this browser (localStorage): settings, never content. Reads and writes
 * never throw: in a private window or with storage blocked, the default is used and nothing persists.
 */
import { useCallback, useState } from 'react';

export const PREF_KEYS = {
  /** 'fast' | 'capable': the cloud model the person chose (overrides Remote Config's default). */
  cloudModel: 'envoy.pref.cloudModel',
  /** 'on' | 'off': whether answered chats are saved, encrypted, on this device. Off by default. */
  keepHistory: 'envoy.pref.keepHistory',
} as const;

export function readPref<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice lasts for this tab only */
  }
}

/** A preference as React state, saved on every change. `null` means "not chosen yet". */
export function usePref<T extends string>(
  key: string,
  allowed: readonly T[],
): [T | null, (v: T | null) => void] {
  const [value, setValue] = useState<T | null>(() => readPref(key, allowed));
  const set = useCallback(
    (v: T | null) => {
      writePref(key, v);
      setValue(v);
    },
    [key],
  );
  return [value, set];
}

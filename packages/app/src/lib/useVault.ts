/** The chat's encrypted history, backed by the vault (IndexedDB + WebCrypto). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { indexedDbStore, Vault, VaultLockedError, type IndexEntry } from './vault';

export type VaultState = 'opening' | 'ready' | 'locked' | 'unavailable';

export interface VaultApi {
  state: VaultState;
  entries: IndexEntry[];
  hasPasscode: boolean;
  save(id: string, title: string, value: unknown): Promise<void>;
  load<T>(id: string): Promise<T | null>;
  remove(id: string): Promise<void>;
  unlock(passcode: string): Promise<void>;
  setPasscode(passcode: string): Promise<void>;
  lock(): void;
  destroyAll(): Promise<void>;
}

export function useVault(): VaultApi {
  const vault = useRef<Vault | null>(null);
  const [state, setState] = useState<VaultState>('opening');
  const [entries, setEntries] = useState<IndexEntry[]>([]);
  const [hasPasscode, setHasPasscode] = useState(false);

  const refresh = useCallback(async () => {
    const v = vault.current;
    if (v?.unlocked) setEntries((await v.index()).filter((e) => !e.id.startsWith('_')));
  }, []);

  useEffect(() => {
    if (typeof indexedDB === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) {
      setState('unavailable');
      return;
    }
    const v = new Vault(indexedDbStore());
    vault.current = v;
    void (async () => {
      try {
        setHasPasscode(await v.hasPasscode());
        await v.open();
        setState('ready');
        await refresh();
      } catch (e) {
        setState(e instanceof VaultLockedError ? 'locked' : 'unavailable');
      }
    })();
  }, [refresh]);

  const need = () => {
    if (!vault.current?.unlocked) throw new VaultLockedError();
    return vault.current;
  };

  return {
    state,
    entries,
    hasPasscode,
    save: async (id, title, value) => {
      if (!vault.current?.unlocked) return; // locked or unavailable: nothing is written
      await vault.current.put(id, title, value);
      await refresh();
    },
    load: async (id) => need().get(id),
    remove: async (id) => {
      await need().remove(id);
      await refresh();
    },
    unlock: async (passcode) => {
      await vault.current?.open(passcode);
      setState('ready');
      await refresh();
    },
    setPasscode: async (passcode) => {
      await need().setPasscode(passcode);
      setHasPasscode(true);
    },
    lock: () => {
      vault.current?.lock();
      setEntries([]);
      setState(hasPasscode ? 'locked' : 'ready');
      if (!hasPasscode) void vault.current?.open().then(refresh);
    },
    destroyAll: async () => {
      await vault.current?.destroy();
      setEntries([]);
      setHasPasscode(false);
      await vault.current?.open();
      setState('ready');
    },
  };
}

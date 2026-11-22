// Minimal Chrome extension typings used by the side panel (avoids a @types/chrome dependency).
declare namespace chrome {
  namespace runtime {
    function getManifest(): { update_url?: string };
  }
  namespace storage {
    interface StorageArea {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
    }
    const session: StorageArea;
  }
}

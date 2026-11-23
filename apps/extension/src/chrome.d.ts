// Minimal Chrome extension typings used by Envoy (avoids a @types/chrome dependency).
declare namespace chrome {
  namespace runtime {
    function getManifest(): { update_url?: string };
    function sendMessage(msg: unknown): Promise<unknown>;
    const onMessage: {
      addListener(
        fn: (msg: never, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void,
      ): void;
    };
  }
  namespace storage {
    interface StorageArea {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
    }
    const session: StorageArea;
    const local: StorageArea;
    const onChanged: {
      addListener(fn: (changes: Record<string, unknown>, area: string) => void): void;
      removeListener(fn: (changes: Record<string, unknown>, area: string) => void): void;
    };
  }
  namespace permissions {
    function request(p: { origins: string[] }, cb?: (granted: boolean) => void): void;
  }
  namespace tabs {
    function query(q: {
      active: boolean;
      currentWindow: boolean;
    }): Promise<{ id?: number; windowId?: number; url?: string }[]>;
  }
  namespace sidePanel {
    function open(o: { windowId: number }): Promise<void>;
  }
  namespace scripting {
    function executeScript<T>(o: {
      target: { tabId: number };
      files?: string[];
      func?: () => T;
    }): Promise<{ result?: T }[]>;
  }
}

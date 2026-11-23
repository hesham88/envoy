/**
 * The vault: Envoy's encrypted storage on this device. Everything Envoy keeps (chat history with its
 * documents, answers and the real values behind tags; your own rules) is encrypted here with
 * WebCrypto before it touches storage, and decrypted here when it's read. Nothing is ever sent.
 *
 * - Data key: AES-GCM 256, generated on this device. By default it's created non-extractable, so
 *   scripts can use it but never read its bytes.
 * - Every record gets a fresh random 96-bit IV; GCM detects any change to the stored bytes.
 * - Optional passcode: the data key is then wrapped (AES-KW) with a key derived from the passcode
 *   (PBKDF2-SHA-256, 600,000 iterations, random salt). Without the passcode the stored data can't
 *   be read, even by someone who copies the browser profile.
 * - The index of records (ids and titles) is itself an encrypted record.
 */

export interface VaultStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

interface KeyRecord {
  /** A non-extractable CryptoKey (device mode), or the wrapped key bytes (passcode mode). */
  key?: CryptoKey;
  wrapped?: ArrayBuffer;
  salt?: Uint8Array<ArrayBuffer>;
  iterations?: number;
}

export interface IndexEntry {
  id: string;
  title: string;
  updatedAt: number;
}

const KEY_ID = 'key';
const INDEX_ID = 'index';
const ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export class VaultLockedError extends Error {
  constructor() {
    super('The vault is locked. Enter your passcode.');
    this.name = 'VaultLockedError';
  }
}

async function passcodeKey(
  passcode: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

export class Vault {
  private key: CryptoKey | null = null;

  constructor(private readonly store: VaultStore) {}

  /** Whether a passcode protects this vault. */
  async hasPasscode(): Promise<boolean> {
    const rec = (await this.store.get(KEY_ID)) as KeyRecord | undefined;
    return !!rec?.wrapped;
  }

  get unlocked(): boolean {
    return this.key !== null;
  }

  /** Opens the vault: creates the device key the first time; with a passcode vault, needs the passcode. */
  async open(passcode?: string): Promise<void> {
    const rec = (await this.store.get(KEY_ID)) as KeyRecord | undefined;
    if (!rec) {
      this.key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]);
      await this.store.set(KEY_ID, { key: this.key } satisfies KeyRecord);
      return;
    }
    if (rec.key) {
      this.key = rec.key;
      return;
    }
    if (!passcode) throw new VaultLockedError();
    const kek = await passcodeKey(passcode, rec.salt!, rec.iterations ?? ITERATIONS);
    try {
      this.key = await crypto.subtle.unwrapKey(
        'raw',
        rec.wrapped!,
        kek,
        'AES-KW',
        'AES-GCM',
        false,
        ['encrypt', 'decrypt'],
      );
    } catch {
      throw new Error('That passcode is not right.');
    }
  }

  /**
   * Protects the vault with a passcode. The existing records are re-encrypted with a new data key,
   * which is stored only wrapped by the passcode key.
   */
  async setPasscode(passcode: string): Promise<void> {
    if (passcode.length < 6) throw new Error('Use at least 6 characters.');
    const records = await this.readAll();
    const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek = await passcodeKey(passcode, salt, ITERATIONS);
    const wrapped = await crypto.subtle.wrapKey('raw', dataKey, kek, 'AES-KW');
    // From here on the key is only used through a non-extractable copy.
    this.key = await crypto.subtle.unwrapKey('raw', wrapped, kek, 'AES-KW', 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
    await this.store.set(KEY_ID, { wrapped, salt, iterations: ITERATIONS } satisfies KeyRecord);
    // The old index was sealed with the old key: drop it, then rewrite every record (and a new
    // index) under the new key.
    await this.store.delete(INDEX_ID);
    await this.writeAll(records);
  }

  /** Forgets the key in memory (passcode vaults then need the passcode again). */
  lock(): void {
    this.key = null;
  }

  private requireKey(): CryptoKey {
    if (!this.key) throw new VaultLockedError();
    return this.key;
  }

  private async seal(value: unknown): Promise<Sealed> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.requireKey(),
      enc.encode(JSON.stringify(value)),
    );
    return { iv, data };
  }

  private async open_<T>(sealed: Sealed): Promise<T> {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.iv },
      this.requireKey(),
      sealed.data,
    );
    return JSON.parse(dec.decode(plain)) as T;
  }

  async get<T>(id: string): Promise<T | null> {
    const sealed = (await this.store.get(`r:${id}`)) as Sealed | undefined;
    return sealed ? this.open_<T>(sealed) : null;
  }

  async put(id: string, title: string, value: unknown): Promise<void> {
    await this.store.set(`r:${id}`, await this.seal(value));
    const index = (await this.index()).filter((e) => e.id !== id);
    index.unshift({ id, title, updatedAt: Date.now() });
    await this.store.set(INDEX_ID, await this.seal(index));
  }

  async remove(id: string): Promise<void> {
    await this.store.delete(`r:${id}`);
    const index = (await this.index()).filter((e) => e.id !== id);
    await this.store.set(INDEX_ID, await this.seal(index));
  }

  /** Ids and titles, newest first (decrypted). */
  async index(): Promise<IndexEntry[]> {
    const sealed = (await this.store.get(INDEX_ID)) as Sealed | undefined;
    return sealed ? this.open_<IndexEntry[]>(sealed) : [];
  }

  /** Deletes everything, the key included. */
  async destroy(): Promise<void> {
    await this.store.clear();
    this.key = null;
  }

  private async readAll(): Promise<{ id: string; title: string; value: unknown }[]> {
    if (!this.key) return [];
    const out = [];
    for (const e of await this.index())
      out.push({ id: e.id, title: e.title, value: await this.get(e.id) });
    return out;
  }

  private async writeAll(records: { id: string; title: string; value: unknown }[]): Promise<void> {
    for (const r of [...records].reverse()) await this.put(r.id, r.title, r.value);
  }
}

/** IndexedDB storage: structured clone keeps CryptoKey objects (non-extractable stays non-extractable). */
export function indexedDbStore(name = 'envoy-vault'): VaultStore {
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    db.then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const req = fn(d.transaction('kv', mode).objectStore('kv'));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }),
    );
  return {
    get: (k) => run('readonly', (s) => s.get(k)),
    set: (k, v) => run('readwrite', (s) => s.put(v, k)).then(() => undefined),
    delete: (k) => run('readwrite', (s) => s.delete(k)).then(() => undefined),
    keys: () => run('readonly', (s) => s.getAllKeys()).then((ks) => ks.map(String)),
    clear: () => run('readwrite', (s) => s.clear()).then(() => undefined),
  };
}

/** In-memory storage, for tests and for browsers without IndexedDB (nothing persists). */
export function memoryStore(): VaultStore & { raw: Map<string, unknown> } {
  const raw = new Map<string, unknown>();
  return {
    raw,
    get: async (k) => raw.get(k),
    set: async (k, v) => void raw.set(k, v),
    delete: async (k) => void raw.delete(k),
    keys: async () => [...raw.keys()],
    clear: async () => raw.clear(),
  };
}

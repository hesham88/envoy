// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { memoryStore, Vault, VaultLockedError } from './vault';

const latin1 = (b: ArrayBuffer) => new TextDecoder('latin1').decode(b);

const chat = {
  question: 'Can my landlord raise the rent?',
  doc: 'Karim Fathy, national ID 27506120104839, rent EGP 8,500.',
};

describe('Vault', () => {
  it('stores only ciphertext: no plaintext reaches storage, and reading it back decrypts', async () => {
    const store = memoryStore();
    const v = new Vault(store);
    await v.open();
    await v.put('c1', 'Rent question', chat);
    const dump = JSON.stringify(
      [...store.raw.values()].map((x) =>
        x && typeof x === 'object' && 'data' in x
          ? latin1((x as { data: ArrayBuffer }).data)
          : String(x),
      ),
    );
    for (const secret of ['Karim Fathy', '27506120104839', 'Rent question', 'landlord'])
      expect(dump).not.toContain(secret);
    expect(await v.get('c1')).toEqual(chat);
    expect((await v.index()).map((e) => e.title)).toEqual(['Rent question']);
  });

  it('uses a non-extractable key and a fresh IV per record', async () => {
    const store = memoryStore();
    const v = new Vault(store);
    await v.open();
    const key = (store.raw.get('key') as { key: CryptoKey }).key;
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    await v.put('a', 'A', chat);
    const iv1 = (store.raw.get('r:a') as { iv: Uint8Array }).iv;
    await v.put('a', 'A', chat);
    const iv2 = (store.raw.get('r:a') as { iv: Uint8Array }).iv;
    expect(Array.from(iv1).join()).not.toBe(Array.from(iv2).join());
  });

  it('detects tampering with stored bytes', async () => {
    const store = memoryStore();
    const v = new Vault(store);
    await v.open();
    await v.put('a', 'A', chat);
    const sealed = store.raw.get('r:a') as { data: ArrayBuffer };
    const bytes = new Uint8Array(sealed.data);
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    await expect(v.get('a')).rejects.toThrow();
  });

  it('with a passcode, the data can only be opened with the passcode', async () => {
    const store = memoryStore();
    const v = new Vault(store);
    await v.open();
    await v.put('a', 'A', chat);
    await v.setPasscode('correct horse');
    expect(await v.hasPasscode()).toBe(true);
    expect((store.raw.get('key') as { key?: CryptoKey }).key).toBeUndefined(); // only the wrapped key is stored

    const again = new Vault(store);
    await expect(again.open()).rejects.toBeInstanceOf(VaultLockedError);
    await expect(again.open('wrong passcode')).rejects.toThrow('not right');
    await again.open('correct horse');
    expect(await again.get('a')).toEqual(chat);
    again.lock();
    await expect(again.get('a')).rejects.toBeInstanceOf(VaultLockedError);
  });

  it('destroy removes everything, the key included', async () => {
    const store = memoryStore();
    const v = new Vault(store);
    await v.open();
    await v.put('a', 'A', chat);
    await v.destroy();
    expect(store.raw.size).toBe(0);
  });
});

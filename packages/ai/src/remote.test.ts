import { describe, expect, it, vi } from 'vitest';

const fetchAndActivate = vi.fn();
const getValue = vi.fn();
vi.mock('firebase/remote-config', () => ({
  getRemoteConfig: () => ({ settings: {}, defaultConfig: {} }),
  fetchAndActivate: (...a: unknown[]) => fetchAndActivate(...a),
  getValue: (_rc: unknown, key: string) => getValue(key),
}));

const { loadRemoteSettings, DEFAULT_SETTINGS } = await import('./remote');
const app = {} as never;

describe('loadRemoteSettings', () => {
  it('returns the remote values when the fetch works', async () => {
    fetchAndActivate.mockResolvedValueOnce(true);
    getValue.mockImplementation((key: string) => ({
      asString: () =>
        key === 'cloud_model'
          ? 'gemini-4-hydrogen'
          : key === 'cloud_model_fast'
            ? 'gemini-3.5-flash-lite'
            : 'v2',
    }));
    await expect(loadRemoteSettings(app)).resolves.toEqual({
      cloudModel: 'gemini-4-hydrogen',
      fastCloudModel: 'gemini-3.5-flash-lite',
      cloudDefault: 'fast',
      promptVersion: 'v2',
    });
  });

  it('falls back to the defaults when the fetch fails (offline, blocked)', async () => {
    fetchAndActivate.mockRejectedValueOnce(new Error('offline'));
    await expect(loadRemoteSettings(app)).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the default model when the remote value is empty', async () => {
    fetchAndActivate.mockResolvedValueOnce(true);
    getValue.mockImplementation(() => ({ asString: () => '' }));
    await expect(loadRemoteSettings(app)).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('switches the default to the capable model only when cloud_default says so', async () => {
    fetchAndActivate.mockResolvedValueOnce(true);
    getValue.mockImplementation((key: string) => ({
      asString: () => (key === 'cloud_default' ? 'capable' : ''),
    }));
    await expect(loadRemoteSettings(app)).resolves.toMatchObject({ cloudDefault: 'capable' });
  });

  it('defaults to Hydrogen as the capable model, Flash-Lite as fast, and fast first', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      cloudModel: 'gemini-4-hydrogen',
      fastCloudModel: 'gemini-3.5-flash-lite',
      cloudDefault: 'fast',
      promptVersion: 'v1',
    });
  });
});

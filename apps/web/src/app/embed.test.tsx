import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXTENSION_ORIGIN, useExtensionBridge } from './embed';

const send = (data: unknown, origin: string) =>
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: window.parent }));
  });

afterEach(() => vi.restoreAllMocks());

describe('extension embed bridge', () => {
  it('says ready to the extension, and takes a document and rules only from it', async () => {
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const { result } = renderHook(() => useExtensionBridge());
    expect(post).toHaveBeenCalledWith({ type: 'envoy:ready' }, EXTENSION_ORIGIN);

    send(
      { type: 'envoy:doc', title: 'Selected text', text: 'Mona Adel pays EGP 8,500.' },
      'https://evil.example',
    );
    expect(result.current.doc).toBeNull();

    send(
      { type: 'envoy:doc', title: 'Selected text', text: 'Mona Adel pays EGP 8,500.' },
      EXTENSION_ORIGIN,
    );
    expect(result.current.doc).toEqual({
      title: 'Selected text',
      text: 'Mona Adel pays EGP 8,500.',
      source: 'paste',
    });

    send(
      {
        type: 'envoy:rules',
        rules: [
          { label: 'PROJECT', terms: ['Falcon'] },
          { label: 'bad label', terms: ['x'] },
          'junk',
        ],
      },
      EXTENSION_ORIGIN,
    );
    expect(await result.current.rulesStore.load()).toEqual([
      { label: 'PROJECT', terms: ['Falcon'] },
    ]);

    await result.current.rulesStore.save([{ label: 'CLIENT', terms: ['Acme'] }]);
    expect(post).toHaveBeenLastCalledWith(
      { type: 'envoy:save-rules', rules: [{ label: 'CLIENT', terms: ['Acme'] }] },
      EXTENSION_ORIGIN,
    );
  });
});

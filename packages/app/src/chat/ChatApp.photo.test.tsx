import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { networkLog, type Deps } from '@envoy/ai';
import type { EnvoyRuntime } from '../app/useEnvoy';

const word = (text: string, line: number, x0: number) => ({
  text,
  line,
  bbox: { x0, y0: line * 30, x1: x0 + text.length * 10, y1: line * 30 + 20 },
});
const recognizeImage = vi.fn(async () => ({
  words: [
    word('Patient', 0, 10),
    word('Adel', 0, 100),
    word('Mansour', 0, 150),
    word('MRN:', 1, 10),
    word('4471-2093-88', 1, 60),
  ],
  barcodes: [],
  width: 800,
  height: 600,
}));
vi.mock('../lib/ocr', () => ({ recognizeImage }));
const { ChatApp } = await import('./ChatApp');

const runtime = {
  status: 'no-api',
  progress: null,
  settings: {
    cloudModel: 'gemini-3.8-flash',
    fastCloudModel: 'gemini-3.5-flash-lite',
    cloudDefault: 'fast',
    promptVersion: 'v1',
  },
  deps: {
    runPrivate: vi.fn(),
    models: { reason: { generateContent: vi.fn() } },
    getDeviceStatus: async () => 'no-api',
  } as unknown as Deps,
  configError: null,
  enablePrivateMode: vi.fn(),
  refreshStatus: vi.fn(async () => undefined),
} as EnvoyRuntime;

beforeEach(() => {
  networkLog.clear();
  vi.stubGlobal('createImageBitmap', async () => ({ width: 800, height: 600, close: () => {} }));
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('min-width: 1280px'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('ChatApp photos', () => {
  it('reads a photo on the device: its text becomes the document, the photo shows boxed', async () => {
    const user = userEvent.setup();
    const { container } = render(<ChatApp runtime={runtime} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'bill.webp', { type: 'image/webp' }));
    await waitFor(() => expect(recognizeImage).toHaveBeenCalledOnce());
    expect(await screen.findByText('bill.webp')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Your photo, with 2 private details boxed on this device/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/can't read text in images/)).toBeNull();
  });

  it('the sample photo of the lab bill is one click away', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['x'], { type: 'image/webp' }))),
    );
    render(<ChatApp runtime={runtime} />);
    await user.click(screen.getByRole('button', { name: 'Try a photo of this bill' }));
    await waitFor(() => expect(recognizeImage).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/samples/lab-bill.webp');
    expect(await screen.findByText('Photo of a lab bill.webp')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue(
      'If insurance covers 80% of the lab fee, how much do I pay?',
    );
  });

  it('there is no sample photo in the extension side panel (it ships no samples folder)', () => {
    render(<ChatApp runtime={runtime} layout="panel" />);
    expect(screen.queryByRole('button', { name: 'Try a photo of this bill' })).toBeNull();
  });
});

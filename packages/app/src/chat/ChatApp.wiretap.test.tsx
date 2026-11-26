import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InferenceSource } from 'firebase/ai';
import { networkLog, type Deps } from '@envoy/ai';
import type { EnvoyRuntime } from '../app/useEnvoy';
import { ChatApp } from './ChatApp';

function runtime(reply = '[PERSON] may raise it to {{AMOUNT * 1.10}} at most.'): EnvoyRuntime {
  const generateContent = vi.fn(async () => ({
    response: { text: () => reply, inferenceSource: InferenceSource.IN_CLOUD },
  }));
  return {
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
      models: { reason: { generateContent } },
      getDeviceStatus: async () => 'no-api',
    } as unknown as Deps,
    configError: null,
    enablePrivateMode: vi.fn(),
    refreshStatus: vi.fn(async () => undefined),
  };
}

const wide = (matches: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('min-width: 1280px') ? matches : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

beforeEach(() => {
  networkLog.clear();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});
afterEach(() => vi.unstubAllGlobals());

describe('ChatApp wiretap', () => {
  it('is open beside the thread on a wide screen, and the toolbar button toggles it', async () => {
    wide(true);
    const user = userEvent.setup();
    render(<ChatApp runtime={runtime()} />);
    expect(screen.getByRole('heading', { name: 'What leaves' })).toBeInTheDocument();
    expect(screen.getByText('Nothing has left this device.')).toBeInTheDocument();
    const toggle = screen.getAllByRole('button', { name: 'What leaves' })[0]!;
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(screen.queryByRole('heading', { name: 'What leaves' })).toBeNull();
  });

  it('is closed by default on a narrow screen and in the side panel', () => {
    wide(false);
    render(<ChatApp runtime={runtime()} />);
    expect(screen.queryByRole('heading', { name: 'What leaves' })).toBeNull();
    wide(true);
    render(<ChatApp runtime={runtime()} layout="panel" />);
    expect(screen.queryByRole('heading', { name: 'What leaves' })).toBeNull();
  });

  it('after an approved sample question, shows the real values left of the line and the tags that left', async () => {
    wide(true);
    const user = userEvent.setup();
    render(<ChatApp runtime={runtime()} />);
    await user.click(
      screen.getByRole('button', { name: /Can my landlord raise the rent 20% this year\?/ }),
    );
    await user.click(await screen.findByRole('button', { name: 'Approve and send' }));
    const leaves = await screen.findByRole('region', { name: 'What leaves' });
    await waitFor(() => expect(leaves.querySelector('[data-wiretap-out]')).not.toBeNull());
    const out = leaves.querySelector('[data-wiretap-out]')!.textContent!;
    expect(out).not.toContain('Karim Fathy');
    expect(out).toMatch(/\[PERSON\]/);
    const seen = screen.getByRole('region', { name: 'What you see' });
    expect([...seen.querySelectorAll('mark')].map((m) => m.textContent)).toContain('Karim Fathy');
    await waitFor(() =>
      expect(within(leaves).getAllByTestId('wiretap-worked')[0]).toHaveTextContent(
        /worked out here:\s*EGP [\d,]+/,
      ),
    );
  });
});

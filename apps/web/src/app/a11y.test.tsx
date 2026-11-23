import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { networkLog, type Deps } from '@envoy/ai';
import { NetworkInspector, type EnvoyRuntime } from '@envoy/app';
import { AppShell } from './App';

const basicRuntime = (): EnvoyRuntime => ({
  status: 'no-api',
  progress: null,
  settings: { cloudModel: 'gemini-3.8-flash', fastCloudModel: 'gemini-3.5-flash-lite', promptVersion: 'v1' },
  deps: {
    runPrivate: vi.fn(),
    models: {},
    getDeviceStatus: async () => 'no-api',
  } as unknown as Deps,
  configError: null,
  enablePrivateMode: vi.fn(),
  refreshStatus: vi.fn(async () => undefined),
});

describe('accessibility and proof', () => {
  it('keyboard flow and announcements', async () => {
    const user = userEvent.setup();
    render(<AppShell runtime={basicRuntime()} />);
    await user.click(screen.getByRole('button', { name: /Try a sample contract/ }));
    await user.click(screen.getByRole('button', { name: 'When does my contract end?' }));
    screen.getByRole('button', { name: /Analyze privately/ }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'When does my contract end?',
      ),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(screen.getByTestId('live-region')).toHaveTextContent(
      /Found \d+ personal items on your device/,
    );
  });

  it('inspector lists the exact payload sent', () => {
    networkLog.clear();
    render(<NetworkInspector open onClose={vi.fn()} />);
    act(() =>
      networkLog.record({
        at: Date.now(),
        step: 'reason',
        target: 'cloud',
        blocked: false,
        payload: 'Question: Can [LANDLORD] raise [RENT]?',
      }),
    );
    act(() =>
      networkLog.record({
        at: Date.now(),
        step: 'tripwire',
        target: 'cloud',
        blocked: true,
        payload: 'raw text',
      }),
    );
    expect(screen.getByText('Question: Can [LANDLORD] raise [RENT]?')).toBeInTheDocument();
    expect(screen.getByText(/Blocked/)).toBeInTheDocument();
  });

  it('opens the About dialog with the research credit and the inference modes', async () => {
    const user = userEvent.setup();
    render(<AppShell runtime={basicRuntime()} />);
    await user.click(screen.getByRole('button', { name: /How it works/ }));
    const dialog = screen.getByRole('dialog', { name: /How Envoy works/ });
    expect(dialog).toHaveTextContent('ONLY_ON_DEVICE');
    expect(dialog).toHaveTextContent('PREFER_IN_CLOUD');
    expect(dialog).toHaveTextContent(/Inspired by PAPILLON/);
  });
});

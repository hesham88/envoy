import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InferenceSource } from 'firebase/ai';
import { networkLog, type Deps } from '@envoy/ai';
import type { EnvoyRuntime } from '../app/useEnvoy';
import { ChatApp } from './ChatApp';

const Q = /Can my landlord raise the rent 20% this year\?/;

function setup() {
  const generateContent = vi.fn(async (_p: string) => ({
    response: { text: () => 'At most 10% a year.', inferenceSource: InferenceSource.IN_CLOUD },
  }));
  const runtime: EnvoyRuntime = {
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
  return { runtime, generateContent };
}

let online = false;
const goOnline = (v: boolean) => {
  online = v;
  act(() => {
    window.dispatchEvent(new Event(v ? 'online' : 'offline'));
  });
};

beforeEach(() => {
  networkLog.clear();
  online = false;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
});
afterEach(() => vi.restoreAllMocks());

async function holdOne(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: Q }));
  await user.click(await screen.findByRole('button', { name: "Send when I'm back online" }));
}

describe('ChatApp offline handoff', () => {
  it('offers to hold the approved request only while offline', async () => {
    const user = userEvent.setup();
    const { runtime } = setup();
    online = true;
    render(<ChatApp runtime={runtime} />);
    await user.click(screen.getByRole('button', { name: Q }));
    await screen.findByRole('button', { name: 'Approve and send' });
    expect(screen.queryByRole('button', { name: "Send when I'm back online" })).toBeNull();
    goOnline(false);
    expect(
      await screen.findByRole('button', { name: "Send when I'm back online" }),
    ).toBeInTheDocument();
  });

  it('holds it on the device, then sends it once when the network returns', async () => {
    const user = userEvent.setup();
    const { runtime, generateContent } = setup();
    render(<ChatApp runtime={runtime} />);
    await holdOne(user);
    expect(screen.getByText('Held on this device: waiting for the network')).toBeInTheDocument();
    expect(
      screen.getByText(/If you close this tab, the held question is discarded/),
    ).toBeInTheDocument();
    expect(generateContent).not.toHaveBeenCalled();
    goOnline(true);
    await waitFor(() => expect(generateContent).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/At most 10% a year/)).toBeInTheDocument();
  });

  it('sends once on flapping network', async () => {
    const user = userEvent.setup();
    const { runtime, generateContent } = setup();
    render(<ChatApp runtime={runtime} />);
    await holdOne(user);
    goOnline(true);
    goOnline(false);
    goOnline(true);
    await screen.findByText(/At most 10% a year/);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('failure after reconnect shows the error and clears the hold', async () => {
    const user = userEvent.setup();
    const { runtime, generateContent } = setup();
    generateContent.mockRejectedValueOnce(new Error('boom'));
    render(<ChatApp runtime={runtime} />);
    await holdOne(user);
    goOnline(true);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Held on this device: waiting for the network')).toBeNull();
  });

  it('cancel returns to the approval card and nothing is sent', async () => {
    const user = userEvent.setup();
    const { runtime, generateContent } = setup();
    render(<ChatApp runtime={runtime} />);
    await holdOne(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Approve and send' })).toBeInTheDocument();
    goOnline(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(generateContent).not.toHaveBeenCalled();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deps } from '@envoy/ai';
import type { EnvoyRuntime } from '../app/useEnvoy';
import { ChatApp } from './ChatApp';

// History has a passcode and this tab hasn't unlocked it.
vi.mock('../lib/useVault', () => ({
  useVault: () => ({
    state: 'locked',
    entries: [],
    hasPasscode: true,
    save: vi.fn(async () => undefined),
    load: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
    unlock: vi.fn(async () => undefined),
    setPasscode: vi.fn(async () => undefined),
    lock: vi.fn(),
    destroyAll: vi.fn(async () => undefined),
  }),
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
    models: { reason: { generateContent: vi.fn() } },
    getDeviceStatus: async () => 'no-api',
  } as unknown as Deps,
  configError: null,
  enablePrivateMode: vi.fn(),
  refreshStatus: vi.fn(async () => undefined),
};

beforeEach(() => localStorage.clear());

describe('Your rules while History is locked', () => {
  it('never writes rules to plain storage and says they last for this tab', async () => {
    const user = userEvent.setup();
    render(<ChatApp runtime={runtime} />);
    await user.click(screen.getAllByRole('button', { name: /Your rules/ })[0]!);
    expect(screen.getByRole('note')).toHaveTextContent(/History is locked/);
    await user.type(screen.getByLabelText(/Words to protect/), 'Bluebird');
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(screen.getByText(/Bluebird/)).toBeInTheDocument();
    expect(localStorage.getItem('envoy.rules.v1')).toBeNull();
  });
});

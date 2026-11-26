import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InferenceSource } from 'firebase/ai';
import { networkLog, type Deps } from '@envoy/ai';
import type { EnvoyRuntime } from '../app/useEnvoy';
import { ChatApp } from './ChatApp';

function runtime(): EnvoyRuntime {
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
      models: {
        reason: {
          generateContent: vi.fn(async () => ({
            response: { text: () => 'Eight weeks.', inferenceSource: InferenceSource.IN_CLOUD },
          })),
        },
      },
      getDeviceStatus: async () => 'no-api',
    } as unknown as Deps,
    configError: null,
    enablePrivateMode: vi.fn(),
    refreshStatus: vi.fn(async () => undefined),
  };
}

beforeEach(() => networkLog.clear());
afterEach(() => vi.unstubAllGlobals());

describe('ChatApp samples', () => {
  it('offers five sample documents, each with device and cloud questions', () => {
    render(<ChatApp runtime={runtime()} />);
    const names = [
      'Rental lease',
      'Job offer',
      'Lab results and bill',
      'Freelance contract',
      'Solar loan',
    ];
    for (const n of names) {
      const g = screen.getByRole('group', { name: n });
      expect(within(g).getAllByRole('button', { name: /on this device/ }).length).toBeGreaterThan(
        0,
      );
      expect(within(g).getAllByRole('button', { name: /cloud, masked/ }).length).toBeGreaterThan(0);
    }
  });

  it('a question loads its document and asks it', async () => {
    const user = userEvent.setup();
    render(<ChatApp runtime={runtime()} />);
    await user.click(
      screen.getByRole('button', { name: /When should I repeat the vitamin D test\?/ }),
    );
    expect(await screen.findByText('When should I repeat the vitamin D test?')).toBeInTheDocument();
    expect(screen.getAllByText('Lab results and bill, Dokki').length).toBeGreaterThan(0);
  });

  it('a sample link opens that document with a question ready', () => {
    vi.stubGlobal('location', { ...window.location, search: '?sample=offer' });
    render(<ChatApp runtime={runtime()} />);
    expect(screen.getAllByText('Job offer, Giza').length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox')).toHaveValue(
      'If they let me go without cause after 18 months, how much severance do I get?',
    );
  });
});

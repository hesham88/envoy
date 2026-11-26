import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineBanner } from './OfflineBanner';

afterEach(() => vi.restoreAllMocks());

describe('OfflineBanner', () => {
  it('offline banner appears and clears with connectivity', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineBanner />);
    expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();

    online.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /can wait here until you're back online, or get a lighter answer on this device now/,
      ),
    ).toBeInTheDocument();

    online.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();
  });
});

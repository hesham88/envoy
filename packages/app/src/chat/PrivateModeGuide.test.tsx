import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrivateModeGuide } from './PrivateModeGuide';

const runtime = (status: 'available' | 'downloadable' | 'unavailable' | 'no-api') => ({
  status,
  progress: null,
  enablePrivateMode: vi.fn(),
  refreshStatus: vi.fn(async () => undefined),
});

describe('PrivateModeGuide', () => {
  it('explains the model state and offers the download in one click', async () => {
    const user = userEvent.setup();
    const r = runtime('downloadable');
    render(<PrivateModeGuide runtime={r} onClose={() => {}} />);
    expect(screen.getByText(/Not downloaded yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Download Chrome's built-in model" }));
    expect(r.enablePrivateMode).toHaveBeenCalled();
  });

  it('inside the extension, opens Chrome pages; on the web, offers to copy them', async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    const { unmount } = render(
      <PrivateModeGuide
        runtime={runtime('unavailable')}
        openChromePage={open}
        onClose={() => {}}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: /chrome:\/\/flags\/#gemma4-for-built-in-ai/ }),
    );
    expect(open).toHaveBeenCalledWith('flags-gemma4');
    unmount();
    render(<PrivateModeGuide runtime={runtime('unavailable')} onClose={() => {}} />);
    expect(
      screen.getByRole('button', { name: /chrome:\/\/settings\/ai.*copy/ }),
    ).toBeInTheDocument();
  });

  it('says plainly when the browser has no on-device AI, and disables the download', () => {
    render(<PrivateModeGuide runtime={runtime('no-api')} onClose={() => {}} />);
    expect(screen.getByText(/no on-device AI/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Download Chrome's built-in model" })).toBeDisabled();
  });
});

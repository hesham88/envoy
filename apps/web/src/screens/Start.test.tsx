import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EnvoyRuntime } from '@envoy/app';

vi.mock('@envoy/app', async (orig) => {
  const real = await orig<typeof import('@envoy/app')>();
  return {
    ...real,
    readDocumentFile: vi.fn(async (f: File) => {
      if (f.name === 'scan.pdf')
        throw new real.FileReadError('This PDF has no selectable text (it may be a scan).');
      return { title: f.name, text: '1. Rent. The rent is EGP 100.', pages: 1 };
    }),
  };
});

const { AppShell } = await import('../app/App');

function runtime(over: Partial<EnvoyRuntime> = {}): EnvoyRuntime {
  return {
    status: 'available',
    progress: null,
    settings: {
      cloudModel: 'gemini-3.8-flash',
      fastCloudModel: 'gemini-3.5-flash-lite',
      cloudDefault: 'fast',
      promptVersion: 'v1',
    },
    deps: null,
    configError: null,
    enablePrivateMode: vi.fn(),
    refreshStatus: vi.fn(async () => undefined),
    ...over,
  };
}

describe('Start screen', () => {
  it('analyze disabled until a document and question exist', async () => {
    const user = userEvent.setup();
    render(<AppShell runtime={runtime()} />);
    const analyze = screen.getByRole('button', { name: /Analyze privately/ });
    expect(analyze).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Try a sample contract/ }));
    expect(analyze).toBeDisabled();
    await user.type(
      screen.getByLabelText(/What do you want to know/),
      'When does my contract end?',
    );
    expect(analyze).toBeEnabled();
  });

  it('sample button loads the lease and shows the fictional notice', async () => {
    const user = userEvent.setup();
    render(<AppShell runtime={runtime()} />);
    await user.click(screen.getByRole('button', { name: /Try a sample contract/ }));
    expect(screen.getByText('Residential lease, Cairo')).toBeInTheDocument();
    expect(screen.getByText(/All people, IDs and numbers are fictional/)).toBeInTheDocument();
  });

  it('suggested questions fill the question box', async () => {
    const user = userEvent.setup();
    render(<AppShell runtime={runtime()} />);
    await user.click(screen.getByRole('button', { name: 'When does my contract end?' }));
    expect(screen.getByLabelText(/What do you want to know/)).toHaveValue(
      'When does my contract end?',
    );
  });

  it('scanned pdf shows no-text message', async () => {
    const user = userEvent.setup();
    render(<AppShell runtime={runtime()} />);
    await user.upload(
      screen.getByLabelText(/Choose file/),
      new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' }),
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no selectable text/));
  });

  it('pasted text becomes the document', async () => {
    const user = userEvent.setup();
    render(<AppShell runtime={runtime()} />);
    await user.click(screen.getByRole('tab', { name: /Paste text/ }));
    await user.type(screen.getByLabelText(/Paste your document/), '1. Term. Two years.');
    await user.click(screen.getByRole('button', { name: /Use this text/ }));
    expect(screen.getByText('Pasted text')).toBeInTheDocument();
  });

  it('shows the turn-on guide and Basic protection when no model is ready', () => {
    render(<AppShell runtime={runtime({ status: 'no-api' })} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Basic protection/);
    expect(screen.getByRole('heading', { name: /Turn on on-device AI/ })).toBeInTheDocument();
  });

  it('offers Enable private mode when the model can be downloaded, and calls it on click', async () => {
    const user = userEvent.setup();
    const rt = runtime({ status: 'downloadable' });
    render(<AppShell runtime={rt} />);
    await user.click(screen.getAllByRole('button', { name: /Enable private mode/ })[0]!);
    expect(rt.enablePrivateMode).toHaveBeenCalled();
  });

  it('shows download progress in the status pill', () => {
    render(<AppShell runtime={runtime({ status: 'downloading', progress: 0.42 })} />);
    expect(screen.getByRole('status')).toHaveTextContent('42%');
  });
});

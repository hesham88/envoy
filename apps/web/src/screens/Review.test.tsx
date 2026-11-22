import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { analyze, type Analysis, type Deps } from '@envoy/ai';
import { EN_LEASE } from '@envoy/core';
import { initialSession, sessionReducer, type SessionState } from '@envoy/app';
import { Review } from './Review';

const basicDeps = {
  runPrivate: vi.fn(),
  models: {},
  getDeviceStatus: async () => 'no-api',
} as unknown as Deps;

function Harness({
  analysis,
  onApprove = vi.fn(),
}: {
  analysis: Analysis;
  onApprove?: (o: string) => void;
}) {
  const start: SessionState = {
    ...initialSession,
    phase: 'review',
    doc: { title: EN_LEASE.title, text: EN_LEASE.text, source: 'sample' },
    question: 'Can my landlord raise the rent 20% this year?',
    analysis,
    selectedIds: analysis.selectedIds,
    notice: 'No on-device model is ready in this browser, so Envoy uses Basic protection.',
  };
  const [state, dispatch] = useReducer(sessionReducer, start);
  return <Review state={state} dispatch={dispatch} onApprove={onApprove} />;
}

async function basicAnalysis() {
  return analyze(EN_LEASE.text, 'Can my landlord raise the rent 20% this year?', basicDeps);
}

describe('Review screen', () => {
  it('shows the question, the notice and what the cloud will see', async () => {
    render(<Harness analysis={await basicAnalysis()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Can my landlord raise the rent 20% this year?',
    );
    expect(screen.getByText(/uses Basic protection/)).toBeInTheDocument();
    const preview = screen.getByRole('region', { name: /What the cloud will see/ });
    expect(preview).toHaveTextContent('The monthly rent is');
    expect(preview).not.toHaveTextContent('EGP 8,500');
  });

  it('hiding a highlighted value updates the preview', async () => {
    const user = userEvent.setup();
    render(<Harness analysis={await basicAnalysis()} />);
    const rent = screen.getAllByRole('button', { name: /EGP 8,500/ })[0]!;
    await user.click(rent); // masked → hidden
    expect(screen.getByRole('region', { name: /What the cloud will see/ })).not.toHaveTextContent(
      'The monthly rent is',
    );
  });

  it('approve disabled while guard has leaks', async () => {
    const user = userEvent.setup();
    render(<Harness analysis={await basicAnalysis()} />);
    await user.click(screen.getByRole('button', { name: /Edit excerpt/ }));
    const box = screen.getByLabelText(/Excerpt to send/);
    await user.type(box, ' Pay EG38 0019 0005 0000 0000 2631 8000 2');
    expect(screen.getByRole('button', { name: /Approve and send/ })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/IBAN/);
  });

  it('basic mode shows flagged names once each', async () => {
    render(<Harness analysis={await basicAnalysis()} />);
    const found = screen.getByRole('region', { name: /Found on device/ });
    expect(within(found).getAllByText('Karim Fathy')).toHaveLength(1);
    expect(within(found).getAllByText('Mona Adel')).toHaveLength(1);
  });

  it('approve sends the composed excerpt', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(<Harness analysis={await basicAnalysis()} onApprove={onApprove} />);
    await user.click(screen.getByRole('button', { name: /Approve and send/ }));
    expect(onApprove).toHaveBeenCalledWith(
      expect.stringContaining('Question: Can my landlord raise the rent 20% this year?'),
    );
  });
});

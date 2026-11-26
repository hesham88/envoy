import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WiretapPane } from './WiretapPane';
import type { WiretapView } from './wiretap';

const empty: WiretapView = { cards: [], docChars: 0, sentChars: 0, nothingLeft: true };
const doc = {
  title: 'Residential lease, Cairo',
  text: 'The landlord Karim Fathy charges EGP 8,500 a month.',
  source: 'sample' as const,
};
const sent: WiretapView = {
  docChars: 6980,
  sentChars: 412,
  nothingLeft: false,
  cards: [
    { kind: 'device', step: 'detect', payload: 'find the private details' },
    {
      kind: 'out',
      model: 'gemini-4-hydrogen',
      instructions: '## Instructions\nKeep every tag.',
      payload: 'Clause 7: [LANDLORD] charges [RENT].',
      refused: false,
    },
    { kind: 'in', payload: 'Up to {{RENT * 1.10}}.' },
    { kind: 'worked', expr: '{{RENT * 1.10}}', value: 'EGP 9,350' },
    { kind: 'worked', expr: '{{DEPOSIT * 2}}', value: null },
  ],
};

describe('WiretapPane', () => {
  it('shows both sides, and says nothing has left when nothing has', () => {
    render(
      <WiretapPane doc={null} values={[]} view={empty} open onClose={() => {}} overlay={false} />,
    );
    expect(screen.getByRole('heading', { name: 'What you see' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What leaves' })).toBeInTheDocument();
    expect(screen.getByText('Nothing has left this device.')).toBeInTheDocument();
  });

  it('highlights every real value in the document, and only those', () => {
    render(
      <WiretapPane
        doc={doc}
        values={['Karim Fathy', 'EGP 8,500']}
        view={empty}
        open
        onClose={() => {}}
        overlay={false}
      />,
    );
    const seen = screen.getByRole('region', { name: 'What you see' });
    const marks = seen.querySelectorAll('mark');
    expect([...marks].map((m) => m.textContent)).toEqual(['Karim Fathy', 'EGP 8,500']);
  });

  it('shows the exact text sent, with tags marked, and the label that says what it is', () => {
    render(
      <WiretapPane doc={doc} values={[]} view={sent} open onClose={() => {}} overlay={false} />,
    );
    const leaves = screen.getByRole('region', { name: 'What leaves' });
    expect(
      within(leaves).getByText('The exact text Envoy handed to Firebase AI Logic.'),
    ).toBeInTheDocument();
    const out = leaves.querySelector('[data-wiretap-out]')!;
    expect(out.textContent).toBe('Clause 7: [LANDLORD] charges [RENT].');
    expect([...out.querySelectorAll('mark')].map((m) => m.textContent)).toEqual([
      '[LANDLORD]',
      '[RENT]',
    ]);
    expect(within(leaves).getByText(/Sent to gemini-4-hydrogen/)).toBeInTheDocument();
  });

  it('counts what left against the whole document', () => {
    render(
      <WiretapPane doc={doc} values={[]} view={sent} open onClose={() => {}} overlay={false} />,
    );
    expect(
      screen.getByText('412 of 6,980 characters of your document left this device, masked'),
    ).toBeInTheDocument();
    // Envoy's own instructions leave too: shown, collapsed, and not counted as your text.
    const ins = screen
      .getByText("Envoy's fixed instructions, sent with every question")
      .closest('details')!;
    expect(ins).not.toHaveAttribute('open');
    expect(ins).toHaveTextContent('Keep every tag.');
  });

  it('shows worked-out values, and says plainly when one could not be worked out', () => {
    render(
      <WiretapPane doc={doc} values={[]} view={sent} open onClose={() => {}} overlay={false} />,
    );
    const worked = screen.getAllByTestId('wiretap-worked');
    expect(worked).toHaveLength(2);
    expect(worked[0]).toHaveTextContent('{{RENT * 1.10}}');
    expect(worked[0]).toHaveTextContent('EGP 9,350');
    expect(worked[1]).toHaveTextContent('Not worked out');
  });

  it('keeps device steps collapsed and labelled as staying here', () => {
    render(
      <WiretapPane doc={doc} values={[]} view={sent} open onClose={() => {}} overlay={false} />,
    );
    const device = screen.getByText('Stayed on this device', { exact: false }).closest('details')!;
    expect(device).not.toHaveAttribute('open');
  });

  it('as an overlay it can be closed, and renders nothing when closed', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <WiretapPane doc={doc} values={[]} view={sent} open onClose={onClose} overlay />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close What leaves' }));
    expect(onClose).toHaveBeenCalledOnce();
    rerender(
      <WiretapPane doc={doc} values={[]} view={sent} open={false} onClose={onClose} overlay />,
    );
    expect(screen.queryByRole('heading', { name: 'What leaves' })).toBeNull();
  });
});

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Receipt } from '@envoy/core';
import type { AnswerResult } from '../app/session';
import { Answer } from './Answer';

const receipt = (over: Partial<Receipt> = {}): Receipt => ({
  found: { PERSON: 3, PHONE: 2 },
  foundTotal: 14,
  sharedTags: ['[LANDLORD]', '[RENT]', '[TENANT]'],
  keptTotal: 14,
  charsSent: 312,
  clausesSent: 1,
  pagesTotal: 6,
  pagesSent: 1,
  steps: [
    { step: 'detect', source: 'on_device', ms: 400 },
    { step: 'minimize', source: 'on_device', ms: 700 },
    { step: 'reason', source: 'in_cloud', ms: 2100 },
  ],
  mode: 'private',
  sharedByUser: 0,
  ...over,
});

const cloudText = 'Not by 20%. Karim Fathy may raise the rent by at most 10%, so to EGP 9,350.';
const cloud: AnswerResult = {
  text: cloudText,
  spans: [
    { start: cloudText.indexOf('Karim'), end: cloudText.indexOf('Karim') + 11, tag: '[LANDLORD]', value: 'Karim Fathy', computed: false },
    { start: cloudText.indexOf('EGP'), end: cloudText.length - 1, tag: '{{RENT * 1.10}}', value: 'EGP 9,350', computed: true },
  ],
  source: 'in_cloud',
  lighter: false,
  receipt: receipt(),
};

describe('Answer screen', () => {
  it('answer shows restored values and receipt numbers from the receipt', () => {
    render(<Answer question="Can my landlord raise the rent 20% this year?" result={cloud} onFollowUp={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText('Not by 20%.')).toBeInTheDocument();
    expect(screen.getByText('Karim Fathy')).toHaveAttribute('data-restored', 'true');
    expect(screen.getByText('EGP 9,350')).toHaveAttribute('data-restored', 'true');
    expect(screen.getByText(/Reasoned in the cloud/)).toBeInTheDocument();
    const r = screen.getByRole('region', { name: /Privacy receipt/ });
    expect(within(r).getByText(/1 clause · 312 characters/)).toBeInTheDocument();
    expect(within(r).getByText(/14 personal items · 6 pages/)).toBeInTheDocument();
    expect(within(r).getAllByRole('listitem')).toHaveLength(3);
  });

  it('local answer shows zero bytes sent', () => {
    const local: AnswerResult = {
      text: 'Your contract ends on 31 August 2027 (Clause 2).',
      spans: [],
      source: 'on_device',
      lighter: false,
      receipt: receipt({ charsSent: 0, clausesSent: 0, pagesSent: 0, sharedTags: [], steps: [{ step: 'answerLocal', source: 'on_device', ms: 1600 }] }),
    };
    render(<Answer question="When does my contract end?" result={local} onFollowUp={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText(/Answered on device/)).toBeInTheDocument();
    expect(screen.getByText('0 bytes')).toBeInTheDocument();
    expect(screen.queryByText(/Reasoned in the cloud/)).not.toBeInTheDocument();
  });

  it('labels a lighter on-device answer when the cloud was unreachable', () => {
    render(<Answer question="Q?" result={{ ...cloud, source: 'on_device', lighter: true }} onFollowUp={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText(/Lighter on-device answer/)).toBeInTheDocument();
  });
});

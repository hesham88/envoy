import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnalyzingPanel } from './AnalyzingPanel';

describe('AnalyzingPanel', () => {
  it('marks finished steps, names the current one with its part count, and says nothing has left the device', () => {
    render(
      <AnalyzingPanel
        progress={{ step: 'detect', part: 2, parts: 3 }}
        mode="private"
        startedAt={Date.now() - 12_000}
      />,
    );
    expect(screen.getByText(/Checked with local rules/)).toHaveAttribute('data-state', 'done');
    const current = screen.getByText(/Finding names and roles on this device/);
    expect(current).toHaveAttribute('data-state', 'active');
    expect(current).toHaveTextContent('part 2 of 3');
    expect(screen.getByText(/Picking the clauses your question needs/)).toHaveAttribute(
      'data-state',
      'waiting',
    );
    expect(screen.getByText(/Nothing has left this computer/)).toBeInTheDocument();
  });

  it('shows only the rules step in Basic protection', () => {
    render(
      <AnalyzingPanel
        progress={{ step: 'rules', part: 1, parts: 1 }}
        mode="basic"
        startedAt={Date.now()}
      />,
    );
    expect(screen.queryByText(/Finding names and roles/)).not.toBeInTheDocument();
  });
});

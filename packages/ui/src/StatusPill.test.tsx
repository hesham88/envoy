import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it('uses the full wording by default', () => {
    render(<StatusPill status="available" progress={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('Private mode on · on-device model ready');
  });

  it('has a compact wording for narrow surfaces like the side panel', () => {
    const { rerender } = render(<StatusPill status="available" progress={null} compact />);
    expect(screen.getByRole('status')).toHaveTextContent(/^On-device ready$/);
    rerender(<StatusPill status="downloading" progress={0.42} compact />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Downloading 42%$/);
    rerender(<StatusPill status="no-api" progress={null} compact />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Basic protection$/);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo', () => {
  it('has the accessible name "Envoy"', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'Envoy' })).toBeInTheDocument();
  });

  it('shows the wordmark when asked, without repeating the name to screen readers', () => {
    render(<Logo withWordmark />);
    expect(screen.getAllByRole('img', { name: 'Envoy' })).toHaveLength(1);
    expect(screen.getByText('Envoy')).toBeInTheDocument();
  });

  it('scales to the requested size', () => {
    render(<Logo size={16} />);
    const svg = screen.getByRole('img', { name: 'Envoy' });
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
  });
});

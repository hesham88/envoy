import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('renders the app shell with a banner landmark and the hero heading', () => {
    render(<App />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /Ask the cloud\. Keep your secrets\./ }),
    ).toBeInTheDocument();
  });
});

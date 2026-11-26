import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaskBox } from '@envoy/core';
import { PhotoPreview } from './PhotoPreview';

const box = (type: MaskBox['type'], value: string, x: number): MaskBox => ({
  x,
  y: 10,
  w: 100,
  h: 20,
  type,
  value,
  on: true,
});

beforeEach(() =>
  vi.stubGlobal('createImageBitmap', async () => ({ width: 800, height: 600, close: () => {} })),
);
afterEach(() => vi.unstubAllGlobals());

describe('PhotoPreview', () => {
  it('describes the photo and how many details are boxed', () => {
    render(
      <PhotoPreview
        photo={{
          blob: new Blob(['x']),
          width: 800,
          height: 600,
          boxes: [box('PERSON', 'Adel Mansour', 10), box('BARCODE', 'QR code', 300)],
        }}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Your photo, with 2 private details boxed on this device' }),
    ).toBeInTheDocument();
  });

  it('places each box over the photo, scaled, and names what it covers', () => {
    const { container } = render(
      <PhotoPreview
        photo={{
          blob: new Blob(['x']),
          width: 800,
          height: 600,
          boxes: [box('PHONE', '+20 100 901 2345', 400)],
        }}
      />,
    );
    const mask = container.querySelector('[data-mask]') as HTMLElement;
    expect(mask.style.left).toBe('50%');
    expect(mask.style.width).toBe('12.5%');
    expect(mask).toHaveTextContent('Phone');
  });
});

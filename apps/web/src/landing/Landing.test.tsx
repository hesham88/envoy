import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Landing, Measured } from './Landing';
import { UvDemo } from './UvDemo';

describe('UvDemo', () => {
  it('replaces private details with tags in what the AI receives', () => {
    render(<UvDemo />);
    const status = screen.getByText(/What the AI receives:/);
    expect(status.textContent).toMatch(/private details replaced/);
    const out = status.nextElementSibling as HTMLElement;
    expect(out.textContent).toContain('[EMAIL]');
    expect(out.textContent).toContain('[SECRET]');
    expect(out.textContent).not.toContain('mona.adel@example.com');
    expect(out.textContent).not.toContain('Mona Adel');
  });

  it('off means the field is an ordinary text box and the text goes as typed', () => {
    const { container } = render(<UvDemo />);
    fireEvent.click(screen.getByRole('switch', { name: /Envoy on/ }));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(container.querySelector('.envoy-uvring')).toBeNull();
    expect(container.querySelector('mark')).toBeNull();
    expect(screen.getByText(/receives exactly what you typed/)).toBeInTheDocument();
  });

  it('protects a word the user adds, and lets them send a value as written', () => {
    render(<UvDemo />);
    const field = screen.getByLabelText(/Your message/);
    fireEvent.change(field, { target: { value: 'Ship Bluebird to mona.adel@example.com' } });
    fireEvent.change(screen.getByLabelText('Add a word to protect'), {
      target: { value: 'Bluebird' },
    });
    fireEvent.submit(screen.getByLabelText('Add a word to protect').closest('form')!);
    const out = () => screen.getByText(/What the AI receives:/).nextElementSibling!.textContent;
    expect(out()).toBe('Ship [PRIVATE] to [EMAIL]');
    const found = screen.getByRole('list', { name: 'Found on this device' });
    fireEvent.click(within(found).getByText('[EMAIL]').closest('button')!);
    expect(out()).toBe('Ship [PRIVATE] to mona.adel@example.com');
  });
});

describe('Landing', () => {
  it('says plainly that the instant check is rules only and links to the real pipeline', () => {
    render(<Landing />);
    expect(screen.getByText(/rules only: no AI, and nothing is sent/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Try it with a real document/ })).toHaveAttribute(
      'href',
      '/app',
    );
  });

  it('never shows measured numbers without an eval summary', () => {
    render(<Measured summary={null} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/publish here from the eval harness/)).toBeInTheDocument();
  });

  it('shows each arm with its model, version and n, straight from the summary', () => {
    render(
      <Measured
        summary={{
          generatedAt: '2026-11-22T19:29:04.598Z',
          arms: [
            {
              id: 'nano',
              label: 'Default Gemini Nano',
              model: {
                label: 'Gemini Nano (default)',
                component: 'nano_v3_cpu_component',
                version: '2025.8.21.1028',
              },
              n: 30,
              nTotal: 36,
              metrics: { maskRecall: 1, outboundLeaks: 0, minimizationRatio: 0.1017 },
            },
          ],
        }}
      />,
    );
    const row = screen.getByRole('row', { name: /Default Gemini Nano/ });
    expect(row.textContent).toContain('2025.8.21.1028');
    expect(row.textContent).toContain('30 of 36');
    expect(row.textContent).toContain('10%');
  });
});

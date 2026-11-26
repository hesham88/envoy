import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { STEPS } from './Landing';
import { StepRelay } from './StepRelay';

const cloudLabel = (c: HTMLElement) =>
  c.querySelector('.relay-zone--cloud .relay-bytes')!.textContent;

describe('StepRelay (the five steps on the landing page)', () => {
  it('nothing reaches the cloud before the approved excerpt crosses the guard', () => {
    const { container } = render(<StepRelay steps={STEPS} />);
    const steps = screen.getAllByRole('button', { name: /of 5/ });
    expect(steps).toHaveLength(5);
    for (const i of [0, 1, 2]) {
      fireEvent.click(steps[i]!);
      expect(cloudLabel(container)).toBe('Nothing received');
    }
    fireEvent.click(steps[3]!);
    // The count is the excerpt's real length, and it carries tags only.
    expect(cloudLabel(container)).toMatch(/^\d+ characters received, tags only$/);
    const received = container.querySelector('.relay-zone--cloud')!.textContent!;
    expect(received).toContain('[RENT]');
    expect(received).not.toMatch(/EGP 8,500|Karim Fathy|EG38/);
  });

  it('shows where each step runs, marks the current one, and restores values on the device', () => {
    const { container } = render(<StepRelay steps={STEPS} />);
    const steps = screen.getAllByRole('button', { name: /of 5/ });
    fireEvent.click(steps[4]!);
    expect(steps[4]).toHaveAttribute('aria-current', 'step');
    expect(steps[0]).not.toHaveAttribute('aria-current');
    const answer = container.querySelector('.relay-answer')!;
    expect(answer).toHaveAttribute('data-on', 'true');
    expect(answer.textContent).toContain('EGP 9,350');
    // The caption explains the step that is showing.
    expect(container.querySelector('#relay-caption')!.textContent).toMatch(
      /^Real values come back on your device \(on this device\)/,
    );
  });

  it('has a visible pause control, and choosing a step pauses the walkthrough', () => {
    render(<StepRelay steps={STEPS} />);
    expect(screen.getByRole('button', { name: 'Pause the walkthrough' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /of 5/ })[1]!);
    expect(screen.getByRole('button', { name: 'Play the walkthrough' })).toBeInTheDocument();
  });
});

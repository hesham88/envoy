import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RecordedRun } from './RecordedRun';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('RecordedRun', () => {
  beforeEach(() => {
    // Reduced motion: the replay shows every step at once.
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ships the recording exactly as the evaluation recorded it (no edits)', () => {
    const shipped = readFileSync(resolve(HERE, 'recorded-run.gemma4.json'), 'utf8');
    const recorded = readFileSync(
      resolve(HERE, '../../../../tests/eval/probes/demo-trace-gemma4.json'),
      'utf8',
    );
    expect(shipped).toBe(recorded);
    const trace = JSON.parse(shipped);
    expect(trace.recording).toBe(true);
    expect(trace.mode).toBe('private');
  });

  it('says it is a recording, names the model, and shows each step with its real time', async () => {
    render(<RecordedRun onClose={() => {}} />);
    expect(await screen.findByText(/Recording, not live\./)).toBeInTheDocument();
    expect(screen.getByText(/gemma4_component 2026\.11\.3\.1140/)).toBeInTheDocument();
    await screen.findByText(/89\.6 s/);
    const steps = screen
      .getAllByRole('listitem')
      .filter((li) => /\d+\.\d s/.test(li.textContent ?? ''));
    expect(steps.map((li) => li.textContent?.match(/(\d+\.\d) s/)?.[1])).toEqual([
      '89.6',
      '34.9',
      '27.1',
      '2.1',
    ]);
    expect(within(steps[3]!).getByText(/Cloud, gemini-3\.5-flash-lite/)).toBeInTheDocument();
  });

  it('shows what the cloud saw (tags only) and the value worked out on the device', async () => {
    render(<RecordedRun onClose={() => {}} />);
    const sent = await screen.findByText(/Clause 7: 7\. Rent\. The monthly rent is \[RENT\]/);
    expect(sent.textContent).not.toMatch(/8,500|Karim Fathy/);
    const computed = screen.getByText('EGP 850');
    expect(computed.tagName).toBe('MARK');
    expect(computed).toHaveAttribute('title', 'Worked out on this device from {{RENT * 0.10}}');
  });
});

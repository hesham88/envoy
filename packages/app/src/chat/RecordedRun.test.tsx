import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RecordedRun } from './RecordedRun';

const HERE = dirname(fileURLToPath(import.meta.url));
// Expected values come from the shipped trace, so re-recording it keeps these tests true.
const TRACE = JSON.parse(readFileSync(resolve(HERE, 'recorded-run.gemma4.json'), 'utf8')) as {
  cloudModel: string;
  steps: { ms: number; source: string }[];
  answer: { spans: { value: string; tag: string; computed: boolean }[] };
};
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

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
    const want = TRACE.steps.map((x) => seconds(x.ms));
    await screen.findByText((text) => text.includes(want[0]!));
    const steps = screen
      .getAllByRole('listitem')
      .filter((li) => /\d+\.\d s/.test(li.textContent ?? ''));
    expect(steps.map((li) => li.textContent?.match(/\d+\.\d s/)?.[0])).toEqual(want);
    const cloudStep = steps[TRACE.steps.findIndex((x) => x.source === 'in_cloud')]!;
    expect(
      within(cloudStep).getByText((text) => text.includes(`Cloud, ${TRACE.cloudModel}`)),
    ).toBeInTheDocument();
  });

  it('shows what the cloud saw (tags only) and the value worked out on the device', async () => {
    render(<RecordedRun onClose={() => {}} />);
    const sent = await screen.findByText(/Clause 7: 7\. Rent\. The monthly rent is \[RENT\]/);
    expect(sent.textContent).not.toMatch(/8,500|Karim Fathy/);
    // Every value worked out on the device is highlighted, with the expression it came from.
    const spans = TRACE.answer.spans.filter((x) => x.computed);
    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) {
      const el = screen.getByText(span.value);
      expect(el.tagName).toBe('MARK');
      expect(el).toHaveAttribute('title', `Worked out on this device from ${span.tag}`);
    }
  });
});

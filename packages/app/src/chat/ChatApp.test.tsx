import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InferenceSource } from 'firebase/ai';
import { networkLog, type Deps } from '@envoy/ai';
import type { EnvoyRuntime } from '../app/useEnvoy';
import { ChatApp } from './ChatApp';
import { buildRows } from './FlightRecorder';

function basicRuntime(reply = 'Yes. The cap is 10% a year.') {
  const generateContent = vi.fn(async (_prompt: string) => ({
    response: { text: () => reply, inferenceSource: InferenceSource.IN_CLOUD },
  }));
  const runtime: EnvoyRuntime = {
    status: 'no-api',
    progress: null,
    settings: {
      cloudModel: 'gemini-3.8-flash',
      fastCloudModel: 'gemini-3.5-flash-lite',
      cloudDefault: 'fast',
      promptVersion: 'v1',
    },
    deps: {
      runPrivate: vi.fn(),
      models: { reason: { generateContent } },
      getDeviceStatus: async () => 'no-api',
    } as unknown as Deps,
    configError: null,
    enablePrivateMode: vi.fn(),
    refreshStatus: vi.fn(async () => undefined),
  };
  return { runtime, generateContent };
}

beforeEach(() => {
  networkLog.clear();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('ChatApp', () => {
  it('nothing reaches the cloud until the user approves the exact excerpt', async () => {
    const user = userEvent.setup();
    const { runtime, generateContent } = basicRuntime();
    render(<ChatApp runtime={runtime} />);
    await user.click(screen.getByRole('button', { name: 'Try the sample lease' }));

    const approve = await screen.findByRole('button', { name: 'Approve and send' });
    expect(generateContent).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Basic protection|on-device model/i).length).toBeGreaterThan(0);

    await user.click(approve);
    await screen.findByText(/The cap is 10% a year/);
    expect(generateContent).toHaveBeenCalledTimes(1);
    const sent = generateContent.mock.calls[0]![0];
    for (const raw of ['Karim Fathy', 'Mona Adel', '27506120104839', 'mona.adel@example.com'])
      expect(sent).not.toContain(raw);
  });

  it('a message without a document is protected too, and the recorder names where each step ran', async () => {
    const user = userEvent.setup();
    const { runtime, generateContent } = basicRuntime('Draft: Dear [PERSON], ...');
    render(<ChatApp runtime={runtime} />);
    await user.type(
      screen.getByLabelText('Message Envoy'),
      'Email mona.adel@example.com about EGP 8,500{Enter}',
    );

    const turn = await screen.findByRole('article');
    await within(turn).findByRole('button', { name: 'Approve and send' });
    const recorder = within(turn).getByText('Privacy flight recorder').closest('details')!;
    expect(recorder.querySelector('[data-row="rules"]')).toHaveAttribute('data-state', 'done');
    expect(recorder.querySelector('[data-row="detect"]')).toHaveAttribute('data-state', 'skipped');
    // A skipped on-device step must not read as if the model ran.
    const minimize = recorder.querySelector('[data-row="minimize"]')!;
    expect(minimize).toHaveTextContent('Every clause sent, masked');
    expect(minimize).toHaveTextContent('Skipped');
    expect(minimize).not.toHaveTextContent('This device');
    expect(minimize).not.toHaveTextContent("Chrome's built-in model");
    expect(recorder.querySelector('[data-row="approve"]')).toHaveAttribute('data-state', 'running');
    expect(generateContent).not.toHaveBeenCalled();

    await user.click(within(turn).getByRole('button', { name: 'Approve and send' }));
    await waitFor(() => expect(generateContent).toHaveBeenCalledTimes(1));
    const sent = generateContent.mock.calls[0]![0];
    expect(sent).not.toContain('mona.adel@example.com');
    expect(sent).toContain('[EMAIL]');
    await waitFor(() =>
      expect(recorder.querySelector('[data-row="reason"]')).toHaveAttribute('data-state', 'done'),
    );
    expect(
      within(recorder.querySelector('[data-row="reason"]') as HTMLElement).getByText(
        /gemini-3\.8-flash/,
      ),
    ).toBeInTheDocument();
  });

  it("applies the user's own rules and keeps them in this browser", async () => {
    const user = userEvent.setup();
    const { runtime, generateContent } = basicRuntime();
    render(<ChatApp runtime={runtime} />);
    await user.click(screen.getAllByRole('button', { name: /Your rules/ })[0]!);
    await user.type(screen.getByLabelText(/Words to protect/), 'Bluebird');
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(JSON.parse(localStorage.getItem('envoy.rules.v1')!)).toEqual([
      { label: 'PRIVATE', terms: ['Bluebird'] },
    ]);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.type(screen.getByLabelText('Message Envoy'), 'Summarise the Bluebird plan{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Approve and send' }));
    await waitFor(() => expect(generateContent).toHaveBeenCalled());
    expect(generateContent.mock.calls[0]![0]).not.toContain('Bluebird');
  });

  it('Local only never calls the cloud', async () => {
    const user = userEvent.setup();
    const { runtime, generateContent } = basicRuntime();
    render(<ChatApp runtime={runtime} />);
    await user.click(screen.getByRole('switch', { name: 'Local only' }));
    await user.type(
      screen.getByLabelText('Message Envoy'),
      'What is my email mona.adel@example.com for?{Enter}',
    );
    await screen.findByText(/nothing was answered and nothing was sent/);
    expect(screen.queryByRole('button', { name: 'Approve and send' })).toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('buildRows', () => {
  it('waits before anything runs and never claims a cloud call that did not happen', () => {
    const rows = buildRows({
      phase: 'analyzing',
      progress: null,
      analysis: null,
      result: null,
      cloudModel: 'm',
      localOnly: false,
    });
    expect(rows.find((r) => r.key === 'rules')?.state).toBe('running');
    expect(rows.find((r) => r.key === 'reason')?.state).toBe('waiting');
  });
});

describe('explanations and before/after', () => {
  it("shows the on-device model's own reasons for what it kept and where it answers", () => {
    const analysis = {
      mode: 'private',
      steps: [
        { step: 'detect', source: 'on_device', ms: 900 },
        { step: 'minimize', source: 'on_device', ms: 700 },
        { step: 'route', source: 'on_device', ms: 400 },
      ],
      selectionReason: 'Clause 7 sets the rent and the yearly cap.',
      route: { local: false, reason: 'Working out the increase needs reasoning.' },
    } as unknown as Parameters<typeof buildRows>[0]['analysis'];
    const rows = buildRows({
      phase: 'review',
      progress: null,
      analysis,
      result: null,
      cloudModel: 'm',
      localOnly: false,
    });
    expect(rows.find((r) => r.key === 'minimize')?.detail).toBe(
      'Clause 7 sets the rent and the yearly cap.',
    );
    expect(rows.find((r) => r.key === 'route')?.detail).toBe(
      'Working out the increase needs reasoning.',
    );
  });

  it('the approval card shows before and after at a glance', async () => {
    const user = userEvent.setup();
    const { runtime } = basicRuntime();
    render(<ChatApp runtime={runtime} />);
    await user.click(screen.getByRole('button', { name: 'Try the sample lease' }));
    const group = await screen.findByRole('group', { name: 'Before and after' });
    expect(group.textContent).toMatch(/On this device.*characters, \d+ private details/);
    expect(group.textContent).toMatch(/Would leave, after you approve.*0 raw details/);
  });
});

describe('ChatApp in the extension side panel', () => {
  it('hands a cloud question to the web app instead of calling the cloud, and uses text handed in', async () => {
    const user = userEvent.setup();
    const { runtime, generateContent } = basicRuntime();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <ChatApp
        runtime={runtime}
        layout="panel"
        incomingDoc={{
          title: 'Selected text',
          text: 'Mona Adel pays EGP 8,500 a month.',
          source: 'paste',
        }}
        cloudHandoff={{ url: 'https://envoy-hybrid-ai.web.app/app' }}
      />,
    );
    expect(await screen.findByText('Selected text')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Message Envoy'), 'Can the rent rise?{Enter}');
    const go = await screen.findByRole('button', { name: 'Continue in Envoy on the web' });
    expect(screen.getByText(/doesn't call/)).toBeInTheDocument();
    await user.click(go);
    expect(open).toHaveBeenCalledWith('https://envoy-hybrid-ai.web.app/app', '_blank', 'noopener');
    expect(generateContent).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

describe('the mode is said plainly before anything is sent', () => {
  it('Basic protection explains that the excerpt is the whole text, masked', async () => {
    const user = userEvent.setup();
    const { runtime } = basicRuntime();
    const { container } = render(<ChatApp runtime={runtime} />);
    await user.click(screen.getByRole('button', { name: 'Try the sample lease' }));
    await screen.findByRole('button', { name: 'Approve and send' });
    const note = container.querySelector('[data-mode="basic"]');
    expect(note?.textContent).toMatch(/Basic protection\..*whole text/);
  });
});

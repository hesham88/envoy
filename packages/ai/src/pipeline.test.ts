import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InferenceSource, type GenerativeModel } from 'firebase/ai';
import { buildMinimizePrompt, chunkDocument, EN_LEASE, type Chunk, type Step } from '@envoy/core';
import { analyze, answer, OutboundBlockedError, selectClausesBatched, type Deps } from './pipeline';
import { networkLog } from './network-log';

const QUESTION = 'Can my landlord raise the rent 20% this year?';

const DETECT_JSON = JSON.stringify({
  entities: [
    { text: 'Karim Fathy', kind: 'PERSON', role: 'landlord' },
    { text: 'Mona Adel', kind: 'PERSON', role: 'tenant' },
    { text: 'Sara Nabil', kind: 'PERSON', role: 'witness' },
    { text: 'EGP 8,500', kind: 'MONEY', role: 'rent' },
    { text: 'EGP 17,000', kind: 'MONEY', role: 'deposit' },
  ],
});

function fakeDeps(status: 'available' | 'no-api', opts: { local?: boolean; reasonText?: string } = {}) {
  const models = Object.fromEntries(
    (['detect', 'minimize', 'route', 'answerLocal', 'reason'] as Step[]).map((step) => [
      step,
      {
        step,
        generateContent: vi.fn(async () => ({
          response: {
            text: () => opts.reasonText ?? '[LANDLORD] may raise it by at most 10%, so to {{RENT * 1.10}}; 20% would be {{RENT * 1.2}}.',
            inferenceSource: InferenceSource.IN_CLOUD,
          },
        })),
      } as unknown as GenerativeModel,
    ]),
  ) as Record<Step, GenerativeModel>;

  const runPrivate = vi.fn(async (model: GenerativeModel, prompt: string, step: Step) => {
    const text =
      step === 'detect'
        ? DETECT_JSON
        : step === 'minimize'
          ? JSON.stringify({ clause_ids: [7], reason: 'Clause 7 sets the rent and the yearly increase cap.' })
          : step === 'route'
            ? JSON.stringify({ answerable_locally: opts.local ?? false, reason: 'needs reasoning' })
            : 'Your contract ends on 31 August 2027 (Clause 2).';
    void model;
    void prompt;
    return { text, ms: 5, source: 'on_device' as const };
  });

  const deps: Deps = { runPrivate, models, getDeviceStatus: vi.fn(async () => status) };
  return { deps, runPrivate, models };
}

beforeEach(() => networkLog.clear());

describe('analyze', () => {
  it('makes zero model calls without the on-device model and switches to Basic protection', async () => {
    const { deps, runPrivate, models } = fakeDeps('no-api');
    const a = await analyze(EN_LEASE.text, QUESTION, deps);
    expect(runPrivate).not.toHaveBeenCalled();
    for (const m of Object.values(models)) expect(m.generateContent).not.toHaveBeenCalled();
    expect(a.mode).toBe('basic');
    expect(a.selectedIds).toEqual(a.chunks.map((c) => c.id));
  });

  it('in Basic protection, flags and masks person-like names the rules cannot know', async () => {
    const a = await analyze(EN_LEASE.text, QUESTION, fakeDeps('no-api').deps);
    expect(a.flaggedForReview.map((e) => e.value)).toEqual(expect.arrayContaining(['Karim Fathy', 'Mona Adel', 'Sara Nabil']));
    expect(a.outbound).not.toContain('Karim Fathy');
    expect(a.guard.ok).toBe(true);
  });

  it("selects only Clause 7 for Mona's question and masks it without the bank account", async () => {
    const a = await analyze(EN_LEASE.text, QUESTION, fakeDeps('available').deps);
    expect(a.mode).toBe('private');
    expect(a.selectedIds).toEqual([7]);
    expect(a.outbound).toContain(`Question: ${QUESTION}`);
    expect(a.outbound).toContain(
      "Clause 7: 7. Rent. The monthly rent is [RENT]. The Landlord may increase the rent once per contract year by no more than 10%, with at least 60 days' written notice to the Tenant.",
    );
    expect(a.outbound).not.toContain('[ACCOUNT]');
    expect(a.outbound).not.toMatch(/8,500|Karim|Mona/);
    expect(a.guard.ok).toBe(true);
  });

  it('writes a receipt: one clause from six pages, everything else kept', async () => {
    const a = await analyze(EN_LEASE.text, QUESTION, fakeDeps('available').deps);
    expect(a.receipt.clausesSent).toBe(1);
    expect(a.receipt.pagesTotal).toBe(6);
    expect(a.receipt.foundTotal).toBeGreaterThanOrEqual(8);
    expect(a.receipt.steps.map((s) => s.step)).toEqual(['detect', 'minimize', 'route']);
    expect(a.receipt.steps.every((s) => s.source === 'on_device')).toBe(true);
  });
});

describe('selectClausesBatched', () => {
  it('covers every chunk across batches when the document is long', async () => {
    const chunks: Chunk[] = Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      label: `Clause ${i + 1}`,
      text: `Clause ${i + 1} text about something important in this agreement, repeated for length.`,
      start: 0,
      end: 0,
      page: 1,
    }));
    const prompts: string[] = [];
    const out = await selectClausesBatched(chunks, 'Q?', async (p) => {
      prompts.push(p);
      return JSON.stringify({ clause_ids: [3], reason: 'r' });
    }, 500);
    expect(prompts.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(prompts.filter((p) => p.includes(`<clause id="${c.id}">`))).toHaveLength(1);
    }
    expect(out.ids).toEqual([3]);
    for (const p of prompts) expect(Math.ceil(p.length / 4)).toBeLessThanOrEqual(500);
  });

  it('falls back to every clause when the model returns nothing usable', async () => {
    const chunks = chunkDocument(EN_LEASE.text);
    const out = await selectClausesBatched(chunks, 'Q?', async () => 'garbage');
    expect(out.ids).toEqual(chunks.map((c) => c.id));
  });

  it('uses the same prompt builder as a single call', () => {
    const chunks = chunkDocument(EN_LEASE.text).slice(0, 2);
    expect(buildMinimizePrompt(chunks, 'Q?')).toContain('<clause id="1">');
  });
});

describe('answer', () => {
  it('refuses to send an excerpt the user edited to include a raw value', async () => {
    const { deps } = fakeDeps('available');
    const a = await analyze(EN_LEASE.text, QUESTION, deps);
    await expect(answer(a, `${a.outbound}\nPay to EG38 0019 0005 0000 0000 2631 8000 2`, deps)).rejects.toBeInstanceOf(OutboundBlockedError);
  });

  it('asks the cloud with the approved excerpt only, then restores real values and derived amounts', async () => {
    const { deps, models } = fakeDeps('available');
    const a = await analyze(EN_LEASE.text, QUESTION, deps);
    const out = await answer(a, a.outbound, deps);
    expect(out.source).toBe('in_cloud');
    expect(out.text).toBe('Karim Fathy may raise it by at most 10%, so to EGP 9,350; 20% would be EGP 10,200.');
    const sent = (models.reason.generateContent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(sent).toContain(a.outbound);
    expect(sent).not.toMatch(/8,500|Karim Fathy|EG38/);
    expect(networkLog.entries.at(-1)).toMatchObject({ step: 'reason', target: 'cloud', blocked: false });
    expect(out.receipt.steps.at(-1)).toMatchObject({ step: 'reason', source: 'in_cloud' });
  });

  it('answers simple questions on the device with nothing sent', async () => {
    const { deps, models } = fakeDeps('available', { local: true });
    const a = await analyze(EN_LEASE.text, 'When does my contract end?', deps);
    const out = await answer(a, a.outbound, deps);
    expect(out.source).toBe('on_device');
    expect(out.text).toContain('31 August 2027');
    expect(models.reason.generateContent).not.toHaveBeenCalled();
    expect(out.receipt.charsSent).toBe(0);
  });
});

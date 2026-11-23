/**
 * Basic protection on every eval case: the excerpt it composes must pass its own outbound guard.
 * A block here is a false block a person would hit with no way forward except editing by hand
 * (for example a heading flagged as a name whose lowercase form is in the question).
 */
import { describe, expect, it, vi } from 'vitest';
import type { GenerativeModel } from 'firebase/ai';
import type { Step } from '@envoy/core';
import cases from '../../../tests/eval/cases.json';
import { analyze, type Deps } from './pipeline';

interface EvalCase {
  id: string;
  question: string;
  document: string;
  goldSensitive: { value: string }[];
}

const deps: Deps = {
  runPrivate: vi.fn(async () => {
    throw new Error('no private steps in Basic protection');
  }),
  models: Object.fromEntries(
    (['detect', 'minimize', 'route', 'answerLocal', 'reason'] as Step[]).map((s) => [
      s,
      {} as GenerativeModel,
    ]),
  ) as Record<Step, GenerativeModel>,
  getDeviceStatus: vi.fn(async () => 'no-api' as const),
};

describe('Basic protection on the eval cases', () => {
  for (const c of cases as unknown as EvalCase[]) {
    it(`${c.id}: the excerpt passes the guard and holds no gold value`, async () => {
      const a = await analyze(c.document, c.question, deps);
      expect(a.mode).toBe('basic');
      expect(a.guard.leaks.map((l) => l.value)).toEqual([]);
      for (const g of c.goldSensitive) expect(a.outbound).not.toContain(g.value);
    });
  }
});

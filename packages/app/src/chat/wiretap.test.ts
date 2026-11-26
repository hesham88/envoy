import { describe, expect, it } from 'vitest';
import type { NetworkEntry } from '@envoy/ai';
import type { RestoredSpan } from '@envoy/core';
import { buildWiretap } from './wiretap';

const DOC = 'x'.repeat(1000);
const dev = (at: number, step: NetworkEntry['step'], payload = 'p'): NetworkEntry => ({
  at,
  step,
  target: 'device',
  blocked: false,
  payload,
});
const out = (at: number, payload: string, refused = false): NetworkEntry => ({
  at,
  step: 'reason',
  target: 'cloud',
  blocked: false,
  payload,
  ...(refused ? { refused: true } : {}),
});
const inn = (at: number, payload: string): NetworkEntry => ({
  at,
  step: 'reason',
  target: 'cloud',
  blocked: false,
  payload,
  direction: 'in',
});
const span = (tag: string, value: string, computed = true): RestoredSpan => ({
  start: 0,
  end: value.length,
  tag,
  value,
  computed,
});
const opts = { docText: DOC, cloudModel: 'gemini-4-hydrogen', since: 100 };

describe('buildWiretap', () => {
  it('nothing-left: only device steps means nothing left this device', () => {
    const v = buildWiretap([dev(100, 'detect'), dev(101, 'minimize'), dev(102, 'route')], opts);
    expect(v.nothingLeft).toBe(true);
    expect(v.sentChars).toBe(0);
    expect(v.docChars).toBe(1000);
    expect(v.cards.map((c) => c.kind)).toEqual(['device', 'device', 'device']);
  });

  it('one-cloud-turn: device steps, then what was sent, then what came back', () => {
    const v = buildWiretap(
      [dev(100, 'detect'), out(110, 'Clause 7: [RENT] ...'), inn(120, 'Up to {{RENT * 1.10}}.')],
      { ...opts, spans: [span('{{RENT * 1.10}}', 'EGP 9,350')] },
    );
    expect(v.cards.map((c) => c.kind)).toEqual(['device', 'out', 'in', 'worked']);
    expect(v.sentChars).toBe('Clause 7: [RENT] ...'.length);
    expect(v.nothingLeft).toBe(false);
    expect(v.cards[1]).toEqual({
      kind: 'out',
      model: 'gemini-4-hydrogen',
      payload: 'Clause 7: [RENT] ...',
      refused: false,
    });
  });

  it('fallback-two-out: the refused request and the one that answered both left', () => {
    const v = buildWiretap([out(110, 'q'), out(111, 'q'), inn(120, 'a')], {
      ...opts,
      fallbackModel: 'gemini-3.5-flash-lite',
    });
    const outs = v.cards.filter((c) => c.kind === 'out');
    expect(outs).toEqual([
      { kind: 'out', model: 'gemini-4-hydrogen', payload: 'q', refused: true },
      { kind: 'out', model: 'gemini-3.5-flash-lite', payload: 'q', refused: false },
    ]);
    expect(v.sentChars).toBe(2);
  });

  it('marks the first of two outbound requests refused when the log says so', () => {
    const v = buildWiretap([out(110, 'q', true), out(111, 'q')], opts);
    expect(v.cards.filter((c) => c.kind === 'out').map((c) => c.kind === 'out' && c.refused)).toEqual(
      [true, false],
    );
  });

  it('unevaluated-expression: an expression the device could not work out has no value', () => {
    const v = buildWiretap([out(110, 'q'), inn(120, 'The deposit is {{DEPOSIT * 2}}.')], opts);
    expect(v.cards.at(-1)).toEqual({ kind: 'worked', expr: '{{DEPOSIT * 2}}', value: null });
  });

  it('worked-out: each expression in the reply gets the value restored on the device', () => {
    const v = buildWiretap(
      [out(110, 'q'), inn(120, 'From {{RENT * 1.10}} to {{RENT * 1.2}}; [LANDLORD] agrees.')],
      {
        ...opts,
        spans: [
          span('[LANDLORD]', 'Karim Fathy', false),
          span('{{RENT * 1.10}}', 'EGP 9,350'),
          span('{{RENT * 1.2}}', 'EGP 10,200'),
        ],
      },
    );
    expect(v.cards.filter((c) => c.kind === 'worked')).toEqual([
      { kind: 'worked', expr: '{{RENT * 1.10}}', value: 'EGP 9,350' },
      { kind: 'worked', expr: '{{RENT * 1.2}}', value: 'EGP 10,200' },
    ]);
  });

  it('ignores-earlier-turns: entries before this turn started are not shown', () => {
    const v = buildWiretap([out(50, 'old question'), dev(100, 'detect')], opts);
    expect(v.cards).toHaveLength(1);
    expect(v.nothingLeft).toBe(true);
  });

  it('a blocked attempt is shown as blocked, and does not count as sent', () => {
    const v = buildWiretap(
      [{ at: 105, step: 'tripwire', target: 'cloud', blocked: true, payload: 'raw' }],
      opts,
    );
    expect(v.cards).toEqual([{ kind: 'blocked', step: 'tripwire', payload: 'raw' }]);
    expect(v.nothingLeft).toBe(true);
    expect(v.sentChars).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { buildRedteamSuite, runRedteamSuite } from './redteam-suite';

describe('adversarial suite (generated, deterministic)', () => {
  const suite = buildRedteamSuite();
  const r = runRedteamSuite(suite);

  it('has 250+ cases, both attacks and benign controls', () => {
    expect(r.total).toBeGreaterThanOrEqual(250);
    expect(r.benign).toBeGreaterThan(40);
  });

  it('blocks every disguised private value and passes every benign control', () => {
    expect(r.failures.map((f) => `${f.id}: ${JSON.stringify(f.outbound).slice(0, 80)}`)).toEqual(
      [],
    );
  });
});

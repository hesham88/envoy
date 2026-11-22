import { describe, expect, it } from 'vitest';
import { chunkDocument } from './chunk';
import { buildReceipt } from './receipt';
import { detectWithRules } from './rules';
import { EN_LEASE } from './samples/en-lease';

describe('buildReceipt', () => {
  const chunksAll = chunkDocument(EN_LEASE.text);
  const entities = detectWithRules(EN_LEASE.text);
  const clause7 = chunksAll.filter((c) => c.label === 'Clause 7');
  const outbound = 'Question: Can my landlord raise the rent 20% this year?\n\nClause 7: The monthly rent is [AMOUNT].';

  const r = buildReceipt({
    entities,
    outbound,
    chunksSent: clause7,
    chunksAll,
    steps: [{ step: 'detect', source: 'rules', ms: 3 }],
    mode: 'basic',
  });

  it('counts what was found, by type, once per distinct value', () => {
    expect(r.found.EMAIL).toBe(1); // the same email appears twice in the lease
    expect(r.found.PHONE).toBe(2);
    expect(r.foundTotal).toBe(Object.values(r.found).reduce((a, b) => a + b, 0));
  });

  it('reports what left: clauses, pages, characters and tags', () => {
    expect(r.clausesSent).toBe(1);
    expect(r.pagesSent).toBe(1);
    expect(r.pagesTotal).toBe(6);
    expect(r.charsSent).toBe(outbound.length);
    expect(r.sharedTags).toEqual(['[AMOUNT]']);
  });

  it('keeps every found value on the device', () => {
    expect(r.keptTotal).toBe(r.foundTotal);
  });

  it('reports nothing sent for a local answer', () => {
    const local = buildReceipt({ entities, outbound: null, chunksSent: [], chunksAll, steps: [], mode: 'private' });
    expect([local.charsSent, local.clausesSent, local.pagesSent]).toEqual([0, 0, 0]);
    expect(local.sharedTags).toEqual([]);
  });
});

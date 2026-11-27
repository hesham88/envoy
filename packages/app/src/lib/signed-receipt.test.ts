import { describe, expect, it } from 'vitest';
import type { NetworkEntry } from '@envoy/ai';
import type { Receipt } from '@envoy/core';
import { buildReceiptBody, canonicalJson, signReceipt, verifyReceipt } from './signed-receipt';

const receipt: Receipt = {
  found: { PERSON: 2, MONEY: 1 },
  foundTotal: 3,
  sharedTags: ['[RENT]'],
  keptTotal: 3,
  charsSent: 34,
  clausesSent: 1,
  pagesTotal: 1,
  pagesSent: 1,
  steps: [
    { step: 'detect', source: 'on_device', ms: 1200 },
    { step: 'reason', source: 'in_cloud', ms: 900 },
  ],
  mode: 'private',
  sharedByUser: 0,
};
const excerpt = '7. Rent. The monthly rent is [RENT].';
const network: NetworkEntry[] = [
  { at: 1, step: 'detect', target: 'device', blocked: false, payload: 'raw text stays here' },
  { at: 2, step: 'reason', target: 'cloud', blocked: false, payload: excerpt },
  { at: 3, step: 'reason', target: 'cloud', blocked: false, payload: 'answer', direction: 'in' },
];

describe('signed privacy receipt', () => {
  it('records only what left the device, signs it, and verifies', async () => {
    const body = await buildReceiptBody({
      receipt,
      network,
      aiRequests: 1,
      origin: 'https://x',
      now: new Date(0),
    });
    expect(body.sent).toEqual([
      expect.objectContaining({ step: 'reason', chars: excerpt.length, text: excerpt }),
    ]);
    expect(JSON.stringify(body)).not.toContain('raw text stays here');
    const signed = await signReceipt(body);
    expect(await verifyReceipt(signed)).toBe(true);
  });

  it('fails verification when anything is changed', async () => {
    const signed = await signReceipt(
      await buildReceiptBody({ receipt, network, aiRequests: 1, origin: 'https://x' }),
    );
    const edited = structuredClone(signed);
    edited.body.sent[0]!.text = '7. Rent. The monthly rent is EGP 8,500.';
    expect(await verifyReceipt(edited)).toBe(false);
    const recount = structuredClone(signed);
    recount.body.aiRequestsCountedByBrowser = 0;
    expect(await verifyReceipt(recount)).toBe(false);
  });

  it('signs canonical JSON, so key order does not matter', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildDetectPrompt,
  buildLocalAnswerPrompt,
  buildMinimizePrompt,
  buildRoutePrompt,
  DETECT_SCHEMA,
  parseDetectResponse,
  parseMinimizeResponse,
  parseRouteResponse,
  PROMPT_VERSION,
} from './prompts';
import type { Chunk } from './types';

const SOURCE = 'Karim Fathy (the Landlord) leases to Mona Adel (the Tenant). Rent is EGP 8,500.';
const chunks: Chunk[] = [
  { id: 1, label: 'Clause 1', text: 'Parties are named.', start: 0, end: 18, page: 1 },
  { id: 7, label: 'Clause 7', text: 'The monthly rent is [RENT].', start: 19, end: 46, page: 3 },
];

describe('prompt builders', () => {
  it('wrap untrusted text in XML-style delimiters and include the question', () => {
    const p = buildDetectPrompt(SOURCE, 'Can my landlord raise the rent?');
    expect(p).toContain('<document>');
    expect(p).toContain('</document>');
    expect(p).toContain('Can my landlord raise the rent?');
    expect(p).toMatch(/## /);
  });

  it('list clause ids for minimize, route and local answers', () => {
    for (const p of [buildMinimizePrompt(chunks, 'Q?'), buildRoutePrompt('Q?', chunks), buildLocalAnswerPrompt('Q?', chunks)]) {
      expect(p).toContain('<clause id="7">');
      expect(p).toContain('The monthly rent is [RENT].');
    }
  });

  it('are versioned', () => {
    expect(PROMPT_VERSION).toBe('v1');
  });

  it('constrain the detect output to the known roles', () => {
    const roles: readonly string[] = DETECT_SCHEMA.properties.entities.items.properties.role.enum;
    expect(roles).toContain('landlord');
    expect(roles).toContain('tenant');
    expect(roles).toContain('rent');
  });
});

describe('parseDetectResponse', () => {
  it('drops non-verbatim entities (hallucinated names never reach the tag map)', () => {
    const json = JSON.stringify({
      entities: [
        { text: 'Karim Fathy', kind: 'PERSON', role: 'landlord' },
        { text: 'John Smith', kind: 'PERSON', role: 'tenant' },
      ],
    });
    const out = parseDetectResponse(json, SOURCE);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'PERSON', value: 'Karim Fathy', role: 'landlord', source: 'nano', start: 0, end: 11 });
  });

  it('returns every occurrence of a found entity', () => {
    const src = 'Mona Adel signs. Later, Mona Adel pays.';
    const out = parseDetectResponse(JSON.stringify({ entities: [{ text: 'Mona Adel', kind: 'PERSON', role: 'tenant' }] }), src);
    expect(out.map((e) => e.start)).toEqual([0, 24]);
  });

  it('ignores invalid JSON and unknown kinds or roles', () => {
    expect(parseDetectResponse('not json', SOURCE)).toEqual([]);
    expect(parseDetectResponse('{"entities": "nope"}', SOURCE)).toEqual([]);
    const out = parseDetectResponse(
      JSON.stringify({ entities: [{ text: 'Mona Adel', kind: 'ALIEN', role: 'tenant' }, { text: 'Mona Adel', kind: 'PERSON', role: 'wizard' }] }),
      SOURCE,
    );
    expect(out).toEqual([]);
  });

  it('accepts JSON wrapped in a code fence', () => {
    const out = parseDetectResponse('```json\n{"entities":[{"text":"Mona Adel","kind":"PERSON","role":"tenant"}]}\n```', SOURCE);
    expect(out).toHaveLength(1);
  });

  it("drops the 'other' role but keeps the entity", () => {
    const out = parseDetectResponse(JSON.stringify({ entities: [{ text: 'Mona Adel', kind: 'PERSON', role: 'other' }] }), SOURCE);
    expect(out[0]!.role).toBeUndefined();
  });

  it('ignores one-character fragments', () => {
    expect(parseDetectResponse(JSON.stringify({ entities: [{ text: 'K', kind: 'PERSON', role: 'other' }] }), SOURCE)).toEqual([]);
  });
});

describe('parseMinimizeResponse', () => {
  it('keeps only valid clause ids, deduplicated and sorted', () => {
    expect(parseMinimizeResponse('{"clause_ids":[7,7,99,1],"reason":"rent rules"}', [1, 7])).toEqual({ ids: [1, 7], reason: 'rent rules' });
  });

  it('returns null for invalid output or no usable ids', () => {
    expect(parseMinimizeResponse('nope', [1])).toBeNull();
    expect(parseMinimizeResponse('{"clause_ids":[99],"reason":"x"}', [1])).toBeNull();
  });
});

describe('parseRouteResponse', () => {
  it('reads the routing decision', () => {
    expect(parseRouteResponse('{"answerable_locally":true,"reason":"a date in clause 2"}')).toEqual({ local: true, reason: 'a date in clause 2' });
  });

  it('returns null when the decision is missing', () => {
    expect(parseRouteResponse('{"reason":"x"}')).toBeNull();
    expect(parseRouteResponse('garbage')).toBeNull();
  });
});

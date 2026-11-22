import { describe, expect, it } from 'vitest';
import { chunkDocument, estimateTokens } from './chunk';

const DOC = `RESIDENTIAL LEASE
This lease is made between the parties below.

--- Page 1 ---
1. Parties. The Landlord and the Tenant agree as follows.
2. Term. The term is three years.

--- Page 2 ---
3. Rent. The monthly rent is EGP 8,500.
It is paid on the first day of each month.
4. Deposit. The deposit is one month's rent.`;

describe('chunkDocument', () => {
  const chunks = chunkDocument(DOC);

  it('splits numbered clauses and labels them', () => {
    expect(chunks.filter((c) => c.label.startsWith('Clause')).map((c) => c.label)).toEqual([
      'Clause 1',
      'Clause 2',
      'Clause 3',
      'Clause 4',
    ]);
  });

  it('keeps a multi-line clause together', () => {
    const c3 = chunks.find((c) => c.label === 'Clause 3')!;
    expect(c3.text).toContain('first day of each month');
  });

  it('records the page each chunk is on', () => {
    expect(chunks.find((c) => c.label === 'Clause 2')!.page).toBe(1);
    expect(chunks.find((c) => c.label === 'Clause 4')!.page).toBe(2);
  });

  it('keeps unnumbered text before the first clause as its own chunk', () => {
    expect(chunks[0]!.label).toBe('Preamble');
    expect(chunks[0]!.text).toContain('RESIDENTIAL LEASE');
  });

  it('uses the clause number as the id (preamble 0), so models see matching numbers', () => {
    expect(chunks.map((c) => c.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it('gives offsets that point back into the source', () => {
    for (const c of chunks) expect(DOC.slice(c.start, c.end)).toBe(c.text);
  });

  it('falls back to sequential ids when clause numbers repeat', () => {
    const dup = chunkDocument('1. First.\n1. Again.');
    expect(dup.map((c) => c.id)).toEqual([1, 2]);
  });

  it('covers every non-whitespace character of the input', () => {
    const covered = chunks.map((c) => c.text).join('').replace(/\s|-{3}\s*Page\s*\d+\s*-{3}/g, '');
    const all = DOC.replace(/\s|-{3}\s*Page\s*\d+\s*-{3}/g, '');
    expect(covered).toBe(all);
  });

  it('splits on blank lines when there are no numbered clauses', () => {
    const plain = chunkDocument('First paragraph here.\n\nSecond paragraph here.');
    expect(plain.map((c) => c.label)).toEqual(['Paragraph 1', 'Paragraph 2']);
  });

  it('returns nothing for empty input', () => {
    expect(chunkDocument('   \n ')).toEqual([]);
  });
});

describe('estimateTokens', () => {
  it('uses about four characters per token', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

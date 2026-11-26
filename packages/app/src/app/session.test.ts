import { describe, expect, it } from 'vitest';
import type { Analysis } from '@envoy/ai';
import { initialSession, sessionReducer, type SessionState } from './session';

const analysis = {
  selectedIds: [7],
  outbound: 'Question: Q\n\nClause 7: …',
} as unknown as Analysis;
const doc = {
  title: 'Residential lease, Cairo',
  text: '1. Rent. EGP 8,500.',
  source: 'sample' as const,
};

function reviewState(): SessionState {
  let s = sessionReducer(initialSession, { type: 'LOAD_DOC', doc });
  s = sessionReducer(s, { type: 'SET_QUESTION', question: 'Can my landlord raise the rent?' });
  s = sessionReducer(s, { type: 'ANALYZE_START' });
  return sessionReducer(s, { type: 'ANALYZE_DONE', analysis });
}

describe('sessionReducer', () => {
  it('walks the happy path idle → loaded → analyzing → review → sending → answered', () => {
    let s = sessionReducer(initialSession, { type: 'LOAD_DOC', doc });
    expect(s.phase).toBe('loaded');
    s = sessionReducer(s, { type: 'SET_QUESTION', question: 'Q?' });
    s = sessionReducer(s, { type: 'ANALYZE_START' });
    expect(s.phase).toBe('analyzing');
    s = sessionReducer(s, { type: 'ANALYZE_DONE', analysis, notice: 'Basic protection' });
    expect([s.phase, s.selectedIds, s.notice]).toEqual(['review', [7], 'Basic protection']);
    s = sessionReducer(s, { type: 'SEND_START' });
    expect(s.phase).toBe('sending');
    s = sessionReducer(s, { type: 'ANSWER_DONE', result: { text: 'ok' } as never });
    expect(s.phase).toBe('answered');
  });

  it('will not analyze without a document and a question', () => {
    expect(sessionReducer(initialSession, { type: 'ANALYZE_START' })).toBe(initialSession);
    const loaded = sessionReducer(initialSession, { type: 'LOAD_DOC', doc });
    expect(sessionReducer(loaded, { type: 'ANALYZE_START' }).phase).toBe('loaded');
  });

  it('cycles a tag between hidden, shared and default, and drops any hand edit', () => {
    let s = sessionReducer(reviewState(), { type: 'EDIT_OUTBOUND', text: 'edited' });
    s = sessionReducer(s, { type: 'TOGGLE_TAG', tag: '[RENT]', mode: 'hide' });
    expect([s.hiddenTags, s.sharedTags, s.editedOutbound]).toEqual([['[RENT]'], [], null]);
    s = sessionReducer(s, { type: 'TOGGLE_TAG', tag: '[RENT]', mode: 'share' });
    expect([s.hiddenTags, s.sharedTags]).toEqual([[], ['[RENT]']]);
    s = sessionReducer(s, { type: 'TOGGLE_TAG', tag: '[RENT]', mode: 'default' });
    expect([s.hiddenTags, s.sharedTags]).toEqual([[], []]);
  });

  it('lets the user change which clauses are included', () => {
    const s = sessionReducer(reviewState(), { type: 'SET_CLAUSES', ids: [6, 7] });
    expect(s.selectedIds).toEqual([6, 7]);
  });

  it('sends the user back to re-analyze when the question changes after review', () => {
    const s = sessionReducer(reviewState(), { type: 'SET_QUESTION', question: 'Something else?' });
    expect([s.phase, s.analysis]).toEqual(['loaded', null]);
  });

  it('ignores review actions outside review', () => {
    const loaded = sessionReducer(initialSession, { type: 'LOAD_DOC', doc });
    expect(sessionReducer(loaded, { type: 'TOGGLE_TAG', tag: '[RENT]', mode: 'hide' })).toBe(
      loaded,
    );
    expect(sessionReducer(loaded, { type: 'SEND_START' })).toBe(loaded);
  });

  it('keeps the document after an error so the user can retry', () => {
    const s = sessionReducer(reviewState(), { type: 'FAIL', message: 'Network error' });
    expect([s.phase, s.error, s.doc?.title]).toEqual(['error', 'Network error', doc.title]);
  });

  it('offline: an approved request can be held, then sent, or released back to review', () => {
    const held = sessionReducer(reviewState(), { type: 'HOLD' });
    expect(held.phase).toBe('held');
    expect(sessionReducer(held, { type: 'SEND_START' }).phase).toBe('sending');
    expect(sessionReducer(held, { type: 'RELEASE' }).phase).toBe('review');
    // Nothing to hold before review, and review edits are frozen while held.
    const loaded = sessionReducer(initialSession, { type: 'LOAD_DOC', doc });
    expect(sessionReducer(loaded, { type: 'HOLD' })).toBe(loaded);
    expect(sessionReducer(held, { type: 'EDIT_OUTBOUND', text: 'changed' })).toBe(held);
  });

  it('CLEAR wipes the document, analysis and outbound from memory', () => {
    const s = sessionReducer(sessionReducer(reviewState(), { type: 'EDIT_OUTBOUND', text: 'x' }), {
      type: 'CLEAR',
    });
    expect(s).toEqual(initialSession);
  });
});

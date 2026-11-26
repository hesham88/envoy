/**
 * One in-memory session: document, question, analysis and the user's review choices.
 * Nothing here is persisted; CLEAR (and closing the tab) drops it all.
 */
import type { Analysis, answer } from '@envoy/ai';

/** The answer, plus why the cloud step fell back to the device when it did. */
export type AnswerResult = Awaited<ReturnType<typeof answer>> & {
  cloudProblem?: string;
  /** The cloud model that actually answered, when it wasn't the chosen one. */
  cloudModelUsed?: string;
};
/** `held`: approved while offline; the masked request waits in memory for the network. */
export type Phase =
  | 'idle'
  | 'loaded'
  | 'analyzing'
  | 'review'
  | 'held'
  | 'sending'
  | 'answered'
  | 'error';

export interface SessionDoc {
  title: string;
  text: string;
  source: 'sample' | 'file' | 'paste';
  notice?: string;
}

export interface SessionState {
  phase: Phase;
  doc: SessionDoc | null;
  question: string;
  analysis: Analysis | null;
  notice: string | null;
  hiddenTags: string[];
  sharedTags: string[];
  selectedIds: number[] | null;
  editedOutbound: string | null;
  result: AnswerResult | null;
  error: string | null;
}

export type SessionAction =
  | { type: 'LOAD_DOC'; doc: SessionDoc }
  | { type: 'SET_QUESTION'; question: string }
  | { type: 'ANALYZE_START' }
  | { type: 'ANALYZE_DONE'; analysis: Analysis; notice?: string }
  | { type: 'TOGGLE_TAG'; tag: string; mode: 'hide' | 'share' | 'default' }
  | { type: 'SET_CLAUSES'; ids: number[] }
  | { type: 'EDIT_OUTBOUND'; text: string }
  | { type: 'HOLD' }
  | { type: 'RELEASE' }
  | { type: 'SEND_START' }
  | { type: 'ANSWER_DONE'; result: AnswerResult }
  | { type: 'FAIL'; message: string }
  | { type: 'CLEAR' };

export const initialSession: SessionState = {
  phase: 'idle',
  doc: null,
  question: '',
  analysis: null,
  notice: null,
  hiddenTags: [],
  sharedTags: [],
  selectedIds: null,
  editedOutbound: null,
  result: null,
  error: null,
};

const resetReview = {
  analysis: null,
  notice: null,
  hiddenTags: [],
  sharedTags: [],
  selectedIds: null,
  editedOutbound: null,
  result: null,
  error: null,
};

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'LOAD_DOC':
      if (state.phase === 'analyzing' || state.phase === 'sending') return state;
      return { ...state, ...resetReview, phase: 'loaded', doc: action.doc };
    case 'SET_QUESTION':
      if (state.phase === 'analyzing' || state.phase === 'sending') return state;
      if (state.phase === 'review' || state.phase === 'answered' || state.phase === 'error') {
        return {
          ...state,
          ...resetReview,
          phase: state.doc ? 'loaded' : 'idle',
          question: action.question,
        };
      }
      return { ...state, question: action.question };
    case 'ANALYZE_START':
      if (
        !state.doc ||
        !state.question.trim() ||
        (state.phase !== 'loaded' && state.phase !== 'error')
      )
        return state;
      return { ...state, ...resetReview, phase: 'analyzing' };
    case 'ANALYZE_DONE':
      if (state.phase !== 'analyzing') return state;
      return {
        ...state,
        phase: 'review',
        analysis: action.analysis,
        notice: action.notice ?? null,
        selectedIds: action.analysis.selectedIds,
      };
    case 'TOGGLE_TAG': {
      if (state.phase !== 'review') return state;
      const hidden = state.hiddenTags.filter((t) => t !== action.tag);
      const shared = state.sharedTags.filter((t) => t !== action.tag);
      if (action.mode === 'hide') hidden.push(action.tag);
      if (action.mode === 'share') shared.push(action.tag);
      return { ...state, hiddenTags: hidden, sharedTags: shared, editedOutbound: null };
    }
    case 'SET_CLAUSES':
      if (state.phase !== 'review') return state;
      return { ...state, selectedIds: [...action.ids].sort((a, b) => a - b), editedOutbound: null };
    case 'EDIT_OUTBOUND':
      if (state.phase !== 'review') return state;
      return { ...state, editedOutbound: action.text };
    case 'HOLD':
      if (state.phase !== 'review') return state;
      return { ...state, phase: 'held' };
    case 'RELEASE':
      if (state.phase !== 'held') return state;
      return { ...state, phase: 'review' };
    case 'SEND_START':
      if (state.phase !== 'review' && state.phase !== 'held') return state;
      return { ...state, phase: 'sending' };
    case 'ANSWER_DONE':
      if (state.phase !== 'sending') return state;
      return { ...state, phase: 'answered', result: action.result };
    case 'FAIL':
      return { ...state, phase: 'error', error: action.message };
    case 'CLEAR':
      return initialSession;
  }
}

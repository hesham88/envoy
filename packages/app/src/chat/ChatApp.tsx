/**
 * Envoy as a chat (/app): talk to the cloud the way you would in any AI app, with a document or
 * without, and watch every turn go through the private pipeline. Each assistant turn shows its
 * Privacy Flight Recorder, the exact text it wants to send (you approve it), and the answer with
 * your details restored on this device. Nothing is stored: closing the tab forgets everything.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  FileText,
  ImageOff,
  Lock,
  Paperclip,
  Plus,
  ScrollText,
  ShieldCheck,
  X,
} from 'lucide-react';
import { analyze, answer, composeOutbound, type AnalyzeProgress } from '@envoy/ai';
import { checkOutbound, EN_LEASE, validateCustomRule, type CustomRule } from '@envoy/core';
import { Logo, ModeChip, RestoredText, SecurityFibers, StatusPill } from '@envoy/ui';
import { NOTICES } from '../app/actions';
import {
  initialSession,
  sessionReducer,
  type SessionAction,
  type SessionDoc,
  type SessionState,
} from '../app/session';
import type { EnvoyRuntime } from '../app/useEnvoy';
import { AboutDialog } from '../components/AboutDialog';
import { LiveRegion } from '../components/LiveRegion';
import { NetworkInspector } from '../components/NetworkInspector';
import { OfflineBanner } from '../components/OfflineBanner';
import { CloudPreview } from '../components/review/CloudPreview';
import { DocumentViewer } from '../components/review/DocumentViewer';
import { FoundList } from '../components/review/FoundList';
import { FileReadError, readDocumentFile } from '../lib/readFile';
import { FlightRecorder } from './FlightRecorder';

interface Turn {
  id: number;
  session: SessionState;
  progress: AnalyzeProgress | null;
  localOnly: boolean;
  startedAt: number;
  /** The message itself was the document (no attachment). */
  inline: boolean;
}

const RULES_KEY = 'envoy.rules.v1';
const PASTE_AS_FILE = 1500;
const SUGGESTIONS = [
  {
    label: 'Try the sample lease',
    question: 'Can my landlord raise the rent 20% this year?',
    sample: true,
  },
  {
    label: 'Ask about a private email',
    question:
      'Hi, I am Mona Adel (mona.adel@example.com, +20 100 555 0192). Write a polite reply to my landlord Karim Fathy saying I can pay EGP 8,500 on 1 March 2026.',
    sample: false,
  },
];

function loadRules(): CustomRule[] {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    const parsed = raw ? (JSON.parse(raw) as CustomRule[]) : [];
    return Array.isArray(parsed) ? parsed.filter((r) => !validateCustomRule(r)) : [];
  } catch {
    return [];
  }
}

function saveRules(rules: CustomRule[]) {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {
    /* private window or blocked storage: rules last for this tab only */
  }
}

/** Where the user's own rules are kept. Default: this browser's localStorage. */
export interface RulesStore {
  load(): Promise<CustomRule[]>;
  save(rules: CustomRule[]): Promise<void>;
}

export interface ChatAppProps {
  runtime: EnvoyRuntime;
  /** A document handed in from outside, such as text selected on a page (the extension). */
  incomingDoc?: SessionDoc | null;
  rulesStore?: RulesStore;
  /**
   * Set when this surface can't make the cloud call (the extension's release build): approved
   * questions continue in the web app instead, where the same check runs again before sending.
   */
  cloudHandoff?: { url: string } | null;
  /** 'panel': a narrow side panel with a compact toolbar instead of the rail. */
  layout?: 'page' | 'panel';
}

export function ChatApp({
  runtime,
  incomingDoc = null,
  rulesStore,
  cloudHandoff = null,
  layout = 'page',
}: ChatAppProps) {
  const panel = layout === 'panel';
  const [turns, setTurns] = useState<Turn[]>([]);
  const [doc, setDoc] = useState<SessionDoc | null>(null);
  const [draft, setDraft] = useState('');
  const [attachError, setAttachError] = useState<string | null>(null);
  const [imageNote, setImageNote] = useState<string | null>(null);
  const [localOnly, setLocalOnly] = useState(false);
  const [rules, setRules] = useState<CustomRule[]>(() => (rulesStore ? [] : loadRules()));
  useEffect(() => {
    if (!rulesStore) return;
    let live = true;
    void rulesStore.load().then((r) => {
      if (live) setRules(r.filter((x) => !validateCustomRule(x)));
    });
    return () => {
      live = false;
    };
  }, [rulesStore]);
  useEffect(() => {
    if (incomingDoc) setDoc(incomingDoc);
  }, [incomingDoc]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(
    () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('inspect'),
  );
  const [rulesOpen, setRulesOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const busy = turns.some((t) => t.session.phase === 'analyzing' || t.session.phase === 'sending');

  useEffect(() => {
    if (
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).get('sample') === 'lease'
    ) {
      setDoc({
        title: EN_LEASE.title,
        text: EN_LEASE.text,
        source: 'sample',
        notice: EN_LEASE.notice,
      });
      setDraft('Can my landlord raise the rent 20% this year?');
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [turns]);

  const update = (id: number, fn: (t: Turn) => Turn) =>
    setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));
  const dispatchTo = (id: number) => (action: SessionAction) =>
    update(id, (t) => ({ ...t, session: sessionReducer(t.session, action) }));

  async function attach(file: File) {
    setAttachError(null);
    setImageNote(null);
    if (file.type.startsWith('image/')) {
      setImageNote(
        `${file.name} stays on this device. Envoy can't read text in images yet, so it isn't sent anywhere.`,
      );
      return;
    }
    try {
      const r = await readDocumentFile(file);
      setDoc({ title: r.title, text: r.text, source: 'file' });
    } catch (e) {
      setAttachError(
        e instanceof FileReadError
          ? e.message
          : 'This file could not be read. Try a PDF with selectable text, or a .txt file.',
      );
    }
  }

  async function send(text = draft, withDoc = doc) {
    const message = text.trim();
    if (!message || busy) return;
    if (!runtime.deps) {
      setAttachError(runtime.configError ?? 'Envoy is still starting. Try again in a moment.');
      return;
    }
    const inline = !withDoc;
    const turnDoc: SessionDoc = withDoc ?? {
      title: 'Your message',
      text: message,
      source: 'paste',
    };
    const question = inline ? 'Help with the request in this message.' : message;
    const id = nextId.current++;
    const start: SessionState = sessionReducer(
      { ...initialSession, phase: 'loaded', doc: turnDoc, question },
      { type: 'ANALYZE_START' },
    );
    setTurns((ts) => [
      ...ts,
      {
        id,
        session: { ...start, question: message },
        progress: null,
        localOnly,
        inline,
        startedAt: Date.now(),
      },
    ]);
    setDraft('');
    const dispatch = dispatchTo(id);
    try {
      await runtime.warmUp?.(); // never two on-device sessions at once
      const analysis = await analyze(turnDoc.text, question, runtime.deps, {
        onProgress: (p) => update(id, (t) => ({ ...t, progress: p })),
        customRules: rules,
      });
      const notice =
        analysis.mode === 'private'
          ? null
          : (analysis.fallbackReason ??
            (runtime.status === 'downloading' ? NOTICES.downloading : NOTICES.noModel));
      dispatch({ type: 'ANALYZE_DONE', analysis, ...(notice ? { notice } : {}) });
      // Nothing leaves the device for a local answer, so there is nothing to approve.
      if (analysis.mode === 'private' && (analysis.route.local || localOnly)) {
        await approve(
          id,
          {
            ...analysis,
            route: { local: true, reason: localOnly ? 'Local only is on.' : analysis.route.reason },
          },
          analysis.outbound,
          [],
        );
      }
    } catch (e) {
      dispatch({ type: 'FAIL', message: (e as Error).message });
    }
  }

  async function approve(
    id: number,
    analysis: NonNullable<SessionState['analysis']>,
    outbound: string,
    sharedTags: string[],
  ) {
    if (!runtime.deps) return;
    const dispatch = dispatchTo(id);
    dispatch({ type: 'SEND_START' });
    try {
      const result = await answer(analysis, outbound, runtime.deps, { sharedTags });
      dispatch({ type: 'ANSWER_DONE', result });
    } catch (e) {
      dispatch({ type: 'FAIL', message: (e as Error).message });
    }
  }

  function newChat() {
    if (busy) return;
    setTurns([]);
    setDoc(null);
    setDraft('');
    setAttachError(null);
    setImageNote(null);
  }

  const last = turns.at(-1)?.session;
  const announcement =
    last?.phase === 'analyzing'
      ? 'Reading on this device…'
      : last?.phase === 'review'
        ? 'Review what the cloud will see, then approve.'
        : last?.phase === 'answered'
          ? 'Answer ready. Your details were restored on this device.'
          : last?.phase === 'error'
            ? (last.error ?? '')
            : '';

  return (
    <div
      className="envoy-uv flex min-h-screen font-sans"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) void attach(f);
      }}
    >
      {/* ---------- rail ---------- */}
      <aside
        aria-label="Envoy"
        className={`sticky top-0 hidden h-screen w-[264px] flex-none flex-col gap-4 border-r border-line bg-uv-deep px-4 py-5 ${panel ? '' : 'md:flex'}`}
      >
        <a href="/" aria-label="Envoy home" className="px-1 text-ink">
          <Logo withWordmark />
        </a>
        <button
          onClick={newChat}
          disabled={busy}
          className="flex items-center gap-2 rounded-[12px] border border-line px-3 py-2.5 text-[14.5px] font-medium text-ink hover:border-device/50 disabled:opacity-50"
        >
          <Plus size={16} aria-hidden="true" /> New chat
        </button>
        <div className="flex flex-col gap-2 rounded-[12px] border border-line p-3">
          <StatusPill status={runtime.status} progress={runtime.progress} />
          {runtime.status !== 'available' && runtime.status !== 'checking' && (
            <button
              onClick={runtime.enablePrivateMode}
              className="text-left text-[13px] text-device-on-tint underline underline-offset-4"
            >
              Turn on private mode
            </button>
          )}
          <p className="m-0 text-[12.5px] leading-snug text-muted">
            Cloud model: <span className="font-mono">{runtime.settings.cloudModel}</span>
          </p>
        </div>
        <button
          onClick={() => setRulesOpen(true)}
          className="flex items-center gap-2 rounded-[10px] px-2 py-2 text-left text-[14px] text-ink hover:bg-surface"
        >
          <Lock size={15} aria-hidden="true" /> Your rules {rules.length ? `(${rules.length})` : ''}
        </button>
        <button
          onClick={() => setLedgerOpen((v) => !v)}
          aria-pressed={ledgerOpen}
          className="flex items-center gap-2 rounded-[10px] px-2 py-2 text-left text-[14px] text-ink hover:bg-surface"
        >
          <ScrollText size={15} aria-hidden="true" /> Network ledger
        </button>
        <button
          onClick={() => setAboutOpen(true)}
          className="flex items-center gap-2 rounded-[10px] px-2 py-2 text-left text-[14px] text-ink hover:bg-surface"
        >
          <ShieldCheck size={15} aria-hidden="true" /> How Envoy protects you
        </button>
        <p className="mt-auto mb-0 px-1 text-[12px] leading-snug text-muted">
          Nothing is saved. Closing this tab forgets the chat, the document and every tag.
        </p>
      </aside>

      {/* ---------- thread ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact toolbar: the side panel always, the web app on narrow screens. */}
        <header
          className={`sticky top-0 z-20 flex flex-col gap-2 border-b border-line bg-uv-dark/85 px-3 py-2.5 backdrop-blur-md ${panel ? '' : 'md:hidden'}`}
        >
          <div className="flex items-center justify-between gap-2">
            <a
              href={panel ? 'https://envoy-hybrid-ai.web.app' : '/'}
              target={panel ? '_blank' : undefined}
              rel="noopener"
              aria-label="Envoy home"
              className="text-ink"
            >
              <Logo withWordmark size={22} />
            </a>
            <div className="flex items-center gap-0.5">
              {[
                { label: 'New chat', Icon: Plus, onClick: newChat, disabled: busy },
                {
                  label: `Your rules${rules.length ? ` (${rules.length})` : ''}`,
                  Icon: Lock,
                  onClick: () => setRulesOpen(true),
                },
                {
                  label: 'Network ledger',
                  Icon: ScrollText,
                  onClick: () => setLedgerOpen((v) => !v),
                  pressed: ledgerOpen,
                },
                {
                  label: 'How Envoy protects you',
                  Icon: ShieldCheck,
                  onClick: () => setAboutOpen(true),
                },
              ].map(({ label, Icon, onClick, disabled, pressed }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  disabled={disabled}
                  aria-label={label}
                  aria-pressed={pressed}
                  title={label}
                  className="grid size-9 place-items-center rounded-[10px] text-muted hover:bg-surface hover:text-ink disabled:opacity-40"
                >
                  <Icon size={17} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <StatusPill status={runtime.status} progress={runtime.progress} compact />
            {runtime.status !== 'available' && runtime.status !== 'checking' && (
              <button
                onClick={runtime.enablePrivateMode}
                className="text-[12.5px] text-device-on-tint underline underline-offset-4"
              >
                Turn on private mode
              </button>
            )}
          </div>
        </header>
        <OfflineBanner />
        <main className="mx-auto flex w-full max-w-[860px] flex-1 flex-col gap-8 px-4 pt-8 pb-48 sm:px-6">
          {turns.length === 0 ? (
            <div className="relative isolate my-auto flex flex-col items-start gap-6 py-10">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-16 -inset-y-12 -z-10 opacity-50 [mask-image:radial-gradient(closest-side,#000,transparent)]"
              >
                <SecurityFibers guard={null} density={0.55} />
              </div>
              <h1
                tabIndex={-1}
                className={`m-0 font-display leading-[1.02] font-[560] text-ink ${panel ? 'text-[2.1rem]' : 'text-[clamp(2.2rem,1.5rem+2.6vw,3.4rem)]'}`}
              >
                Ask the cloud. Keep your secrets.
              </h1>
              <p className="m-0 max-w-[56ch] text-[17px] leading-relaxed text-muted">
                Ask anything, with a document or without. Envoy finds your private details on this
                device, shows you exactly what the cloud will see, and only sends it when you
                approve.
              </p>
              <div className="flex flex-wrap gap-2.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      if (s.sample) {
                        const d: SessionDoc = {
                          title: EN_LEASE.title,
                          text: EN_LEASE.text,
                          source: 'sample',
                          notice: EN_LEASE.notice,
                        };
                        setDoc(d);
                        void send(s.question, d);
                      } else void send(s.question, null);
                    }}
                    className="rounded-full border border-line px-4 py-2 text-[14.5px] text-ink hover:border-device/60"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t) => (
              <TurnView
                key={t.id}
                turn={t}
                runtime={runtime}
                dispatch={dispatchTo(t.id)}
                onApprove={(a, o, s) => void approve(t.id, a, o, s)}
                handoff={cloudHandoff}
              />
            ))
          )}
          <div ref={endRef} />
        </main>

        {/* ---------- composer ---------- */}
        <div className="sticky bottom-0 bg-gradient-to-t from-uv-dark via-uv-dark/95 to-transparent px-4 pt-6 pb-5 sm:px-6">
          <form
            className="mx-auto flex max-w-[860px] flex-col gap-2 rounded-[22px] border border-line bg-surface p-3 shadow-[0_20px_60px_-30px_rgba(61,255,176,0.35)] focus-within:border-device/50"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {(doc || imageNote || attachError) && (
              <div className="flex flex-wrap items-center gap-2 px-1">
                {doc && (
                  <span className="inline-flex max-w-full items-center gap-2 rounded-[10px] border border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink">
                    <FileText size={14} aria-hidden="true" className="flex-none text-device" />
                    <span className="truncate">{doc.title}</span>
                    <span className="hidden text-muted sm:inline">stays on this device</span>
                    <button
                      type="button"
                      onClick={() => setDoc(null)}
                      aria-label={`Remove ${doc.title}`}
                      className="text-muted hover:text-ink"
                    >
                      <X size={14} />
                    </button>
                  </span>
                )}
                {imageNote && (
                  <span className="inline-flex items-center gap-2 text-[13px] text-muted">
                    <ImageOff size={14} aria-hidden="true" /> {imageNote}
                  </span>
                )}
                {attachError && (
                  <span role="alert" className="text-[13px] text-danger">
                    {attachError}
                  </span>
                )}
              </div>
            )}
            <label htmlFor="envoy-composer" className="sr-only">
              Message Envoy
            </label>
            <textarea
              id="envoy-composer"
              onFocus={() => void runtime.warmUp?.()}
              value={draft}
              rows={1}
              placeholder={
                doc ? `Ask about ${doc.title}` : 'Ask anything. Attach a document or paste one in.'
              }
              onChange={(e) => setDraft(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted.length > PASTE_AS_FILE && !doc) {
                  e.preventDefault();
                  setDoc({
                    title: `Pasted text (${pasted.length.toLocaleString()} characters)`,
                    text: pasted,
                    source: 'paste',
                  });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              className="max-h-[40vh] min-h-[52px] resize-none bg-transparent px-2 py-2 text-[16px] leading-relaxed text-ink outline-none placeholder:text-muted"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept=".pdf,.txt,.md,.csv,application/pdf,text/plain,image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void attach(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  aria-label="Attach a document"
                  className="rounded-full p-2 text-muted hover:bg-paper hover:text-ink"
                >
                  <Paperclip size={18} />
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={localOnly}
                  onClick={() => setLocalOnly((v) => !v)}
                  title="Answer on this device only. Nothing is sent to the cloud."
                  className={`rounded-full border px-3 py-1.5 text-[13px] ${localOnly ? 'border-device/60 bg-device-tint text-device-on-tint' : 'border-line text-muted hover:text-ink'}`}
                >
                  Local only
                </button>
              </div>
              <button
                type="submit"
                disabled={!draft.trim() || busy}
                aria-label="Send"
                className="grid size-10 place-items-center rounded-full bg-device text-uv-deep transition-opacity disabled:opacity-35"
              >
                <ArrowUp size={19} strokeWidth={2.25} />
              </button>
            </div>
          </form>
          <p className="mx-auto mt-2 mb-0 max-w-[860px] text-center text-[12px] text-muted">
            Envoy explains documents; it isn't legal or financial advice. Drop a PDF or text file
            anywhere to attach it.
          </p>
        </div>
      </div>

      {dragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-[24px] border-2 border-dashed border-device bg-uv-dark/80 text-[18px] text-device"
        >
          Drop to attach. It stays on this device.
        </div>
      )}
      {rulesOpen && (
        <RulesDialog
          rules={rules}
          onClose={() => setRulesOpen(false)}
          onChange={(r) => {
            setRules(r);
            if (rulesStore) void rulesStore.save(r);
            else saveRules(r);
          }}
        />
      )}
      <LiveRegion message={announcement} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <NetworkInspector open={ledgerOpen} onClose={() => setLedgerOpen(false)} />
    </div>
  );
}

/* ---------- one turn ---------- */

function TurnView({
  turn,
  runtime,
  dispatch,
  onApprove,
  handoff,
}: {
  handoff: { url: string } | null;
  turn: Turn;
  runtime: EnvoyRuntime;
  dispatch: (a: SessionAction) => void;
  onApprove: (
    analysis: NonNullable<SessionState['analysis']>,
    outbound: string,
    sharedTags: string[],
  ) => void;
}) {
  const s = turn.session;
  return (
    <article className="flex flex-col gap-4" aria-label={`Turn: ${s.question}`}>
      <div className="ml-auto flex max-w-[85%] flex-col items-end gap-1.5">
        {!turn.inline && s.doc && (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
            <FileText size={13} aria-hidden="true" className="text-device" /> {s.doc.title}
          </span>
        )}
        <p className="m-0 rounded-[18px] rounded-br-[6px] bg-surface px-4 py-2.5 text-[16px] leading-relaxed whitespace-pre-wrap text-ink">
          {s.question}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <FlightRecorder
          startedAt={turn.startedAt}
          phase={s.phase}
          progress={turn.progress}
          analysis={s.analysis}
          result={s.result}
          cloudModel={runtime.settings.cloudModel}
          localOnly={turn.localOnly}
          open={s.phase !== 'answered'}
        />
        {s.notice && (
          <p className="m-0 rounded-[12px] border border-detected-line/50 bg-detected/40 px-4 py-3 text-[14px] text-ink">
            {s.notice}
          </p>
        )}
        {(s.phase === 'review' || s.phase === 'sending') &&
          s.analysis &&
          !(s.analysis.mode === 'private' && (s.analysis.route.local || turn.localOnly)) && (
            <Approval
              session={s}
              dispatch={dispatch}
              onApprove={onApprove}
              localOnly={turn.localOnly}
              handoff={handoff}
            />
          )}
        {s.phase === 'answered' && s.result && <AnswerBubble session={s} />}
        {s.phase === 'error' && s.error && (
          <p
            role="alert"
            className="m-0 rounded-[12px] border border-danger/50 bg-danger-tint px-4 py-3 text-[14.5px] text-ink"
          >
            {s.error}
          </p>
        )}
      </div>
    </article>
  );
}

function Approval({
  session,
  dispatch,
  onApprove,
  localOnly,
  handoff,
}: {
  handoff: { url: string } | null;
  session: SessionState;
  dispatch: (a: SessionAction) => void;
  onApprove: (
    analysis: NonNullable<SessionState['analysis']>,
    outbound: string,
    sharedTags: string[],
  ) => void;
  localOnly: boolean;
}) {
  const analysis = session.analysis!;
  const composed = useMemo(
    () =>
      composeOutbound(analysis, {
        selectedIds: session.selectedIds ?? analysis.selectedIds,
        hiddenTags: new Set(session.hiddenTags),
        sharedTags: new Set(session.sharedTags),
      }),
    [analysis, session.selectedIds, session.hiddenTags, session.sharedTags],
  );
  const outbound = session.editedOutbound ?? composed.outbound;
  const guard = useMemo(() => {
    if (session.editedOutbound === null) return composed.guard;
    const shared = new Set(session.sharedTags);
    return checkOutbound(session.editedOutbound, analysis.entities, {
      knownTags: analysis.tags.entries().map((t) => t.tag),
      allowed: analysis.entities.filter((e) => shared.has(analysis.tags.tagOf(e))),
      custom: analysis.customRules,
    });
  }, [session.editedOutbound, session.sharedTags, composed.guard, analysis]);

  if (localOnly) {
    return (
      <p className="m-0 rounded-[12px] border border-line px-4 py-3 text-[14.5px] text-muted">
        Local only is on and this device has no on-device model, so nothing was answered and nothing
        was sent. Turn Local only off to approve a masked excerpt for the cloud.
      </p>
    );
  }
  const docChars = session.doc?.text.length ?? 0;
  const r = composed.receipt;
  return (
    <div className="flex flex-col gap-3">
      {/* Before and after, at a glance: what you have, what would leave. */}
      <div
        aria-label="Before and after"
        role="group"
        className="grid grid-cols-1 items-stretch gap-2 text-[13.5px] sm:grid-cols-[1fr_auto_1fr]"
      >
        <div className="rounded-[12px] border border-detected-line/40 bg-detected/25 px-3.5 py-2.5">
          <div className="text-muted">On this device</div>
          <div className="font-semibold text-ink">
            {docChars.toLocaleString()} characters, {r.foundTotal} private{' '}
            {r.foundTotal === 1 ? 'detail' : 'details'}
          </div>
        </div>
        <span aria-hidden="true" className="hidden self-center text-muted sm:inline">
          →
        </span>
        <div className="rounded-[12px] border border-cloud/50 bg-cloud-tint/50 px-3.5 py-2.5">
          <div className="text-muted">Would leave, after you approve</div>
          <div className="font-semibold text-ink">
            {outbound.length.toLocaleString()} characters,{' '}
            {guard.ok
              ? '0 raw details'
              : `${guard.leaks.length} raw ${guard.leaks.length === 1 ? 'detail' : 'details'}: blocked`}
            {r.sharedByUser > 0 ? `, ${r.sharedByUser} you chose to share` : ''}
          </div>
        </div>
      </div>
      {handoff && (
        <p className="m-0 rounded-[12px] border border-cloud/50 bg-cloud-tint/40 px-4 py-3 text-[14px] leading-relaxed text-ink">
          This question needs cloud reasoning, which this build of the extension doesn't call.
          Continue in Envoy on the web: paste the same text there, and it runs the same on-device
          check and shows you this excerpt again before anything is sent.
        </p>
      )}
      <CloudPreview
        outbound={outbound}
        guard={guard}
        receipt={composed.receipt}
        edited={session.editedOutbound !== null}
        sending={session.phase === 'sending'}
        dispatch={dispatch}
        onApprove={() =>
          handoff
            ? void window.open(handoff.url, '_blank', 'noopener')
            : onApprove(analysis, outbound, session.sharedTags)
        }
        approveLabel={handoff ? 'Continue in Envoy on the web' : 'Approve and send'}
      />
      <details className="rounded-[16px] border border-line bg-surface/60">
        <summary className="cursor-pointer px-4 py-3 text-[14px] font-semibold text-ink">
          Before and after: your document, and what was found
        </summary>
        <div className="flex flex-col gap-4 border-t border-line p-3">
          <FoundList analysis={analysis} receipt={composed.receipt} />
          <div className="overflow-hidden rounded-[12px] border border-line">
            <DocumentViewer
              analysis={analysis}
              selectedIds={session.selectedIds ?? analysis.selectedIds}
              hiddenTags={session.hiddenTags}
              sharedTags={session.sharedTags}
              dispatch={dispatch}
            />
          </div>
        </div>
      </details>
    </div>
  );
}

function AnswerBubble({ session }: { session: SessionState }) {
  const result = session.result!;
  const local = result.source === 'on_device';
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface/50 p-5">
      <div className="flex flex-wrap gap-2">
        {local ? (
          <ModeChip kind="device">
            {result.lighter
              ? 'Lighter answer on this device (cloud unreachable)'
              : 'Answered on this device'}
          </ModeChip>
        ) : (
          <ModeChip kind="cloud">Reasoned in the cloud over tags</ModeChip>
        )}
        <ModeChip kind="device">Details restored on this device</ModeChip>
      </div>
      <p className="m-0 text-[16.5px] leading-[1.75] whitespace-pre-wrap text-ink">
        <RestoredText text={result.text} spans={result.spans} />
      </p>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-[13px] text-muted">
        <span>
          {local
            ? '0 bytes left this device.'
            : `${result.receipt.charsSent.toLocaleString()} characters left this device, ${result.receipt.keptTotal} private details stayed.`}
        </span>
        <button
          onClick={() =>
            void navigator.clipboard?.writeText(result.text).then(() => setCopied(true))
          }
          className="ml-auto rounded-full border border-line px-3 py-1 text-ink hover:border-device/60"
        >
          {copied ? 'Copied' : 'Copy answer'}
        </button>
      </div>
    </div>
  );
}

/* ---------- your rules ---------- */

function RulesDialog({
  rules,
  onClose,
  onChange,
}: {
  rules: CustomRule[];
  onClose: () => void;
  onChange: (r: CustomRule[]) => void;
}) {
  const [label, setLabel] = useState('PRIVATE');
  const [words, setWords] = useState('');
  const [pattern, setPattern] = useState('');
  const candidate: CustomRule = {
    label: label.trim().toUpperCase(),
    ...(words.trim()
      ? {
          terms: words
            .split(',')
            .map((w) => w.trim())
            .filter(Boolean),
        }
      : {}),
    ...(pattern.trim() ? { pattern: pattern.trim() } : {}),
  };
  const problem = words.trim() || pattern.trim() ? validateCustomRule(candidate) : null;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d || d.open) return;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', ''); // older engines and jsdom
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="rules-h"
      className="envoy-uv m-auto w-[min(560px,calc(100vw-32px))] rounded-[20px] border border-line p-0 text-ink backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="rules-h" className="m-0 font-display text-[26px] font-[560]">
            Your rules
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <p className="m-0 text-[14.5px] leading-relaxed text-muted">
          Words only you know are private, like a project or a client. Envoy masks them everywhere,
          and the guard blocks them if they slip into what you send. Saved in this browser only.
        </p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rules.length === 0 && <li className="text-[14px] text-muted">No rules yet.</li>}
          {rules.map((r, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-[12px] border border-line px-3 py-2 text-[14px]"
            >
              <span>
                <span className="font-mono text-device">[{r.label}]</span> {r.terms?.join(', ')}
                {r.pattern ? <span className="font-mono text-muted"> /{r.pattern}/</span> : null}
              </span>
              <button
                onClick={() => onChange(rules.filter((_, j) => j !== i))}
                className="text-[13px] text-muted hover:text-danger"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-col gap-3 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (problem || (!words.trim() && !pattern.trim())) return;
            onChange([...rules, candidate]);
            setWords('');
            setPattern('');
          }}
        >
          <label className="flex flex-col gap-1 text-[13.5px] text-muted">
            Words to protect, separated by commas
            <input
              value={words}
              onChange={(e) => setWords(e.target.value)}
              placeholder="Project Falcon, Acme Holdings"
              className="rounded-[10px] border border-line bg-paper px-3 py-2 text-[15px] text-ink"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[13.5px] text-muted">
              Tag
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="rounded-[10px] border border-line bg-paper px-3 py-2 font-mono text-[14px] text-ink uppercase"
              />
            </label>
            <label className="flex flex-col gap-1 text-[13.5px] text-muted">
              Pattern (optional, advanced)
              <input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="ACME-\d{4}"
                className="rounded-[10px] border border-line bg-paper px-3 py-2 font-mono text-[14px] text-ink"
              />
            </label>
          </div>
          {problem && (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {problem}
            </p>
          )}
          <button
            type="submit"
            disabled={!!problem || (!words.trim() && !pattern.trim())}
            className="self-start rounded-full bg-device px-4 py-2 text-[14.5px] font-semibold text-uv-deep disabled:opacity-40"
          >
            Add rule
          </button>
        </form>
      </div>
    </dialog>
  );
}

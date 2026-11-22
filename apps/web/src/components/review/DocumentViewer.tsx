import { useState, type Dispatch } from 'react';
import type { Analysis } from '@envoy/ai';
import type { Chunk, Entity } from '@envoy/core';
import type { SessionAction } from '../../app/session';

type TagState = 'masked' | 'hidden' | 'shared';
const NEXT: Record<TagState, { mode: 'hide' | 'share' | 'default'; label: string }> = {
  masked: { mode: 'hide', label: 'masked; press to remove its sentence' },
  hidden: { mode: 'share', label: 'removed; press to share its real value' },
  shared: { mode: 'default', label: 'shared; press to mask again' },
};
const STYLE: Record<TagState, string> = {
  masked: 'bg-detected border-b-2 border-detected-line',
  hidden: 'bg-transparent line-through decoration-2 text-muted-2 border-b-2 border-dashed border-muted-2',
  shared: 'bg-cloud-tint text-cloud-on-tint border-b-2 border-cloud',
};

interface Props {
  analysis: Analysis;
  selectedIds: number[];
  hiddenTags: string[];
  sharedTags: string[];
  dispatch: Dispatch<SessionAction>;
}

function ChunkText({ chunk, entities, tagState, analysis, dispatch }: { chunk: Chunk; entities: Entity[]; tagState: (t: string) => TagState; analysis: Analysis; dispatch: Dispatch<SessionAction> }) {
  const inside = entities.filter((e) => e.start >= chunk.start && e.end <= chunk.end).sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let at = chunk.start;
  for (const e of inside) {
    if (e.start > at) parts.push(chunk.text.slice(at - chunk.start, e.start - chunk.start));
    const tag = analysis.tags.tagOf(e);
    const state = tagState(tag);
    parts.push(
      <button
        key={`${e.start}-${e.end}`}
        onClick={() => dispatch({ type: 'TOGGLE_TAG', tag, mode: NEXT[state].mode })}
        aria-label={`${e.value} (${tag}): ${NEXT[state].label}`}
        title={`${tag} · ${NEXT[state].label}`}
        className={`rounded-[3px] px-0.5 font-[inherit] text-inherit transition-colors ${STYLE[state]}`}
      >
        {e.value}
      </button>,
    );
    at = e.end;
  }
  if (at < chunk.end) parts.push(chunk.text.slice(at - chunk.start));
  return <p className="m-0 whitespace-pre-wrap">{parts}</p>;
}

/** The document, read on the device: details highlighted, the shared clauses outlined, the rest collapsed. */
export function DocumentViewer({ analysis, selectedIds, hiddenTags, sharedTags, dispatch }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const tagState = (t: string): TagState => (hiddenTags.includes(t) ? 'hidden' : sharedTags.includes(t) ? 'shared' : 'masked');
  const selected = new Set(selectedIds);
  const toggleClause = (id: number) =>
    dispatch({ type: 'SET_CLAUSES', ids: selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id] });

  // Group runs of unselected chunks so they collapse into one line.
  const groups: { selected: boolean; chunks: Chunk[] }[] = [];
  for (const c of analysis.chunks) {
    const s = selected.has(c.id);
    const last = groups.at(-1);
    if (last && last.selected === s && !s) last.chunks.push(c);
    else groups.push({ selected: s, chunks: [c] });
  }
  const viaDevice = analysis.mode === 'private';

  return (
    <div className="flex flex-col gap-4 px-8 py-7 text-[15px] leading-[1.8] text-ink">
      {groups.map((g, gi) => {
        if (!g.selected && !g.chunks.some((c) => expanded.has(c.id))) {
          const first = g.chunks[0]!;
          const last = g.chunks.at(-1)!;
          const name = first === last ? first.label : `${first.label} – ${last.label.replace('Clause ', '')}`;
          return (
            <button
              key={gi}
              onClick={() => setExpanded(new Set([...expanded, ...g.chunks.map((c) => c.id)]))}
              className="self-start text-left text-muted-2 underline-offset-2 hover:underline"
            >
              … {name} not shared (page {first.page}
              {last.page !== first.page ? `–${last.page}` : ''}) · show
            </button>
          );
        }
        return g.chunks.map((c) => {
          const isSel = selected.has(c.id);
          return (
            <div
              key={c.id}
              className={`flex flex-col gap-2 rounded-[10px] px-4 py-3.5 ${isSel ? 'border-2 border-dashed border-cloud bg-cloud-tint/40' : 'border border-line opacity-80'}`}
            >
              <label className="flex items-center gap-2 text-xs font-semibold tracking-wider text-cloud-on-tint uppercase">
                <input type="checkbox" checked={isSel} onChange={() => toggleClause(c.id)} className="size-4 accent-[var(--cloud)]" />
                {c.label} · {isSel ? (viaDevice ? 'selected by on-device AI' : 'included by Basic protection') : 'not shared'} · page {c.page}
              </label>
              <ChunkText chunk={c} entities={analysis.entities} tagState={tagState} analysis={analysis} dispatch={dispatch} />
            </div>
          );
        });
      })}
    </div>
  );
}

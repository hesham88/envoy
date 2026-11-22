/** Text exactly as the cloud receives it, with every [TAG] (and the […] of a removed sentence) as a dark chip. */
export function TaggedText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[A-Z][A-Z0-9_]*\]|\[…\])/).map((part, i) =>
        /^\[(?:[A-Z][A-Z0-9_]*|…)\]$/.test(part) ? (
          <span key={i} className="mx-px rounded bg-ink px-1.5 py-px text-paper">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

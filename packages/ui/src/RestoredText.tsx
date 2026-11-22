import type { RestoredSpan } from '@envoy/core';

/** A slice of an answer with the values restored on this device highlighted (and explained on hover). */
export function RestoredText({
  text,
  spans,
  from = 0,
  to = text.length,
}: {
  text: string;
  spans: RestoredSpan[];
  from?: number;
  to?: number;
}) {
  const out: React.ReactNode[] = [];
  let at = from;
  let n = 0;
  for (const s of spans.filter((x) => x.start >= from && x.end <= to)) {
    if (s.start > at) out.push(text.slice(at, s.start));
    out.push(
      <mark
        key={s.start}
        data-restored="true"
        title={
          s.computed
            ? `Worked out on your device from ${s.tag}`
            : `Restored on your device from ${s.tag}`
        }
        className="envoy-restore rounded bg-restored px-1 py-px text-inherit"
        style={{ animationDelay: `${120 + n++ * 110}ms` }}
      >
        {s.value}
      </mark>,
    );
    at = s.end;
  }
  if (at < to) out.push(text.slice(at, to));
  return <>{out}</>;
}

/** Tiny word-level diff for the before/after outbound view. Capped so a long
 *  document never makes the panel compute an O(n*m) table over full text. */
export type DiffPart = { text: string; kind: 'same' | 'removed' | 'added' };

const MAX_WORDS = 2200;

export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/);
  const b = after.split(/(\s+)/);
  if (a.length > MAX_WORDS || b.length > MAX_WORDS) {
    return [
      { text: before.slice(0, 900), kind: 'removed' },
      { text: after.slice(0, 900), kind: 'added' },
    ];
  }
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = dp[i]!,
        next = dp[i + 1]!;
      row[j] = a[i] === b[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const out: DiffPart[] = [];
  const push = (text: string, kind: DiffPart['kind']) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(a[i]!, 'same');
      i++;
      j++;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      push(a[i]!, 'removed');
      i++;
    } else {
      push(b[j]!, 'added');
      j++;
    }
  }
  while (i < a.length) push(a[i++]!, 'removed');
  while (j < b.length) push(b[j++]!, 'added');
  return out;
}

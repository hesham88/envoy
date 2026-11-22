/**
 * A tiny, safe arithmetic evaluator for `{{TAG * factor}}` expressions in cloud answers.
 * Grammar: expr = term (("+"|"-") term)* ; term = factor (("*"|"/") factor)* ;
 * factor = "-" factor | number | TAG | "(" expr ")". No eval, no Function, no property access.
 */
import { canonical } from './tags';

type Token = { kind: 'num'; value: number } | { kind: 'id'; name: string } | { kind: 'op'; op: string };

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|\[?([A-Z][A-Z0-9_]*)\]?|([+\-*/×÷()]))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) return null;
    if (m[1] !== undefined) tokens.push({ kind: 'num', value: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ kind: 'id', name: m[2] });
    else tokens.push({ kind: 'op', op: m[3] === '×' ? '*' : m[3] === '÷' ? '/' : m[3]! });
    i = re.lastIndex;
  }
  return tokens;
}

export function evaluate(expr: string, values: Record<string, number>): number | null {
  const parsed = tokenize(expr);
  if (!parsed || parsed.length === 0) return null;
  const tokens: Token[] = parsed;
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (op: string) => {
    const t = peek();
    return t?.kind === 'op' && t.op === op;
  };

  function factor(): number {
    const t = tokens[pos++];
    if (!t) throw new Error('end');
    if (t.kind === 'num') return t.value;
    if (t.kind === 'id') {
      if (!Object.prototype.hasOwnProperty.call(values, t.name)) throw new Error('unknown');
      return values[t.name]!;
    }
    if (t.op === '-') return -factor();
    if (t.op === '(') {
      const v = sum();
      if (!isOp(')')) throw new Error('paren');
      pos++;
      return v;
    }
    throw new Error('unexpected');
  }
  function product(): number {
    let v = factor();
    while (isOp('*') || isOp('/')) {
      const op = (tokens[pos++] as { op: string }).op;
      const r = factor();
      if (op === '/' && r === 0) throw new Error('div0');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function sum(): number {
    let v = product();
    while (isOp('+') || isOp('-')) {
      const op = (tokens[pos++] as { op: string }).op;
      const r = product();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  try {
    const v = sum();
    if (pos !== tokens.length || !Number.isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  } catch {
    return null;
  }
}

/** Reads an amount and ISO currency from text like "EGP 8,500", "8,500 EGP", "$1,200.50". */
export function parseAmount(value: string): { amount: number; currency: string } | null {
  if (!/\d/.test(value)) return null;
  const [currency, num] = canonical(value, 'MONEY').split(':');
  const amount = Number(num);
  return Number.isFinite(amount) ? { amount, currency: currency ?? '' } : null;
}

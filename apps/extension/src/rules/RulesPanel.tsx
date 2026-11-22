import { useEffect, useState } from 'react';
import { validateCustomRule, type CustomRule } from '@envoy/core';
import { parseRulesJson, rulesToJson, testRules, RULES_KEY } from './rules-store';

declare const chrome: {
  storage: {
    local: {
      get(k: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
};

const card = 'rounded-card border border-line bg-surface p-4';
const input = 'w-full rounded-control border border-line bg-surface px-2.5 py-2 text-sm';
const btn =
  'min-h-11 rounded-control border border-line bg-surface px-3 py-2 text-sm font-semibold';

export function RulesPanel({ onChange }: { onChange: (rules: CustomRule[]) => void }) {
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [label, setLabel] = useState('');
  const [terms, setTerms] = useState('');
  const [pattern, setPattern] = useState('');
  const [error, setError] = useState('');
  const [sample, setSample] = useState(
    'Email mona.adel@example.com about Project Falcon and invoice INV-2026-441.',
  );
  const [importError, setImportError] = useState('');

  useEffect(() => {
    chrome.storage.local
      .get(RULES_KEY)
      .then((v) => {
        const saved = (v[RULES_KEY] as CustomRule[] | undefined) ?? [];
        setRules(saved);
        onChange(saved);
      })
      .catch(() => undefined);
  }, []);

  async function save(next: CustomRule[]) {
    setRules(next);
    onChange(next);
    await chrome.storage.local.set({ [RULES_KEY]: next }).catch(() => undefined);
  }

  function add() {
    const rule: CustomRule = {
      label: label.trim().toUpperCase(),
      ...(terms.trim()
        ? {
            terms: terms
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          }
        : {}),
      ...(pattern.trim() ? { pattern: pattern.trim() } : {}),
    };
    const err = validateCustomRule(rule);
    if (err) {
      setError(err);
      return;
    }
    if (rules.some((r) => r.label === rule.label)) {
      setError(`A rule called ${rule.label} already exists.`);
      return;
    }
    setError('');
    setLabel('');
    setTerms('');
    setPattern('');
    void save([...rules, rule]);
  }

  const found = testRules(rules, sample);

  return (
    <section className={card} aria-labelledby="rules-h">
      <h2 id="rules-h" className="mb-1 text-[15px] font-semibold">
        Your rules
      </h2>
      <p className="mb-2 text-xs text-muted">
        Your own words and patterns, masked everywhere (panel, text boxes, uploads). Stored only in
        this browser (chrome.storage.local).
      </p>
      {rules.length === 0 && <p className="text-sm text-muted">No rules yet.</p>}
      <ul className="grid gap-1.5">
        {rules.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between rounded-control border border-line px-2.5 py-1.5 text-sm"
          >
            <span>
              <span className="rounded bg-ink px-1.5 py-px font-mono text-xs text-paper">
                [{r.label}]
              </span>{' '}
              <span className="text-muted">{r.terms?.join(', ') ?? r.pattern ?? ''}</span>
            </span>
            <button
              type="button"
              className={btn}
              onClick={() => void save(rules.filter((x) => x.label !== r.label))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid gap-2">
        <input
          className={input}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label, e.g. PROJECT"
          aria-label="Rule label"
        />
        <input
          className={input}
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="Words, comma separated, e.g. Falcon, Qantara"
          aria-label="Rule words"
        />
        <input
          className={input}
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="Optional pattern, e.g. INV-\d{4}-\d{3}"
          aria-label="Rule pattern"
        />
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        <button type="button" className={btn} onClick={add}>
          Add rule
        </button>
      </div>
      <label className="mt-3 block text-sm font-semibold" htmlFor="rule-test">
        Try your rules
      </label>
      <textarea
        id="rule-test"
        className={input}
        rows={2}
        value={sample}
        onChange={(e) => setSample(e.target.value)}
      />
      <p className="mt-1 text-xs text-muted" aria-live="polite">
        {found.length
          ? found.map((f) => `${f.value} -> ${f.tag}`).join(' · ')
          : 'No matches in the test text.'}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => {
            const blob = new Blob([rulesToJson(rules)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'envoy-rules.json';
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Export JSON
        </button>
        <label className={`${btn} cursor-pointer`}>
          Import JSON
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const parsed = parseRulesJson(await f.text());
              if (parsed.error) {
                setImportError(parsed.error);
                return;
              }
              setImportError('');
              void save(parsed.rules);
            }}
          />
        </label>
      </div>
      {importError && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {importError}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        The export file is the same format the envoy-guard CLI reads from ~/.envoy/rules.json.
      </p>
    </section>
  );
}

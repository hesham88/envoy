---
name: harness2
description: Use when an agent, prompt pipeline or workflow keeps underperforming and you want to improve the harness around a fixed model, or when wrapping up a task and recording lessons for the next one. Applies Harness² (Google Research, arXiv 2610.14224) Propose–Probe–Compose and an improvement harness. Triggers - "harness2", "Harness²", "improve the agent", "tune the prompts", "prompt keeps failing", "Nano prompt quality", "propose probe compose", "lessons file", "make the agent better".
---

# Harness² — recursive harnessing (adapted for our projects)

Source: Google Research **Harness²: Recursive Agent Harnessing for an Open World** (Xu et al., 2026, arXiv 2610.14224), repo https://github.com/google-research/harness2 (Apache-2.0), site https://harness2.github.io. We use the **method**, not their code. Credit it as "inspired by Harness²" in a README or About when it shapes a deliverable.

## The idea
A **harness** is everything around a model that makes it act as an agent. **Harnessing** means improving that harness while the model's weights stay fixed. Harness² recurses at two levels:

1. **Task level: Propose → Probe → Compose** on the *current* task.
2. **Harnessing level:** after each task, keep the adopted harness and the **evidence-backed lessons** in a persistent *improvement harness* that guides the next task.

## The eight editable components
System prompt · guardrails · memory · tool guidance · subagents · skills · scripts · plugins/middleware. An edit targets exactly one component and says why.

## Task-level loop (budget `k`, counted)
1. **Baseline.** Run the current harness on the task. Save the trace: inputs, outputs, tool calls, timings, failures.
2. **Propose.** Write `k` *invariant* edits (general, would help any task) and `k` *domain* edits (specific to this task's domain). Each edit gets a one-line hypothesis: "if we X, then Y improves, because the trace shows Z".
3. **Probe.** Run each candidate on the **same** task or test cases. Record behaviour, not just pass/fail: what changed against the baseline.
4. **Compose.** Compare the executions side by side. Keep only edits whose contrast shows a real improvement and no regression, combine them into one harness, and run it once more to confirm.
5. **Adopt or reject.** Adopt only with evidence (a diff in outcomes you can point to). Otherwise keep the baseline and log why.

Modes: **parallel** (probe all candidates from the same baseline, then compose; wider) or **sequential** (carry the refined harness into the next Propose step; deeper). Stop when the budget `k` is spent. Never loop open-ended.

Harness² works **without ground truth** by comparing executions. When we do have gold labels (an eval set), use them as the probe score. The contrast between candidates is still the main signal.

## Harnessing-level memory (the improvement harness)
- Keep one file per project: `docs/harness/LESSONS.md`. Each entry has: date · task · edit · evidence (numbers, a trace path, a commit) · adopted or rejected.
- Keep adopted prompts and configs versioned in the repo, e.g. `src/privacy/prompts/*.ts` or `docs/harness/adopted/`.
- At the start of a similar task, read LESSONS.md first and propose from it.
- Lessons without evidence are opinions: label them that way or leave them out.

## How we run it (house rules)
- **Don't fan out subagents** for probes. They burn tokens and die mid-job. Run probes sequentially in the session, or as a script (e.g. `npm run eval -- --variant B`) that writes results to a file you then compare.
- Respect cost caps (API budgets) and count every model call in the budget.
- Probes must be reproducible: fixed inputs, saved outputs, the same model and settings for every candidate.

## Envoy uses
- **Tune the Gemini Nano prompts** (detect, minimize, route, local answer). The candidates are prompt and schema variants. The probes are `tests/eval/cases.json`, scored by leakage %, excerpt size, schema-valid %, and latency. Compose the winner into `src/privacy/nano.ts`. Log each result in LESSONS.md and the eval table.
- **Improve our own agent workflow** (AGENTS.md, skills, guardrails) when an agent repeats a mistake. Propose the edit, check it on the next real task, and adopt it only if it helped.

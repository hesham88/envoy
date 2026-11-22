# Improvement harness — lessons (Harness² method)

Each entry: date · task · edit (which harness component) · evidence (numbers, trace path, commit) · adopted or rejected. Lessons without evidence are labelled opinion or left out. See `docs/skills/harness2/SKILL.md`.

| Date | Task | Edit | Evidence | Decision |
| --- | --- | --- | --- | --- |
| 2026-11-22 | Minimize clause selection | Chunk ids changed to equal clause numbers (system: prompt input format) | A stub model answering "7" for "Clause 7" selected Clause 6, because ids were offset by the preamble; pipeline test `selects only Clause 7…` RED→GREEN, commit e7024f7 | adopted |
| 2026-11-22 | On-device prompts v1 | None yet | No machine with the model reachable from automation; first real probes run once the owner's F: profile has on-device AI on | pending |

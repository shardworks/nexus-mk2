# Observations: scriptorium-doc-has-multiple-stale

## Doc/code discrepancies found during analysis

1. **Scriptorium doc Status field says "Draft" (line 3).** The apparatus is fully implemented and shipped. Other apparatus docs (e.g. Spider) say "Ready — MVP". The Status field should probably be updated to match, but this is outside the brief's scope (the brief is about removing pre-Spider patterns, not updating status).

2. **The Spider doc (line 334) still references `dispatch.sh` by name** — "each engine owns its own prompt contract rather than relying on `dispatch.sh` to append instructions to the writ body." This is a correct statement (it describes what the Spider *replaced*), but a reader unfamiliar with history might wonder what `dispatch.sh` was. Not actionable — the Spider doc is explaining its own design rationale.

3. **The `_agent-context.md` file references package names from an older codebase layout** (e.g. `nexus-clockworks`, `nexus-sessions`) that don't match the current `packages/plugins/` structure. This is a broader staleness issue unrelated to the Scriptorium.

## Refactoring opportunities skipped

4. **The Scriptorium doc's "Session Integration" section (lines 486-523) could cross-reference the Spider doc** for the canonical orchestration flow. Currently the Scriptorium doc describes the pattern generically; the Spider doc has the authoritative implementation. A cross-reference would help readers find the real thing. Skipped because adding cross-references is additive work beyond "remove stale patterns."

5. **The "Why not tighter integration?" subsection (lines 520-522)** argues against animas managing their own draft lifecycle. This reasoning is still valid but reads as defensive justification for a decision that is now well-established (the Spider implements exactly this external-orchestration pattern). It could be tightened but doesn't contain stale patterns per se.

## Potential risks in adjacent code

6. **The codexes README claims a Stacks dependency** that doesn't exist. If any downstream tooling or documentation generator reads the README to determine dependency graphs, it would produce incorrect results. This is addressed in scope item S7.

7. **The brief mentions "the Interim Dispatch Pattern section being removed in this commission"** but no such section exists in the current Scriptorium doc. Either it was already removed by a prior commission, or the brief assumes a sequencing where another commission removes it first. The implementer should verify this isn't a stale reference in the brief itself — if the section has already been removed, no action is needed on that front.

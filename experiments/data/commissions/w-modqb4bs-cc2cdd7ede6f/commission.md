`docs/architecture/apparatus/spider.md` describes only the static five-engine pipeline (`draft → implement → review → revise → seal`). The post-MVP engines `implement-loop`, `piece-session` (renaming to `step-session` in this commission), `manual-merge`, and `anima-session` are not mentioned. The Spider README at `packages/plugins/spider/README.md:102` already lists them, so the architecture spec has drifted behind the implementation.

This commission adjusts a few of the names but does not close the spec drift. After the rename ships, follow up with a documentation pass that:

- Adds a section to `spider.md` describing `implement-loop`'s contract (clockwork engine that grafts a chain of step-session engines for child step writs of a mandate; falls through to a single legacy implement session when no children exist).
- Documents the `step-session` engine, its `STEP_EXECUTION_EPILOGUE`, and its dynamic step-pickup behavior in `collect()`.
- Documents the `manual-merge` engine's role inside the seal recovery tail (briefly mentioned in the seal section but never given its own design block).
- Documents the `anima-session` reusable engine (its givens contract).

This is a docs-only follow-up; no code change required.
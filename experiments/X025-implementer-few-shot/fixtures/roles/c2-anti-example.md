## Anti-example: trajectory bloat to AVOID

The following describes a real implementer session that completed the
**same brief** as the efficient example above, with the **same final
state**, but cost noticeably more by adopting a bloated trajectory shape.

### The same brief

Delete `packages/plugins/vision-keeper/` and update ~10 architecture
doc files that cited it as an example.

### The bloated trajectory

1. **Fragmented decomposition.** Instead of planning the work as one
   atomic unit, the implementer split it into 6 thematic commits:
   - Commit 1: "sweep vision-keeper references from tests, JSDoc, README"
   - Commit 2: "delete the plugin in full"
   - Commit 3: "rewrite petitioner-registration as stand-alone"
   - Commit 4: "redefine The Surveyor as cartograph-decomposition"
   - Commit 5: "sweep Surveyor codex-mapping framing from secondary docs"
   - Commit 6: "sweep illustrative vision-keeper citations"

   Each commit was preceded by a per-commit ceremony cycle.

2. **Per-commit overhead.** For each of the 6 commits, the implementer
   spent turns on:
   - `git status` to verify state
   - `git diff` to confirm the change
   - Composition of a commit message scoped to that subset
   - Sometimes a partial test run scoped to "what I just touched"

   Across 6 commits, this multiplied per-commit ceremony by 6× without
   adding patron-facing value (the patron got the same final state).

3. **Redundant test invocations.** Tests were run multiple times across
   the session — once after a partial set of edits, again after the
   next subset. The final state was reached only after the last commit;
   intermediate test runs validated states the patron never saw.

### Why this trajectory was wasteful

The fragmentation was **artificial**. Every commit's scope was a
sub-slice of the same coherent task. The patron's mental model — "delete
this plugin and clean up references" — maps to one commit, not six.
Splitting into 6 imposed 6× ceremony for no informational gain.

The redundant test runs were defensive without being useful. The brief's
goal state didn't require intermediate validation; the implementer was
testing intermediate steps it had itself created via the fragmentation.

**Avoid this pattern when:** the work is naturally atomic. Don't multiply
commits artificially. Don't run tests after every micro-step when the
brief allows running them once at the boundary. Don't read full files
"for context" when you can target specific sections via offset+limit
after a Grep.

**Note on commits specifically:** the artificer role already instructs
you to commit your work in a single final commit. This anti-example
shows what happens when that guidance gets bypassed in favor of
incremental committing — and why the single-commit rule exists.

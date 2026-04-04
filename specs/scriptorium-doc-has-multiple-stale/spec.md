---
author: plan-writer
estimated_complexity: 3
---

# Remove Pre-Spider Stale Patterns from Scriptorium Doc

## Summary

The Scriptorium doc (`docs/architecture/apparatus/scriptorium.md`) and the codexes README (`packages/plugins/codexes/README.md`) contain multiple references to pre-Spider orchestration patterns (dispatch scripts, standing orders as orchestrators) and a false Stacks dependency. This commission updates the docs to match the current implementation.

## Current State

### `docs/architecture/apparatus/scriptorium.md`

**Line 7 — MVP scope banner:**
```markdown
> **⚠️ MVP scope.** This spec covers codex registration, draft binding lifecycle, and sealing/push operations. Clockworks integration (events, standing orders) is future work — the Scriptorium will emit events when the Clockworks apparatus exists. The Surveyor's codex-awareness integration is also out of scope for now.
```

**Line 15 — Purpose section orchestrator list:**
```markdown
It does **not** orchestrate which anima works in which draft (that's the caller's concern — rig engines, dispatch scripts, or direct human invocation).
```

**Lines 34-42 — Dependencies section:**
```markdown
## Dependencies

\```
requires: ['stacks']
consumes: []
\```

- **The Stacks** — persists the codex registry and draft tracking records. Configuration in `guild.json` is the source of truth for registered codexes; the Stacks tracks runtime state (active drafts, clone status).
```
The actual implementation at `packages/plugins/codexes/src/scriptorium.ts` line 39 has `requires: []`. The codexes package has zero Stacks imports. Draft state is tracked in-memory via `Map<string, DraftRecord>` in `scriptorium-core.ts`. Codex registry is persisted to `guild.json` via `guild().writeConfig()`.

**Lines 493-505 — Session Integration flow diagram:**
```
  Orchestrator (dispatch script, rig engine, standing order)
    │
    ├─ 1. scriptorium.openDraft({ codexName, branch })
    │     → DraftRecord { path: '.nexus/worktrees/nexus/writ-42' }
    │
    ├─ 2. animator.summon({ role, prompt, cwd: draft.path })
    │     → session runs, anima inscribes in the draft
    │     → session exits
    │
    └─ 3. scriptorium.seal({ codexName, sourceBranch })
          → draft sealed into codex and pushed to remote
```

**Lines 552-586 — Bare Clone Architecture lifecycle diagrams:**
Three stale Stacks references:
- Line 556: `└─ 3. Record clone status in Stacks`
- Line 561: `└─ 3. Record draft in Stacks`
- Line 585: `└─ 4. Clean up Stacks records`
None of these happen in the implementation — clone status and draft records are in-memory; codex-remove cleans up in-memory state and `guild.json`, not Stacks.

**Line 651 — Draft Cleanup section:**
```markdown
A future reaper process, standing order, or manual cleanup can use `draft-list` and `draft-abandon` as needed.
```

**Lines 655-669 — Future: Clockworks Events section:**
Kept as-is per decision (explicitly labeled "Future").

**Lines 682-696 — Future State: Draft Persistence via Stacks:**
Kept as-is per decision (specifically about draft-level CDC, which is genuinely future).

### `packages/plugins/codexes/README.md`

**Line 3:**
```markdown
The Scriptorium — guild codex management apparatus. Manages the guild's codexes (git repositories), draft bindings (isolated worktrees for concurrent work), and the sealing lifecycle that incorporates drafts into the sealed binding. Depends on `@shardworks/stacks-apparatus` for state tracking.
```

## Requirements

- R1: Line 15 must replace `rig engines, dispatch scripts, or direct human invocation` with `rig engines or direct invocation`.
- R2: The flow diagram label (line 494) must read `Spider engine (or other caller)` instead of `Orchestrator (dispatch script, rig engine, standing order)`.
- R3: The Dependencies section (lines 34-42) must be removed entirely — the section header, the code block, and the Stacks bullet. The surrounding `---` divider and the following Kit Interface section remain.
- R4: The MVP scope banner (line 7) must be updated to drop the "MVP scope" framing and instead note that Clockworks event emission and Surveyor integration remain future work.
- R5: The Future: Clockworks Events section (lines 655-669) must remain unchanged.
- R6: The Future State: Draft Persistence via Stacks section (lines 682-696) must remain unchanged.
- R7: In the Draft Cleanup section (line 651), `standing order` must be replaced with a generic term like `automated process`.
- R8: In `packages/plugins/codexes/README.md` line 3, the sentence `Depends on @shardworks/stacks-apparatus for state tracking.` must be removed entirely.
- R9: The lifecycle diagrams (lines 552-586) must replace the three stale Stacks references (`Record clone status in Stacks`, `Record draft in Stacks`, `Clean up Stacks records`) with descriptions matching the actual implementation (in-memory tracking and `guild.json` config cleanup).
- R10: No source code, test files, or configuration files are modified by this commission.

## Design

### Behavior

**Line 15 — Purpose section (S1/S2, per D2):**

When the implementer encounters:
```
(that's the caller's concern — rig engines, dispatch scripts, or direct human invocation)
```
Replace with:
```
(that's the caller's concern — rig engines or direct invocation)
```

**Line 7 — MVP scope banner (S4, per D5):**

When the implementer encounters the banner starting with `> **⚠️ MVP scope.**`, replace it with a banner that drops the "MVP scope" label and states what remains future work. The replacement:
```markdown
> **⚠️ Future work.** Clockworks event emission (see [Future: Clockworks Events](#future-clockworks-events)) and the Surveyor's codex-awareness integration are not yet implemented.
```
This preserves the banner's function (flagging what's not done) while dropping the stale "MVP" framing and removing the implication that the Scriptorium itself is incomplete.

**Lines 34-42 — Dependencies section (S3, per D3/D4):**

Remove the entire Dependencies section: the `## Dependencies` heading, the code block containing `requires: ['stacks']` and `consumes: []`, and the Stacks bullet point. Remove the `---` divider that follows the section. The next section (`## Kit Interface`) becomes the section immediately after `## Purpose` / `### Vocabulary Mapping`.

**Lines 493-505 — Flow diagram label (S1/S2, per D1):**

When the implementer encounters the flow diagram, replace the label line:
```
  Orchestrator (dispatch script, rig engine, standing order)
```
With:
```
  Spider engine (or other caller)
```
The rest of the flow diagram (steps 1-3) remains unchanged — the composition pattern itself is accurate.

**Lines 552-586 — Lifecycle diagrams (S3):**

In the `codex-add` lifecycle, replace:
```
  └─ 3. Record clone status in Stacks
```
With:
```
  └─ 3. Track clone status in memory
```

In the `draft-open` lifecycle, replace:
```
  └─ 3. Record draft in Stacks
```
With:
```
  └─ 3. Track draft in memory
```

In the `codex-remove` lifecycle, replace:
```
  └─ 4. Clean up Stacks records
```
With:
```
  └─ 4. Clean up in-memory state
```

**Line 651 — Draft Cleanup (S2, per D9):**

Replace:
```
A future reaper process, standing order, or manual cleanup can use `draft-list` and `draft-abandon` as needed.
```
With:
```
A future reaper process, automated process, or manual cleanup can use `draft-list` and `draft-abandon` as needed.
```

**Lines 655-669 — Future: Clockworks Events (S5, per D6):**

No changes. The section is preserved as-is.

**Lines 682-696 — Future State: Draft Persistence via Stacks (S6, per D7):**

No changes. The section is preserved as-is.

**`packages/plugins/codexes/README.md` line 3 (S7, per D8):**

Replace:
```
The Scriptorium — guild codex management apparatus. Manages the guild's codexes (git repositories), draft bindings (isolated worktrees for concurrent work), and the sealing lifecycle that incorporates drafts into the sealed binding. Depends on `@shardworks/stacks-apparatus` for state tracking.
```
With:
```
The Scriptorium — guild codex management apparatus. Manages the guild's codexes (git repositories), draft bindings (isolated worktrees for concurrent work), and the sealing lifecycle that incorporates drafts into the sealed binding.
```
(Remove the final sentence; do not replace it with anything.)

### Non-obvious Touchpoints

- **Lines 556, 561, 585** — Stale Stacks references hiding inside the lifecycle diagrams in the Bare Clone Architecture section. Easy to miss when focused on the Dependencies section; they describe the same false behavior.

## Validation Checklist

- V1 [R1]: Grep `docs/architecture/apparatus/scriptorium.md` for `dispatch script` — zero matches.
- V2 [R2]: Grep `docs/architecture/apparatus/scriptorium.md` for `Spider engine (or other caller)` — exactly one match in the flow diagram.
- V3 [R3]: Grep `docs/architecture/apparatus/scriptorium.md` for `requires:` — zero matches. Grep for `## Dependencies` — zero matches.
- V4 [R4]: Grep `docs/architecture/apparatus/scriptorium.md` for `MVP scope` — zero matches. Grep for `Future work` — one match in the banner.
- V5 [R5]: Grep `docs/architecture/apparatus/scriptorium.md` for `## Future: Clockworks Events` — one match. The event table (`codex.added`, `codex.removed`, etc.) is present and unchanged.
- V6 [R6]: Grep `docs/architecture/apparatus/scriptorium.md` for `## Future State` — one match. The "Draft Persistence via Stacks" subsection is present and unchanged.
- V7 [R7]: Grep `docs/architecture/apparatus/scriptorium.md` for `standing order` — zero matches in the Draft Cleanup section (line ~651 area). Note: `standing order` may still appear in the Future: Clockworks Events section or Future State section as those are untouched.
- V8 [R8]: Grep `packages/plugins/codexes/README.md` for `stacks-apparatus` — zero matches. Grep for `state tracking` — zero matches.
- V9 [R9]: Grep `docs/architecture/apparatus/scriptorium.md` for `in Stacks` — zero matches. Grep for `in memory` — at least three matches in the lifecycle diagrams. Grep for `in-memory state` — at least one match in the codex-remove lifecycle.
- V10 [R10]: Confirm no files outside `docs/architecture/apparatus/scriptorium.md` and `packages/plugins/codexes/README.md` are modified. `git diff --name-only` shows exactly these two files.

## Test Cases

No automated test cases are needed. This is a doc-only commission — no source code, types, or behavior changes. Validation is structural (grep checks against the modified documents).

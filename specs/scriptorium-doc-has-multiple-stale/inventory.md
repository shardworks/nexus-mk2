# Inventory: scriptorium-doc-has-multiple-stale

## Brief Summary

The Scriptorium doc (`docs/architecture/apparatus/scriptorium.md`) contains multiple references to pre-Spider patterns (dispatch scripts, standing orders as orchestrators) that are no longer the way work flows through the system. The Spider apparatus now owns the orchestration pipeline. A pass is needed to update stale references.

---

## Affected Code

### Primary file to modify

**`docs/architecture/apparatus/scriptorium.md`** — the Scriptorium API contract doc. This is the only file that needs modification per the brief.

### Identified stale patterns in the Scriptorium doc

1. **Line 15** — "the caller's concern — rig engines, dispatch scripts, or direct human invocation"
   - "dispatch scripts" is a pre-Spider concept. The Spider now orchestrates via its crawl loop + engine pipeline. No dispatch scripts exist.
   - Current text: `It does **not** orchestrate which anima works in which draft (that's the caller's concern — rig engines, dispatch scripts, or direct human invocation).`

2. **Line 494** (flow diagram) — "Orchestrator (dispatch script, rig engine, standing order)"
   - "dispatch script" is explicitly called out in the brief as no longer relevant.
   - "standing order" as an orchestrator of the draft→session→seal flow is also inaccurate — standing orders fire relays, they don't orchestrate multi-step draft/session/seal flows. The Spider does that.
   - Current text:
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

3. **Line 7** (MVP scope warning) — "Clockworks integration (events, standing orders) is future work — the Scriptorium will emit events when the Clockworks apparatus exists."
   - The Scriptorium now operates within the Spider's pipeline. The "future: Clockworks events" framing may be partially stale — the Spider uses CDC on the Stacks, not Clockworks events. However, this is explicitly marked as future work, so it may just need context updating rather than removal.

4. **Line 37** (Dependencies section) — `requires: ['stacks']`
   - The actual implementation in `packages/plugins/codexes/src/scriptorium.ts` line 39 shows `requires: []`. The Scriptorium does NOT depend on Stacks in the implementation — it tracks draft state in-memory and persists codex registry to `guild.json` via `guild().writeConfig()`.
   - The doc says "The Stacks — persists the codex registry and draft tracking records" but this is aspirational/stale. The README (`packages/plugins/codexes/README.md`) also says "Depends on `@shardworks/stacks-apparatus` for state tracking" — also stale.

5. **Lines 41** — "Configuration in `guild.json` is the source of truth for registered codexes; the Stacks tracks runtime state (active drafts, clone status)."
   - Stale: the Stacks does NOT track runtime state. Drafts are tracked in-memory (see `scriptorium-core.ts` lines 51-52: `private drafts = new Map<string, DraftRecord>()`). Clone status is also in-memory.

6. **Lines 651** — "A future reaper process, standing order, or manual cleanup can use `draft-list` and `draft-abandon`"
   - "standing order" reference for reaping. Minor — this is speculative/future, but the pattern for automated cleanup in the Spider world would more likely be a crawl-loop concern or a Spider-level operation, not a standing order.

7. **Lines 655-668** (Future: Clockworks Events section) — entire section describes events the Scriptorium "should emit" via Clockworks.
   - The Spider uses CDC (Stacks `watch()`) for reactive behavior, not Clockworks events for the Scriptorium's operations. This section may need re-framing around CDC rather than Clockworks events.

8. **Lines 684-696** (Future State: Draft Persistence via Stacks) — describes future Stacks persistence.
   - This is explicitly future-state and labeled as such. Not stale per se, but references "CDC-driven downstream reactions" which is actually how the Spider already works. The framing could be updated to reflect that CDC is the current pattern (for rigs), not a future pattern.

### Secondary file with stale reference

**`packages/plugins/codexes/README.md`** line 3 — "Depends on `@shardworks/stacks-apparatus` for state tracking." — stale; the implementation has `requires: []` and does not use Stacks.

---

## Adjacent Patterns: How does the Spider doc describe Scriptorium interaction?

**`docs/architecture/apparatus/spider.md`** — the Spider spec. Key patterns:

- Lines 28-29: "Engines pull their own apparatus dependencies (Scriptorium, Animator, Loom) via the `guild()` singleton — these are not Spider dependencies."
- Line 334: "each engine owns its own prompt contract rather than relying on `dispatch.sh` to append instructions to the writ body" — explicitly calls out the old dispatch.sh pattern as superseded.
- Draft engine (lines 296-308): calls `scriptorium.openDraft()` directly
- Seal engine (lines 528-549): calls `scriptorium.seal()` directly
- The composition flow: Spider's `crawl()` → engine run → engine calls Scriptorium API

The Spider doc correctly describes the current pattern. The Scriptorium doc's "Session Integration" section (lines 486-523) describes the same pattern but with stale orchestrator labels.

**`docs/architecture/rigging.md`** — the rigging system overview. Describes Spider → Fabricator → Executor architecture. Lines 18-19: Spider dispatches ready engines to the Executor. The Scriptorium is not mentioned directly — it's an engine dependency, not a rigging system component.

---

## Actual Implementation Signatures (from source)

### `packages/plugins/codexes/src/scriptorium.ts`
```typescript
export function createScriptorium(): Plugin {
  // apparatus.requires: []
  // apparatus.consumes: []
  // supportKit.tools: [codexAdd, codexList, codexShow, codexRemove, codexPush, draftOpen, draftList, draftAbandon, draftSeal]
}
```

### `packages/plugins/codexes/src/scriptorium-core.ts`
- `class ScriptoriumCore` — all state in-memory via `Map<string, CodexState>` and `Map<string, DraftRecord>`
- No Stacks import or usage anywhere in the codexes package

---

## Test Files

**`packages/plugins/codexes/src/scriptorium-core.test.ts`** — tests for the core logic. No changes needed (this commission is doc-only).

---

## Doc/Code Discrepancies

1. **Dependencies:** Doc says `requires: ['stacks']`; code has `requires: []`. No Stacks usage exists in the implementation.
2. **Draft tracking:** Doc says "the Stacks tracks runtime state (active drafts, clone status)"; code tracks everything in-memory Maps.
3. **README:** Says "Depends on `@shardworks/stacks-apparatus` for state tracking" — same discrepancy.
4. **Orchestrator framing:** Doc describes three orchestrator types (dispatch script, rig engine, standing order); only "rig engine" (the Spider's engines) is the current pattern for the draft→session→seal flow.

---

## Existing Context / Prior Commissions

- The brief references another commission that removes the "Interim Dispatch Pattern" section. No such section currently exists in the doc (it may have already been removed, or this commission is expected to run after that one). Grepping for "Interim" in the Scriptorium doc returns no results.
- No TODO/FIXME/HACK markers in the codexes package source.
- The `_agent-context.md` file references the codexes config key but does not mention any known staleness.

---

## Scope of Changes

This is a **doc-only** commission. Files to modify:

1. **`docs/architecture/apparatus/scriptorium.md`** — primary target. Multiple stale references throughout.
2. **`packages/plugins/codexes/README.md`** — secondary. Stale Stacks dependency claim (line 3).

No source code, tests, or configuration changes needed.

---
author: plan-writer
author_version: 2026-04-03
estimated_complexity: 3
---

# Remove Dispatch Apparatus

## Summary

Delete the Dispatch apparatus package (`@shardworks/dispatch-apparatus`) and all references to it across the framework and live guild. The Spider has replaced the Dispatch as the guild's work runner; the Dispatch was explicitly designed as disposable interim infrastructure.

## Current State

The Dispatch apparatus lives at `/workspace/nexus/packages/plugins/dispatch/` as a pnpm workspace package. It exports a `Plugin` with:
- `apparatus.requires: ['clerk', 'codexes', 'animator']`
- `apparatus.recommends: ['loom']`
- `apparatus.provides: DispatchApi` (a single `next()` method)
- `apparatus.supportKit.tools: [dispatchNext]` (the `dispatch-next` CLI tool)

**No other package imports from `@shardworks/dispatch-apparatus`.** The Dispatch is a pure consumer of other apparatus APIs. Its `provides` API is only consumed by its own `dispatch-next` tool.

The live guild at `/workspace/vibers/` lists `"dispatch"` in its `guild.json` plugins array and has `@shardworks/dispatch-apparatus` as a dependency in `package.json`.

Five architecture docs reference the Dispatch as current infrastructure:
- `docs/architecture/apparatus/dispatch.md` — the Dispatch API contract doc
- `docs/architecture/apparatus/clerk.md` — references Dispatch as the current dispatch path
- `docs/architecture/apparatus/spider.md` — "replaces the Dispatch apparatus"
- `docs/architecture/apparatus/animator.md` — "the Dispatch sets GIT_AUTHOR_EMAIL"
- `docs/architecture/apparatus/scriptorium.md` — "Interim Dispatch Pattern" section
- `docs/architecture/apparatus/review-loop.md` — extensive MVP section built around Dispatch

## Requirements

- R1: The entire `packages/plugins/dispatch/` directory must be deleted from the framework repository.
- R2: The `"dispatch"` entry must be removed from `/workspace/vibers/guild.json` `plugins` array.
- R3: The `"@shardworks/dispatch-apparatus"` dependency must be removed from `/workspace/vibers/package.json`.
- R4: `docs/architecture/apparatus/dispatch.md` must be deleted.
- R5: References to "The Dispatch" as a current or interim apparatus in `clerk.md`, `spider.md`, `animator.md`, and `scriptorium.md` must be updated to reference the Spider / rigging system.
- R6: The "Interim Dispatch Pattern" section in `scriptorium.md` must be removed.
- R7: Dispatch-specific sections in `review-loop.md` (Option A, the MVP Dispatch-Level Review Loop section, and implementation notes for MVP) must be removed. Non-Dispatch content (empirical motivation, review criteria, artifact schema, Spider-level design) must be preserved.
- R8: `pnpm-lock.yaml` in the framework root must be regenerated via `pnpm install`.
- R9: `package-lock.json` in vibers must be regenerated via `npm install`.
- R10: The guild must start cleanly after removal — verified by running `nsg status` or equivalent guild startup command from the vibers directory.

## Design

### Package Deletion (R1)

Delete the entire directory tree:

```
packages/plugins/dispatch/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts
│   ├── dispatch.ts
│   ├── types.ts
│   ├── dispatch.test.ts
│   └── tools/
│       ├── index.ts
│       └── dispatch-next.ts
├── dist/
└── node_modules/
```

Use `git rm -r packages/plugins/dispatch/` to ensure clean removal from version control.

### Guild Updates (R2, R3)

**`/workspace/vibers/guild.json`** — remove `"dispatch"` from the `plugins` array. The array currently reads:

```json
"plugins": [
  "stacks",
  "tools",
  "loom",
  "claude-code",
  "animator",
  "codexes",
  "clerk",
  "dispatch",
  "laboratory",
  "fabricator",
  "spider"
]
```

After: remove the `"dispatch"` line. The remaining plugins are unaffected — no plugin depends on Dispatch.

**`/workspace/vibers/package.json`** — remove this line from `dependencies`:

```json
"@shardworks/dispatch-apparatus": "file:../nexus/packages/plugins/dispatch",
```

### Doc: Delete dispatch.md (R4)

Delete `/workspace/nexus/docs/architecture/apparatus/dispatch.md` via `git rm`.

### Doc: clerk.md Updates (R5)

Three locations need updating:

**Line 15** — current text:
```
Connecting writs to sessions is the job of the dispatch layer — currently [The Dispatch](dispatch.md), eventually the full rigging system (Spider, Executor, Fabricator). The Clerk tracks the obligation, not the execution.
```
Replace with:
```
Connecting writs to sessions is the job of the rigging system — the Spider assembles rigs, and engines execute the work. The Clerk tracks the obligation, not the execution.
```

**Line 350** — current text:
```
One commission = one mandate writ. No planning, no decomposition. Dispatch is handled by [The Dispatch](dispatch.md) — a separate apparatus that reads ready writs and runs them through the guild's session machinery.
```
Replace with:
```
One commission = one mandate writ. No planning, no decomposition. Execution is handled by the Spider, which spawns a rig for each ready writ and drives it through the engine pipeline.
```

**Lines 408–414, section header "Dispatch Integration"** — rename the section header to "Execution Integration" and reword the body. Current text:
```
### Dispatch Integration

The Clerk integrates with the dispatch layer at two points:

**Outbound: Ready Signal.** When a writ is signaled ready, the Clockworks event stream carries it to standing orders. The summon relay (or the Spider, for rig-based execution) picks it up and begins work. The Clerk does not know or care which dispatch path handles the writ — it signals readiness; the guild's configuration determines the response.

**Inbound: Completion Signal.** When work completes (session ends, rig strikes), the completing apparatus calls `clerk.transition(id, 'completed', { outcome })`. For rig-based execution, the Spider calls this when it strikes a completed rig. For direct-summon execution, the anima calls `writ-complete` (which wraps `clerk.transition()`). Both paths converge on the same Clerk API.
```
Replace with:
```
### Execution Integration

The Clerk integrates with the execution layer at two points:

**Outbound: Ready Signal.** When a writ is signaled ready, the Clockworks event stream carries it to standing orders. The Spider picks it up and spawns a rig to begin work. The Clerk does not know or care how the writ is executed — it signals readiness; the guild's configuration determines the response.

**Inbound: Completion Signal.** When work completes, the completing apparatus calls `clerk.transition(id, 'completed', { outcome })`. The Spider calls this when it strikes a completed rig. For direct-summon execution (standing orders), the anima calls `writ-complete` (which wraps `clerk.transition()`). Both paths converge on the same Clerk API.
```

### Doc: spider.md Update (R5)

**Line 13** — current text:
```
The Spider is the spine of the guild's rigging system. It replaces the Dispatch apparatus, which ran one writ in one session with no review. The Spider runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `crawl()` step function.
```
Replace with:
```
The Spider is the spine of the guild's rigging system. It runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `crawl()` step function.
```

### Doc: animator.md Update (R5)

**Line 449** — current text:
```
2. **Request** (`request.environment`) — per-task overrides from the caller. Example: the Dispatch sets `GIT_AUTHOR_EMAIL=w-{writId}@nexus.local` for per-commission git attribution.
```
Replace with:
```
2. **Request** (`request.environment`) — per-task overrides from the caller. Example: the implement engine sets `GIT_AUTHOR_EMAIL=w-{writId}@nexus.local` for per-commission git attribution.
```

### Doc: scriptorium.md — Remove Interim Section (R5, R6)

Delete the entire "Interim Dispatch Pattern" section (lines 529 through the end of the shell script example and closing paragraph, approximately lines 529–565). This section begins with `## Interim Dispatch Pattern` and contains a shell script example that predates both the Dispatch apparatus and Spider. Both now exist, making this section obsolete.

### Doc: review-loop.md — Surgical Removal (R7)

The review-loop.md must be updated to remove Dispatch-specific content while preserving the design thinking that applies to the Spider path. Specific changes:

1. **Line 5 (intro note)** — current text references "the Dispatch apparatus" and "an MVP path that works before the Spider exists." Rewrite to describe the review loop as a composition pattern within the rigging system (Spider and engine designs). Remove the mention of an MVP path.

2. **Line 17** — "The loop runs entirely within the dispatch pipeline using existing apparatus." Rewrite: "The loop runs entirely within the rigging pipeline using existing apparatus."

3. **Lines 45–76 (Design Decision section)** — remove "Option A: Dispatch-level wrapper (MVP path)" entirely (lines 45–51). Remove the "Decision" paragraph (lines 69–76) which says "Adopt both Option A (MVP) and Option B (full design)." Rewrite the Decision to state that Option B (review engines in the rig) is the chosen design. Keep Option B and Option C descriptions.

4. **Lines 79–232 (MVP: Dispatch-Level Review Loop section)** — remove this entire section. It covers `DispatchRequest` changes, review pass data flow through Dispatch, iteration cap within Dispatch, and escalation through Dispatch. None of this was implemented and the design is now dead.

5. **Lines 237** — "When the Spider is implemented, the review loop migrates from Dispatch into the rig as two engine designs. The Dispatch drops all review logic." Rewrite to remove the migration framing: the Spider is live, so this is just how the review loop works, not a migration target.

6. **Lines 444–458 (Configuration section)** — remove the "For the MVP (Dispatch-level)" paragraph and its JSON example. Keep only the Spider-level configuration paragraph.

7. **Lines 507–514 (Future Evolution, Phase 1)** — remove the "Phase 1 (MVP — Dispatch-level)" block. Renumber remaining phases.

8. **Lines 536–548 (Implementation Notes for MVP)** — remove this entire section. It describes changes to the Dispatch apparatus.

9. **Line 382** — "For the MVP (Dispatch-level), the Dispatch writes these artifacts directly." Remove this sentence; keep only the Spider-level description.

### Lockfile Regeneration (R8, R9)

After deleting the package and updating dependencies:

1. Run `pnpm install` in `/workspace/nexus/` to regenerate `pnpm-lock.yaml`.
2. Run `npm install` in `/workspace/vibers/` to regenerate `package-lock.json`.

### Startup Verification (R10)

After all changes, run `nsg status` (or equivalent guild startup command) from `/workspace/vibers/` to verify the guild starts cleanly without the Dispatch plugin.

### Non-obvious Touchpoints

**`/workspace/nexus/packages/framework/cli/README.md` line 187** — lists `nsg dispatch list` in a table of CLI commands. This is an aspirational command from `nexus-stdlib`, not from the Dispatch apparatus. It refers to Clockworks event dispatch records, not the Dispatch apparatus. Inspect but likely leave untouched — the word "dispatch" here refers to event dispatch, not the apparatus.

**`/workspace/nexus/docs/reference/core-api.md`** — references `recordDispatch`, `listDispatches`, `DispatchRecord`. These are Clockworks event dispatch records. Leave untouched — different concept from the Dispatch apparatus.

**`/workspace/nexus/docs/reference/event-catalog.md`** — uses "dispatch" to describe Clockworks event processing. Leave untouched.

**`/workspace/nexus/docs/architecture/_agent-context.md`** — "Commission → mandate writ → dispatch flow" — generic use of "dispatch." Leave untouched.

**`/workspace/nexus-mk2/docs/future/outdated-architecture/`** — several files reference Dispatch. These are already in the "outdated" folder documenting historical designs. Leave untouched.

## Validation Checklist

- V1 [R1]: `ls packages/plugins/dispatch` returns "No such file or directory." Run `git status` and confirm the directory is staged for deletion.
- V2 [R2, R3]: `cat /workspace/vibers/guild.json | grep dispatch` returns no output. `cat /workspace/vibers/package.json | grep dispatch` returns no output.
- V3 [R4]: `ls docs/architecture/apparatus/dispatch.md` returns "No such file or directory."
- V4 [R5]: `grep -r "The Dispatch" docs/architecture/apparatus/` returns no matches. `grep -r "\[The Dispatch\]" docs/architecture/apparatus/` returns no matches. `grep -r "dispatch\.md" docs/architecture/apparatus/` returns no matches.
- V5 [R6]: `grep "Interim Dispatch Pattern" docs/architecture/apparatus/scriptorium.md` returns no matches.
- V6 [R7]: `grep -c "Dispatch" docs/architecture/apparatus/review-loop.md` returns 0 (or only incidental lowercase "dispatch" in non-apparatus context). Verify: `grep "Option A" docs/architecture/apparatus/review-loop.md` returns no matches. `grep "MVP.*Dispatch" docs/architecture/apparatus/review-loop.md` returns no matches.
- V7 [R8]: `pnpm install` in `/workspace/nexus/` completes without errors. `grep dispatch pnpm-lock.yaml` returns no matches for the dispatch package.
- V8 [R9]: `npm install` in `/workspace/vibers/` completes without errors. `grep "dispatch-apparatus" package-lock.json` returns no matches.
- V9 [R10]: Run `nsg status` (or equivalent) from `/workspace/vibers/`. The guild starts without errors about missing plugins. Confirm no `dispatch` apparatus appears in the loaded apparatus list.
- V10 [R1]: `grep -r "@shardworks/dispatch-apparatus" packages/` returns no matches. `grep -r "from.*dispatch" packages/plugins/*/src/` returns no matches referencing the dispatch package.
- V11 [R5]: Read the updated sections of `clerk.md`, `spider.md`, `animator.md` and verify they reference "the Spider," "the rigging system," or "the implement engine" — not "The Dispatch."

## Test Cases

No new automated tests are required. This commission removes code; it does not add behavior.

- **Build passes after deletion:** `pnpm build` in the framework root completes without errors. The remaining packages have no import dependency on `@shardworks/dispatch-apparatus`.
- **Existing tests pass:** `pnpm test` in the framework root passes. No test file outside `packages/plugins/dispatch/` references the Dispatch.
- **Guild startup:** `nsg status` from `/workspace/vibers/` succeeds — Arbor loads the remaining plugins without error. No plugin declares `dispatch` in its `requires` array.
- **Typecheck passes:** `pnpm typecheck` in the framework root completes without errors. No TypeScript file imports types from the deleted package.
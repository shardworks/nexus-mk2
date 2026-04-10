# Astrolabe experimental rig template: merged reader/analyst

Add an experimental secondary rig template to the astrolabe plugin that collapses the existing `reader` and `analyst` stages into a single combined anima-session stage. The production `planning` template and its `brief` writ type mapping must remain **completely untouched** — this is an A/B experiment, not a migration. Commissions continue to route through the existing template unless explicitly posted under the new experimental writ type.

## Background

Profiling of 51 astrolabe sessions (2026-04-10) showed that:

- Reader is 65% of astrolabe's spend ($69.75 / $107.35 sampled).
- Conversation-cache-sharing between reader and downstream stages saves only ~27% on downstream cost — much less than expected. Downstream analyst and spec-writer load ~1.3 M tokens of their own cache material *on top of* any inherited reader cache.
- This strongly suggests reader and analyst are doing substantially overlapping work: both navigate the codebase, both form a picture of the change. Reader "inventories" the code; analyst "analyzes" it — but in practice, analyst re-reads source directly rather than consuming reader's structured output.

The hypothesis this commission tests: *if reader and analyst are merged into a single stage that produces inventory + scope + decisions + observations in one session, total astrolabe cost drops by ~50% without quality loss.*

Full profile at `experiments/data/2026-04-10-astrolabe-profile.md` in the sanctum (`/workspace/nexus-mk2/`). You do not need to read it to implement this brief, but the "Intervention B" section describes the design intent.

## Deliverables

### 1. New rig template `planning-mra`

Register a new rig template in `packages/plugins/astrolabe/src/` called `planning-mra` (for "merged reader/analyst"). Its stage pipeline:

    plan-init → draft → reader-analyst → inventory-check → decision-review → spec-writer → spec-publish → seal

Note: the existing `reader` and `analyst` anima-session stages are replaced by a single `reader-analyst` stage. The existing `inventory-check` and `decision-review` non-anima engines run after `reader-analyst` and act as validators/curators on whatever the combined session wrote to the plan doc.

The `reader-analyst` stage:

- `designId: 'anima-session'`, `role: 'astrolabe.sage'`. Same tools available (`plan-show`, `inventory-write`, `scope-write`, `decisions-write`, `observations-write`, etc.).
- New prompt that instructs the agent to, in a single session:
  1. Read the plan with `plan-show`.
  2. Inventory the relevant code (same quality bar as current reader).
  3. Produce scope items, decision points, and observations (same quality bar as current analyst).
  4. Write all of the above to the plan doc using the existing write tools.
- The prompt should make clear that this is a combined read-and-analyze pass — the agent is encouraged to let its understanding of the change guide which files it reads, rather than doing a full repo walk followed by a separate analysis turn.

You have latitude on exact prompt wording. Use the existing `sage.md` role instructions and the existing `MODE: READER` / `MODE: ANALYST` prompt snippets in `astrolabe.ts` as the quality bar.

### 2. New writ type `brief-mra` mapped to `planning-mra`

Add `brief-mra` to the astrolabe plugin's `writTypes` list and add a `rigTemplateMappings` entry routing `brief-mra → astrolabe.planning-mra`. The existing `brief → astrolabe.planning` mapping stays.

### 3. Decision-review behavior

The existing `decision-review` engine expects analyst decisions to already be written to the plan doc. In `planning-mra`, the combined `reader-analyst` stage writes decisions before `decision-review` runs, so the existing engine should work unchanged. **Verify** this by reading the existing `decision-review.ts` source before wiring the template. If `decision-review` has an implicit assumption that reader and analyst ran as separate sessions (e.g., checking for a specific `conversationId` pattern), document it and work around it without modifying the production engine.

### 4. Tests

Add unit tests that verify:

- `planning-mra` is registered as a rig template on the astrolabe plugin.
- `brief-mra` is registered as a writ type and maps to `astrolabe.planning-mra`.
- The `planning-mra` template's engine list matches the spec above (plan-init → draft → reader-analyst → inventory-check → decision-review → spec-writer → spec-publish → seal).
- Posting a `brief-mra` writ through a mock Spider dispatches to the `planning-mra` template.

You do not need to run live end-to-end commissions through the new template — the patron will do that separately once this lands.

## Constraints

- **Do not modify** `planningTemplate`, the `brief` writ type, or the existing `brief → astrolabe.planning` mapping. Control must stay untouched.
- **Do not modify** the existing `decision-review`, `inventory-check`, `plan-init`, or `spec-publish` engines. If `planning-mra` needs different behavior from any of them, duplicate the engine under a new name instead of changing the original.
- **Minimize diff to `astrolabe.ts`.** Prefer putting the new template in its own file (e.g., `src/planning-mra.ts`) and importing into `astrolabe.ts` only the pieces needed to register with the apparatus. Another commission is running concurrently against the same file — keep your edits to `astrolabe.ts` surgical to reduce conflict surface.
- The new template must pass all existing astrolabe tests without modification.
- The combined session must emit `metadata.engineId = 'reader-analyst'` on its session record so profiling can distinguish it from both control reader and control analyst sessions.

## Success criteria

1. All existing astrolabe tests pass unchanged.
2. New unit tests for `planning-mra` and `brief-mra` registration pass.
3. Diff against `packages/plugins/astrolabe/src/astrolabe.ts` is small (ideally <30 lines added, zero lines removed).
4. Commit message documents the prompt design and any decision-review compatibility workarounds.
5. A `brief-mra` commission can be posted via `nsg commission-post --type brief-mra ...` and will be dispatched to the `planning-mra` rig by Spider.

## Out of scope

- Profiling or measurement harness — profiling data will come from the session records naturally.
- Modifying production astrolabe prompts, engines, or templates.
- Running live briefs through the new template.
- Merging other adjacent stages (e.g., spec-writer into reader-analyst). This experiment isolates the reader/analyst merge only.

## Reference

- Profile findings: `/workspace/nexus-mk2/experiments/data/2026-04-10-astrolabe-profile.md` (sanctum).
- Parent quest: `w-mnt3t5h8-943e2a2ef85f` — astrolabe efficiency quest. This commission is the second of two experimental interventions dispatched against it.
- Sister commission: single-shot reader template (`brief-ssr`) — running concurrently against the same plugin. Expect conflict on `astrolabe.ts` and structure your changes to minimize it.
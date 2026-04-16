# Task-Loop Implement Engine: Piece Writs and Sequential Execution

## Intent

Transform the implement engine from a single-session dispatch into a sequential loop over child "piece" writs, each representing an atomic task from the spec writer's task manifest. The spec-publish engine parses the manifest, materializes pieces as child writs of the mandate, and a new `implement-loop` engine processes them one at a time — halting on failure. An anima-callable `piece-add` tool allows the task list to grow during implementation.

## Rationale

Today, the implement anima receives the entire brief and task manifest in a single session. This creates a monolithic session that is hard to observe, hard to recover from on failure, and impossible to extend mid-flight. By decomposing the manifest into child writs processed sequentially, each task gets its own session with clear status, the rig halts at the first failure rather than silently continuing, and animas can append discovered work via `piece-add` without restarting.

## Scope & Blast Radius

**Primary systems affected:**

- **Astrolabe plugin** — Registers the new `piece` writ type. The `spec-publish` engine gains manifest parsing and child writ creation logic. This is the heaviest change in Astrolabe.
- **Spider plugin** — Two new engine designs: `implement-loop` (orchestrator) and `piece-session` (per-piece executor with custom collect). The existing `implement` engine is preserved unchanged for rollback safety. The EXECUTION_EPILOGUE becomes piece-aware.
- **Clerk plugin** — Gains the `piece-add` tool. No changes to core writ lifecycle — existing parent/child mechanics and upward failure cascade are used as-is.

**Cross-cutting concerns:**

- The mandate rig template must reference `implement-loop` instead of `implement` for piece-aware execution. Every rig template that wires a mandate pipeline needs updating — verify with grep across template definitions.
- The `piece` writ type is registered by Astrolabe via supportKit but consumed by Spider's engines and Clerk's new tool. All three plugins interact with pieces through Clerk's existing writ API — no new cross-plugin interfaces.
- Existing mandates without child pieces must continue working. The `implement-loop` engine's no-piece path must fall through to legacy single-session behavior.
- The spec-publish engine's mandate posting flow changes: mandate is now posted in draft state, pieces created as children, then mandate transitions to ready. This ordering matters because Clerk requires the parent to exist before children can be created.

## Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Which plugin registers the `piece` writ type? | Astrolabe registers `piece` alongside `brief` in supportKit.writTypes | Astrolabe owns spec-publish which creates pieces; it's the natural owner |
| D2 | How does spec-publish get the task manifest? | Parse `<task-manifest>` XML from the combined spec string at publish time | No PlanDoc schema change, no tool schema change needed |
| D3 | What goes in each piece writ's body? | Raw task XML fragment as-is (e.g., `<task id="t1">...</task>`) | Stored verbatim; consuming anima interprets the XML directly |
| D4 | What is stripped from the mandate body? | Remove `<task-manifest>...</task-manifest>` block before posting as mandate body | Manifest is materialized as child writs; redundant in body |
| D5 | How does the implement engine loop? | *Patron override:* New `implement-loop` engine contains the loop internally — launches pieces sequentially, marks each done before launching the next | Internal loop in a new engine; old engine preserved for rollback |
| D6 | How does the engine detect loop vs single-session? | Always use the loop path; mandates without pieces have zero iterations and fall through to legacy single-session behavior | Unified code path; no branching on template flags |
| D7 | How are pieces marked completed/failed? | The implement/dispatcher engine transitions piece writs via Clerk API after each piece session collects | Engine owns the transition; completed session → piece completed, failed → piece failed |
| D8 | What happens when a piece session fails? | Failed piece session → piece engine fails → rig goes stuck; piece writ failure and mandate failure happen as side effects | Engine-level failure is synchronous and deterministic |
| D9 | What prompt does each piece session receive? | Prompt = mandate.body + piece.body; no handoff note support initially | Handoff notes deferred to w-mo0znvsz |
| D10 | New engine or modify existing? | *Patron override:* Keep existing `implement` engine for rollback; add new features in `implement-loop` | Side-by-side engines; safe rollback path |
| D11 | Which plugin owns `piece-add`? | Clerk gets a generic add-child-writ tool that `piece-add` wraps | Clerk owns writ creation; piece-add is a thin domain wrapper |
| D12 | What parameters does `piece-add` accept? | *Patron override:* mandateId + name + action + files? + verify? + done?; creates piece with structured XML body matching the manifest format | Structured fields ensure consistency with spec-writer output |
| D13 | How does `piece-add` know which mandate? | Requires explicit mandateId parameter; anima supplies it from prompt context | Tools don't have access to session metadata |
| D14 | Who can call `piece-add`? | callableBy: ['anima', 'patron'] — accessible to both | No reason to restrict patrons from manual piece creation |
| D15 | What status for new pieces? | Created in 'open' status; immediately visible and queryable | No draft-review workflow for pieces; they're ready to work |
| D16 | How does the engine query for pieces? | Query all children at the start of the implement engine run, store the list, and set up engines for all of them at once | Full picture upfront; dynamic additions handled separately |
| D17 | How are dynamically added pieces picked up? | Each piece engine's collect() checks for new children added since the last setup, and incorporates them | Natural checkpoint after each piece session completes |
| D18 | Does the implement anima need a new role? | Same role; EXECUTION_EPILOGUE updated to piece-aware instructions per-piece session | Permissions unchanged; only behavioral instructions change |
| D19 | Does Oculus need changes? | No; pieces appear as child writs in existing writ detail view via standard Clerk rendering | Existing child writ display suffices for v1 |
| D20 | Piece creation ordering? | *Patron override:* Post mandate in draft state → create pieces as children → update PlanDoc → transition mandate to ready. Use Stacks transactions if available, but do not implement transaction support if it doesn't exist | Pieces reference mandate as parent; draft state prevents premature dispatch |
| D21 | What designId for piece engines? | New `piece-session` engine design with custom run/collect for piece writ transitions and handoff note plumbing | Dedicated design keeps piece concerns isolated from generic anima-session |

## Acceptance Signal

1. **Piece writs materialize from manifest:** When spec-publish runs on a plan with a `<task-manifest>` in the spec, child piece writs appear under the mandate — one per `<task>` element, in manifest order, each with the raw task XML as its body. The mandate body contains the brief without the manifest block. Verify: query child writs of a mandate after spec-publish and confirm count matches task count.

2. **Sequential execution with halt-on-failure:** The `implement-loop` engine processes piece writs one at a time. Each piece session receives mandate.body + piece.body as its prompt. A failed piece session halts the rig (rig goes stuck). Verify: run a mandate with multiple pieces; confirm sessions launch sequentially; inject a failure and confirm the rig stops.

3. **Backward compatibility:** Mandates without child pieces continue working — the implement-loop engine falls through to single-session behavior identical to the old `implement` engine. The old `implement` engine design still exists in Spider's registry. Verify: dispatch a legacy mandate (no pieces) and confirm it completes as before.

4. **Dynamic piece addition:** The `piece-add` tool creates new open piece writs as children of a mandate with structured XML body. Dynamically added pieces are picked up by the implement loop after the current piece session completes. Verify: call `piece-add` during an active piece session; confirm the new piece is processed after the current one finishes.

5. **Piece-aware anima instructions:** The EXECUTION_EPILOGUE for piece sessions focuses the anima on its single task — no manifest traversal, commit-per-piece guidance. Verify: inspect the prompt assembled for a piece session and confirm it contains piece-specific instructions rather than full-manifest instructions.

6. **Observability:** Piece writs are visible as children of the mandate in Oculus via existing Clerk writ detail rendering. Their status (open, completed, failed) is queryable. Verify: view a mandate in Oculus and confirm child pieces appear with status.

## Existing Patterns

- **Writ type registration:** `packages/plugins/astrolabe/src/astrolabe.ts` — see how `brief` is registered in `supportKit.writTypes`. Follow the same pattern for `piece`.
- **Mandate posting in spec-publish:** `packages/plugins/astrolabe/src/engines/spec-publish.ts` — current `clerk.post()` call and plan update flow. This is the insertion point for manifest parsing and piece creation.
- **Quick engine with custom collect:** `packages/plugins/spider/src/engines/review.ts` — the review engine has a custom `collect()` that parses session output. Follow this pattern for the `piece-session` engine design.
- **Engine registration:** `packages/plugins/spider/src/spider.ts` supportKit.engines section — unqualified names for Spider-owned engines (e.g., `'implement'`, `'review'`).
- **Child writ creation:** `packages/plugins/clerk/src/clerk.ts` `post()` method — supports `parentId` for child writs with transactional parent validation. Supports `draft: true` for creating in 'new' status.
- **Graft mechanism:** Spider's `tryProcessGrafts()` and how engines return `graft` arrays. Test fixtures in `spider.test.ts` show grafting patterns.
- **Generic anima session engine:** `packages/plugins/spider/src/engines/anima-session.ts` — reusable quick engine taking role, prompt, cwd as givens. The `piece-session` engine design should follow a similar structure but add custom collect logic.
- **Tool registration:** Existing Clerk tools for the pattern of registering tools in the Clerk plugin's supportKit.

## What NOT To Do

- **Do not modify the existing `implement` engine.** It is preserved as-is for rollback (D10). All new behavior goes in `implement-loop`.
- **Do not add a `taskManifest` field to PlanDoc.** The manifest is parsed from the existing `spec` string (D2). No schema changes to PlanDoc.
- **Do not convert task XML to markdown in piece bodies.** Store raw XML fragments (D3).
- **Do not implement handoff notes between piece sessions.** That is w-mo0znvsz's scope (D9).
- **Do not add enhanced piece UI to Oculus** (progress bars, task names, per-piece session links). Existing child writ rendering suffices (D19).
- **Do not implement Stacks transaction support.** Use transactions if the feature already exists; do not build it if it doesn't (D20).
- **Do not implement parallel piece execution.** Pieces are strictly sequential in this commission. Concurrency is a future concern (w-mo0e31ca).
- **Do not create a new Loom role for piece sessions.** Use the same role with updated epilogue instructions (D18).

<task-manifest>
  <task id="t1">
    <name>Register piece writ type in Astrolabe</name>
    <files>packages/plugins/astrolabe/src/astrolabe.ts</files>
    <action>Add `piece` as a new writ type in Astrolabe's supportKit.writTypes array, alongside the existing `brief` entry. Follow the same registration pattern.</action>
    <verify>pnpm -w typecheck</verify>
    <done>The `piece` writ type is registered and available in Clerk's type system when Astrolabe is loaded.</done>
  </task>

  <task id="t2">
    <name>Extend spec-publish to parse manifest and create piece writs</name>
    <files>packages/plugins/astrolabe/src/engines/spec-publish.ts</files>
    <action>Modify the spec-publish engine to: (1) parse the `&lt;task-manifest&gt;` XML block from the plan's spec string, (2) strip the manifest block from the spec before using it as the mandate body, (3) post the mandate writ in draft state, (4) create one child piece writ per `&lt;task&gt;` element — each in 'open' status with the raw task XML fragment as its body, (5) update the PlanDoc, and (6) transition the mandate to ready. If no task manifest is found in the spec, fall back to the current behavior (post mandate with full spec body, no pieces). Use Stacks transactions for the mandate+pieces creation if the feature already exists in the codebase; do not build transaction support if it doesn't.</action>
    <verify>pnpm -w typecheck &amp;&amp; pnpm -w test --filter astrolabe</verify>
    <done>spec-publish creates a draft mandate, materializes child piece writs from the task manifest, and transitions the mandate to ready. Mandates without manifests still work as before.</done>
  </task>

  <task id="t3">
    <name>Create piece-session engine design</name>
    <files>packages/plugins/spider/src/engines/, packages/plugins/spider/src/spider.ts, packages/plugins/spider/src/types.ts</files>
    <action>Create a new `piece-session` engine design in Spider. This is a quick engine (like anima-session) that launches a session for a single piece. It needs: (1) a run() that summons an anima session with the mandate body + piece body as prompt, using the same role as the implement engine, with piece-aware EXECUTION_EPILOGUE instructions, (2) a custom collect() that transitions the piece writ via Clerk API based on session outcome (completed session → piece completed, failed session → piece failed), and that checks for dynamically added child pieces since the last check and incorporates them via grafting. Register the engine in Spider's supportKit.engines.</action>
    <verify>pnpm -w typecheck &amp;&amp; pnpm -w test --filter spider</verify>
    <done>The `piece-session` engine design exists in Spider's registry with custom run and collect handling piece writ transitions and dynamic piece detection.</done>
  </task>

  <task id="t4">
    <name>Create implement-loop engine design</name>
    <files>packages/plugins/spider/src/engines/, packages/plugins/spider/src/spider.ts</files>
    <action>Create a new `implement-loop` engine design in Spider. This engine contains the piece loop internally. On run, it queries all open child piece writs of the mandate, sets up piece-session engines for all of them at once (via grafting), and orchestrates sequential execution. When no pieces exist, it falls through to legacy single-session behavior identical to the current implement engine. The existing `implement` engine remains untouched in the registry for rollback. Update the mandate rig template(s) to reference `implement-loop` instead of `implement`.</action>
    <verify>pnpm -w typecheck &amp;&amp; pnpm -w test --filter spider</verify>
    <done>The `implement-loop` engine exists, grafts piece-session engines for mandates with pieces, and falls through to single-session for mandates without. Mandate rig templates reference the new engine.</done>
  </task>

  <task id="t5">
    <name>Implement piece-add tool in Clerk</name>
    <files>packages/plugins/clerk/</files>
    <action>Add a `piece-add` tool to Clerk's supportKit. The tool accepts mandateId (required), name (required), action (required), files (optional), verify (optional), done (optional). It creates a child piece writ under the specified mandate in 'open' status, with a structured XML body matching the task manifest format (i.e., `&lt;task id="..."&gt;` with the provided fields as child elements). The tool is callableBy: ['anima', 'patron']. The mandateId is an explicit required parameter — no session context inference.</action>
    <verify>pnpm -w typecheck &amp;&amp; pnpm -w test --filter clerk</verify>
    <done>The `piece-add` tool is registered in Clerk, creates properly structured piece writs as children of mandates, and is callable by both animas and patrons.</done>
  </task>

  <task id="t6">
    <name>Update implement anima instructions for piece-aware workflow</name>
    <files>packages/plugins/spider/src/engines/</files>
    <action>Update the EXECUTION_EPILOGUE (or create a piece-specific variant) used by piece-session engines. The new instructions should orient the anima to its single-piece context: it receives one task at a time, should focus on that task, commit when the task is complete, and not traverse a task manifest. The anima should be aware that the mandateId is in its prompt context (for use with piece-add if it discovers additional work). The existing EXECUTION_EPILOGUE used by the legacy single-session path in implement-loop should remain unchanged.</action>
    <verify>pnpm -w typecheck</verify>
    <done>Piece sessions receive focused single-task instructions. Legacy single-session implement path retains original epilogue.</done>
  </task>

  <task id="t7">
    <name>End-to-end verification and backward compatibility</name>
    <files>packages/plugins/astrolabe/, packages/plugins/spider/, packages/plugins/clerk/</files>
    <action>Verify the full pipeline end-to-end: spec-publish with a task manifest produces a mandate with child pieces; implement-loop processes pieces sequentially; piece-add creates new pieces that get picked up; failure of a piece session halts the rig. Also verify backward compatibility: a mandate without pieces (no task manifest in spec) completes via the legacy single-session path. Ensure all existing tests pass and add coverage for the new behavior across all three plugins.</action>
    <verify>pnpm -w typecheck &amp;&amp; pnpm -w test</verify>
    <done>All tests pass. The piece pipeline works end-to-end. Legacy mandates without pieces work unchanged.</done>
  </task>
</task-manifest>
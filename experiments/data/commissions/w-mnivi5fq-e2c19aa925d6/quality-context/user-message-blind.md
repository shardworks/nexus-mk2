## Commission Diff

```
```
 docs/architecture/_agent-context.md                |  16 +-
 docs/architecture/apparatus/animator.md            |   2 +-
 docs/architecture/apparatus/clerk.md               |   8 +-
 docs/architecture/apparatus/dispatch.md            |   6 +-
 docs/architecture/apparatus/fabricator.md          |  14 +-
 docs/architecture/apparatus/review-loop.md         |  34 +--
 docs/architecture/apparatus/scriptorium.md         |   2 +-
 .../apparatus/{walker.md => spider.md}             |  72 ++---
 docs/architecture/index.md                         |  26 +-
 docs/architecture/kit-components.md                |   6 +-
 docs/architecture/plugins.md                       |  18 +-
 docs/architecture/rigging.md                       |  48 ++--
 docs/guild-metaphor.md                             |  18 +-
 packages/plugins/animator/src/types.ts             |   2 +-
 packages/plugins/dashboard/src/dashboard.ts        |   2 +-
 packages/plugins/dashboard/src/html.ts             |  40 +--
 packages/plugins/dashboard/src/index.ts            |   2 +-
 packages/plugins/dashboard/src/rig-types.ts        |   2 +-
 packages/plugins/dashboard/src/server.ts           |   6 +-
 packages/plugins/dispatch/README.md                |   2 +-
 packages/plugins/dispatch/src/dispatch.ts          |   2 +-
 packages/plugins/dispatch/src/index.ts             |   2 +-
 packages/plugins/fabricator/src/fabricator.ts      |   8 +-
 packages/plugins/{walker => spider}/package.json   |   6 +-
 .../{walker => spider}/src/engines/draft.ts        |   0
 .../{walker => spider}/src/engines/implement.ts    |   2 +-
 .../{walker => spider}/src/engines/index.ts        |   0
 .../{walker => spider}/src/engines/review.ts       |   4 +-
 .../{walker => spider}/src/engines/revise.ts       |   2 +-
 .../plugins/{walker => spider}/src/engines/seal.ts |   0
 packages/plugins/{walker => spider}/src/index.ts   |  14 +-
 .../walker.test.ts => spider/src/spider.test.ts}   | 292 ++++++++++-----------
 .../{walker/src/walker.ts => spider/src/spider.ts} |  48 ++--
 .../src/tools/crawl-continual.ts}                  |  26 +-
 packages/plugins/spider/src/tools/crawl.ts         |  25 ++
 packages/plugins/spider/src/tools/index.ts         |   2 +
 packages/plugins/{walker => spider}/src/types.ts   |  46 ++--
 packages/plugins/{walker => spider}/tsconfig.json  |   0
 packages/plugins/walker/src/tools/index.ts         |   2 -
 packages/plugins/walker/src/tools/walk.ts          |  25 --
 pnpm-lock.yaml                                     |  60 ++---
 41 files changed, 446 insertions(+), 446 deletions(-)

diff --git a/docs/architecture/_agent-context.md b/docs/architecture/_agent-context.md
index d35798b..6b9c90c 100644
--- a/docs/architecture/_agent-context.md
+++ b/docs/architecture/_agent-context.md
@@ -48,7 +48,7 @@ The word "rig" means two completely different things in this codebase:
 
 | Context | Meaning |
 |---------|---------|
-| **Guild metaphor / target architecture** | The execution scaffold assembled to fulfill a commission — seeded at commission time, built out by Walker with engines, struck when work is done |
+| **Guild metaphor / target architecture** | The execution scaffold assembled to fulfill a commission — seeded at commission time, built out by Spider with engines, struck when work is done |
 | **Current code** (`Rig` type in `core/src/rig.ts`, loaded by Arbor) | A package contributing tools, Books declarations, and other capabilities to the guild — basically what the target architecture calls a Kit or Apparatus |
 
 The current code's `Rig` is what we're moving toward calling a **Kit** (or Apparatus, for packages with a lifecycle). This rename is in progress. When reading source code, mentally substitute "plugin" for `Rig`.
@@ -66,7 +66,7 @@ The architecture docs use "rig" exclusively in the metaphor sense (execution sca
 | `architecture/plugins.md` | Good | Describes the Kit/Apparatus model with full type signatures. This is aspirational architecture, not fully implemented. |
 | `architecture/clockworks.md` | Good | Detailed; covers events, standing orders, relays, runner phases, daemon. Generally matches current implementation. |
 | `architecture/kit-components.md` | Good | Tools, engines, relays — artifact model, descriptors, role gating, installation. Generally accurate. |
-| `architecture/rigging.md` | Forward-looking | Describes Walker/Fabricator/Executor/Loom/Animator/Clerk as separate apparatus. This is the *target* design; currently much of this logic is either in core or not yet implemented. |
+| `architecture/rigging.md` | Forward-looking | Describes Spider/Fabricator/Executor/Loom/Animator/Clerk as separate apparatus. This is the *target* design; currently much of this logic is either in core or not yet implemented. |
 | `reference/schema.md` | Good | SQLite schema, ERD, entity ID prefixes. Reflects current database. |
 | `reference/core-api.md` | Good | Function signatures for `@shardworks/nexus-core`. Generally accurate but some functions are in `legacy/1/` indicating in-flight migration. |
 | `reference/event-catalog.md` | Not read | Should describe all framework events and payload shapes. |
@@ -85,7 +85,7 @@ The architecture docs use "rig" exclusively in the metaphor sense (execution sca
 |-----|-----------------|---------------------|
 | `anima-composition.md` | kit-components.md | Curricula, temperaments, oaths — composition artifacts |
 | `writs.md` | multiple places | Writ lifecycle, completion rollup, prompt templates, commission→mandate bridge |
-| `engine-designs.md` | plugins.md, future/ | WalkerKit engine design specifications |
+| `engine-designs.md` | plugins.md, future/ | SpiderKit engine design specifications |
 | `anima-lifecycle.md` | future/ | Anima states, instantiation, retirement |
 
 ---
@@ -114,8 +114,8 @@ The codebase is in active transition from a "rig-centric" model (current) toward
 - Formal `Plugin` type with explicit Kit/Apparatus discriminant
 - `Apparatus` with `start`/`stop`/`health`/`supportKit`/`consumes`
 - `GuildContext` with `ctx.plugin()`, `ctx.kits()`, `ctx.plugins()`
-- Separate named apparatus: Stacks, Guildhall, Clerk, Loom, Animator, Fabricator, Walker, Executor, Surveyor, Warden
-- Walker-driven rig execution (the commission → rig → engine chain)
+- Separate named apparatus: Stacks, Guildhall, Clerk, Loom, Animator, Fabricator, Spider, Executor, Surveyor, Warden
+- Spider-driven rig execution (the commission → rig → engine chain)
 - Fabricator (capability resolution from installed kits)
 - `plugin:initialized` reactive consumption
 - Startup validation with `requires` / `consumes` cross-referencing
@@ -160,7 +160,7 @@ Note: the live guild at `/workspace/shardworks/` is still running the V1 config
 | The Books | nexus.db / SQLite tables | The Stacks (`books` apparatus) |
 | Summon relay | built-in clockworks dispatch | summon relay (installed via nexus-stdlib) |
 | Arbor | Arbor | Arbor |
-| Walker | (not yet implemented) | The Walker (`walker` apparatus) |
+| Spider | (not yet implemented) | The Spider (`spider` apparatus) |
 | Fabricator | (not yet implemented) | The Fabricator (`fabricator` apparatus) |
 
 ---
@@ -169,7 +169,7 @@ Note: the live guild at `/workspace/shardworks/` is still running the V1 config
 
 - **2026-03-31 (session 1):** Initial scaffold session. Wrote §1–4 scaffold + "Standard Guild" bridge section. Created this context doc. Architecture doc is at `docs/architecture/index.md`. Companion detailed docs are already written for clockworks, plugins, kit-components, and rigging — they're good references even if partially aspirational.
 
-- **2026-03-31 (session 2):** Wrote §2 content (intro paragraph, ASCII diagram, narrative subsections). Scoped §2 explicitly as the "standard guild" — blockquote caveat added before the intro paragraph. Established the intended narrative arc: §2 gives the standard-guild mental model → §4 peels it back ("everything in §2 is a plugin, there is no privileged built-in layer") → Standard Guild bridge lists the defaults → detail sections proceed without hedging. **When writing §4**, open with a callback to §2: *"The apparatus described in §2 — Clerk, Walker, Clockworks, and the rest — are all plugins..."* This converts §2 into setup and §4 into the architectural reveal.
+- **2026-03-31 (session 2):** Wrote §2 content (intro paragraph, ASCII diagram, narrative subsections). Scoped §2 explicitly as the "standard guild" — blockquote caveat added before the intro paragraph. Established the intended narrative arc: §2 gives the standard-guild mental model → §4 peels it back ("everything in §2 is a plugin, there is no privileged built-in layer") → Standard Guild bridge lists the defaults → detail sections proceed without hedging. **When writing §4**, open with a callback to §2: *"The apparatus described in §2 — Clerk, Spider, Clockworks, and the rest — are all plugins..."* This converts §2 into setup and §4 into the architectural reveal.
 
 - **2026-03-31 (session 3):** Completed §3 (Guild Root) and §4 (Plugin Architecture). Corrected `guild.json` key names from real V2 type. Documented real `.nexus/` contents. Identified and resolved a plugin configuration specification gap — see design decisions below. Rewrote §4 with the §2 callback opening, corrected Kit/Apparatus examples (new naming convention, correct manifest shape), added Plugin IDs and Configuration subsections, updated GuildContext/HandlerContext interfaces with `config<T>()` and `guildConfig()`. Cleaned up Standard Guild table (dropped Guildhall, dropped layer column, added plugin id column, updated Stacks description). Restructured `guild.json` section to separate framework keys (`name`, `nexus`, `plugins`, `settings`) from plugin config sections (everything else, keyed by plugin id). Updated `plugins.md` spec with Plugin IDs section, Configuration section, and updated context interfaces.
 
@@ -234,7 +234,7 @@ CDC handlers (`ChangeHandler`) no longer receive a context parameter. They captu
 ### Remaining stub sections
 All are `<!-- TODO -->` blocks. In rough priority order:
 
-1. **Work Model** — Commission → Mandate writ → child writs → Rigs. Writ lifecycle states (`ready → active → pending → completed/failed/cancelled`). Writ hierarchy and completion rollup. Brief rig intro (Walker assembles from engine designs via Fabricator). Link to `rigging.md`.
+1. **Work Model** — Commission → Mandate writ → child writs → Rigs. Writ lifecycle states (`ready → active → pending → completed/failed/cancelled`). Writ hierarchy and completion rollup. Brief rig intro (Spider assembles from engine designs via Fabricator). Link to `rigging.md`.
 
 2. **The Clockworks** — Abbreviate; `clockworks.md` is detailed and current. Cover: events as immutable facts, standing orders as guild policy, summon verb, framework vs custom events, runner (manual vs daemon), error handling. Link to `clockworks.md`.
 
diff --git a/docs/architecture/apparatus/animator.md b/docs/architecture/apparatus/animator.md
index e87b7aa..76a29ca 100644
--- a/docs/architecture/apparatus/animator.md
+++ b/docs/architecture/apparatus/animator.md
@@ -225,7 +225,7 @@ interface SessionResult {
    * The final assistant text from the session.
    * Extracted from the last assistant message in the provider's transcript.
    * Useful for programmatic consumers that need the session's conclusion
-   * without parsing the full transcript (e.g. the Walker's review collect step).
+   * without parsing the full transcript (e.g. the Spider's review collect step).
    */
   output?: string
 }
diff --git a/docs/architecture/apparatus/clerk.md b/docs/architecture/apparatus/clerk.md
index a0df54d..c6ea948 100644
--- a/docs/architecture/apparatus/clerk.md
+++ b/docs/architecture/apparatus/clerk.md
@@ -12,7 +12,7 @@ Package: `@shardworks/clerk-apparatus` · Plugin id: `clerk`
 
 The Clerk is the guild's obligation authority. It receives commissions from the patron, issues writs that formally record what is owed, manages the lifecycle of those writs through to completion or failure, and maintains the Ledger — the guild's book of work.
 
-The Clerk owns the boundary between "what is asked for" and "how it gets done." A commission arrives; the Clerk creates a mandate writ. When work completes, the Clerk records the outcome. Connecting writs to sessions is the job of the dispatch layer — currently [The Dispatch](dispatch.md), eventually the full rigging system (Walker, Executor, Fabricator). The Clerk tracks the obligation, not the execution.
+The Clerk owns the boundary between "what is asked for" and "how it gets done." A commission arrives; the Clerk creates a mandate writ. When work completes, the Clerk records the outcome. Connecting writs to sessions is the job of the dispatch layer — currently [The Dispatch](dispatch.md), eventually the full rigging system (Spider, Executor, Fabricator). The Clerk tracks the obligation, not the execution.
 
 The Clerk does **not** execute work. It does not launch sessions, manage rigs, or orchestrate engines. It tracks obligations: what has been commissioned, what state each obligation is in, and whether the guild has fulfilled its commitments. When the Clockworks and rigging system exist, the Clerk will integrate with them via lifecycle events and signals.
 
@@ -400,7 +400,7 @@ A new method on `ClerkApi`:
  * Emits `{type}.ready` into the Clockworks event stream.
  * In the full design, called after intake processing (Sage
  * decomposition, validation) completes. This is the signal
- * the Walker (or summon relay) listens for to begin execution.
+ * the Spider (or summon relay) listens for to begin execution.
  */
 signal(id: string): Promise<void>
 ```
@@ -409,9 +409,9 @@ signal(id: string): Promise<void>
 
 The Clerk integrates with the dispatch layer at two points:
 
-**Outbound: Ready Signal.** When a writ is signaled ready, the Clockworks event stream carries it to standing orders. The summon relay (or the Walker, for rig-based execution) picks it up and begins work. The Clerk does not know or care which dispatch path handles the writ — it signals readiness; the guild's configuration determines the response.
+**Outbound: Ready Signal.** When a writ is signaled ready, the Clockworks event stream carries it to standing orders. The summon relay (or the Spider, for rig-based execution) picks it up and begins work. The Clerk does not know or care which dispatch path handles the writ — it signals readiness; the guild's configuration determines the response.
 
-**Inbound: Completion Signal.** When work completes (session ends, rig strikes), the completing apparatus calls `clerk.transition(id, 'completed', { outcome })`. For rig-based execution, the Walker calls this when it strikes a completed rig. For direct-summon execution, the anima calls `writ-complete` (which wraps `clerk.transition()`). Both paths converge on the same Clerk API.
+**Inbound: Completion Signal.** When work completes (session ends, rig strikes), the completing apparatus calls `clerk.transition(id, 'completed', { outcome })`. For rig-based execution, the Spider calls this when it strikes a completed rig. For direct-summon execution, the anima calls `writ-complete` (which wraps `clerk.transition()`). Both paths converge on the same Clerk API.
 
 ### Intake with Planning
 
diff --git a/docs/architecture/apparatus/dispatch.md b/docs/architecture/apparatus/dispatch.md
index 69f7601..f3b2e29 100644
--- a/docs/architecture/apparatus/dispatch.md
+++ b/docs/architecture/apparatus/dispatch.md
@@ -4,7 +4,7 @@ Status: **Draft**
 
 Package: `@shardworks/dispatch-apparatus` · Plugin id: `dispatch`
 
-> **⚠️ Temporary rigging.** This apparatus is a stand-in for the full rigging system (Walker, Fabricator, Executor). It provides a single dispatch tool that takes the oldest ready writ and runs it through the guild's existing machinery. When the full rigging system exists, this apparatus is retired and its responsibilities absorbed by the Walker and summon relay. Designed to be disposable.
+> **⚠️ Temporary rigging.** This apparatus is a stand-in for the full rigging system (Spider, Fabricator, Executor). It provides a single dispatch tool that takes the oldest ready writ and runs it through the guild's existing machinery. When the full rigging system exists, this apparatus is retired and its responsibilities absorbed by the Spider and summon relay. Designed to be disposable.
 
 ---
 
@@ -209,9 +209,9 @@ No configuration. The Dispatch reads writs from the Clerk and uses default behav
 
 ## Future: Retirement
 
-When the full rigging system (Walker, Fabricator, Executor) is implemented, the Dispatch apparatus is retired:
+When the full rigging system (Spider, Fabricator, Executor) is implemented, the Dispatch apparatus is retired:
 
-- The Walker takes over rig spawning and engine traversal
+- The Spider takes over rig spawning and engine traversal
 - The summon relay handles anima dispatch from standing orders
 - The Fabricator resolves engine chains (draft-open → session → seal is just one possible chain)
 - `dispatch-next` is replaced by the Clockworks processing `mandate.ready` events
diff --git a/docs/architecture/apparatus/fabricator.md b/docs/architecture/apparatus/fabricator.md
index 4dd8527..4574088 100644
--- a/docs/architecture/apparatus/fabricator.md
+++ b/docs/architecture/apparatus/fabricator.md
@@ -10,7 +10,7 @@ Package: `@shardworks/fabricator-apparatus` · Plugin id: `fabricator`
 
 ## Purpose
 
-The Fabricator is the guild's capability catalog. It holds engine design specifications and serves them to the Walker on demand. When the Walker needs to run an engine, it asks the Fabricator for the design by ID — the Fabricator resolves it, the Walker runs it.
+The Fabricator is the guild's capability catalog. It holds engine design specifications and serves them to the Spider on demand. When the Spider needs to run an engine, it asks the Fabricator for the design by ID — the Fabricator resolves it, the Spider runs it.
 
 The Fabricator does **not** execute engines. It does not touch rigs, manage sessions, or interact with the Clerk. It is a pure query service: designs in, designs out.
 
@@ -44,10 +44,10 @@ interface EngineDesign {
    * Execute this engine.
    *
    * Returns 'completed' with yields (synchronous work done inline), or
-   * 'launched' with a sessionId (async work the Walker polls for).
-   * The Walker inspects the result shape — no need to declare the kind up front.
+   * 'launched' with a sessionId (async work the Spider polls for).
+   * The Spider inspects the result shape — no need to declare the kind up front.
    *
-   * @param givens — the engine's declared inputs, assembled by the Walker.
+   * @param givens — the engine's declared inputs, assembled by the Spider.
    *   A mix of values from the givensSpec (set at rig spawn time, e.g. role,
    *   buildCommand, writ) and upstream yields (resolved from completed engines,
    *   e.g. draft worktree path). The engine doesn't know or care about
@@ -79,7 +79,7 @@ interface EngineRunContext {
 ```typescript
 type EngineRunResult =
   | { status: 'completed'; yields: unknown }    // clockwork: done, here are the yields
-  | { status: 'launched'; sessionId: string }    // quick: session launched, Walker will poll
+  | { status: 'launched'; sessionId: string }    // quick: session launched, Spider will poll
 ```
 
 ---
@@ -152,12 +152,12 @@ interface FabricatorApi {
    * Resolve a declared need to an engine chain.
    * Searches installed engine designs for those that satisfy the need,
    * composes them into an ordered chain, and returns the chain for the
-   * Walker to graft onto the rig.
+   * Spider to graft onto the rig.
    */
   resolve(need: string, context?: ResolutionContext): EngineChain | null
 }
 ```
 
-The Fabricator is also the Sage's entry point: planning animas query it to introspect what the guild can build before decomposing a commission into writs. A standalone Fabricator (rather than capability resolution buried inside the Walker) is what makes this possible — it's a shared service both the Walker and the Sage can call.
+The Fabricator is also the Sage's entry point: planning animas query it to introspect what the guild can build before decomposing a commission into writs. A standalone Fabricator (rather than capability resolution buried inside the Spider) is what makes this possible — it's a shared service both the Spider and the Sage can call.
 
 **Unified capability catalog.** The Fabricator may absorb tool designs from the Instrumentarium, becoming the single answer to "what can this guild do?" regardless of whether the answer is an engine or a tool.
diff --git a/docs/architecture/apparatus/review-loop.md b/docs/architecture/apparatus/review-loop.md
index ba5a7d2..64038e0 100644
--- a/docs/architecture/apparatus/review-loop.md
+++ b/docs/architecture/apparatus/review-loop.md
@@ -2,7 +2,7 @@
 
 Status: **Design** (not yet implemented)
 
-> **Not a traditional apparatus.** The review loop does not have a `start()`/`stop()` lifecycle or a persistent runtime API. It is a composition pattern — a pair of engine designs and a rig structure — that lives at the intersection of the Walker, the Executor, and the Dispatch apparatus. This document specifies the full design, including an MVP path that works before the Walker exists.
+> **Not a traditional apparatus.** The review loop does not have a `start()`/`stop()` lifecycle or a persistent runtime API. It is a composition pattern — a pair of engine designs and a rig structure — that lives at the intersection of the Spider, the Executor, and the Dispatch apparatus. This document specifies the full design, including an MVP path that works before the Spider exists.
 
 ---
 
@@ -44,19 +44,19 @@ Three candidate locations were considered:
 
 ### Option A: Dispatch-level wrapper (MVP path)
 
-The Dispatch apparatus (`dispatch-next`) runs the implementation session, then runs a review pass, then optionally a revision session — all within a single dispatch call. No new apparatus; no Walker dependency.
+The Dispatch apparatus (`dispatch-next`) runs the implementation session, then runs a review pass, then optionally a revision session — all within a single dispatch call. No new apparatus; no Spider dependency.
 
 **Pros:** Implementable now. Works with existing infrastructure. Dispatch is already the single entry point for writ execution.
 
-**Cons:** The Dispatch is temporary infrastructure, scheduled for retirement when the Walker is implemented. Any logic added to Dispatch must be migrated. Also, the dispatch-level wrapper can only retry the entire session; it cannot retry a subcomponent.
+**Cons:** The Dispatch is temporary infrastructure, scheduled for retirement when the Spider is implemented. Any logic added to Dispatch must be migrated. Also, the dispatch-level wrapper can only retry the entire session; it cannot retry a subcomponent.
 
 ### Option B: Review engine in every rig (full design)
 
-The Walker seeds every rig with an `implement → review → [revise → review]*N` chain by default. The review engine is a clockwork engine; the revise engine is a quick engine. Both are standard engine designs contributed by a kit.
+The Spider seeds every rig with an `implement → review → [revise → review]*N` chain by default. The review engine is a clockwork engine; the revise engine is a quick engine. Both are standard engine designs contributed by a kit.
 
-**Pros:** Architecturally clean. Composes naturally with Walker's traversal. Reusable engine designs. No migration from Dispatch required — Dispatch simply dispatches, and the rig handles iteration.
+**Pros:** Architecturally clean. Composes naturally with Spider's traversal. Reusable engine designs. No migration from Dispatch required — Dispatch simply dispatches, and the rig handles iteration.
 
-**Cons:** Requires the Walker. Not implementable until the rigging system exists.
+**Cons:** Requires the Spider. Not implementable until the rigging system exists.
 
 ### Option C: Rig pattern via origination engine
 
@@ -70,7 +70,7 @@ The origination engine seeds rigs with review chains by default. Superficially s
 
 **Adopt both Option A (MVP) and Option B (full design).**
 
-The Dispatch-level wrapper is the MVP: implementable now, catches the known failure modes, produces data on review loop effectiveness. When the Walker is implemented, the review logic migrates to engine designs (Option B), and the Dispatch drops its review wrapping entirely. The rig pattern (Option C) governs per-commission review configuration as a future enhancement.
+The Dispatch-level wrapper is the MVP: implementable now, catches the known failure modes, produces data on review loop effectiveness. When the Spider is implemented, the review logic migrates to engine designs (Option B), and the Dispatch drops its review wrapping entirely. The rig pattern (Option C) governs per-commission review configuration as a future enhancement.
 
 The two designs share the same review criteria and artifact schemas — the MVP is a direct precursor to the full design, not a throwaway.
 
@@ -234,7 +234,7 @@ The patron can inspect the artifacts, diagnose the failure mode, and either rewr
 
 ## Full Design: Review Engines in the Rig
 
-When the Walker is implemented, the review loop migrates from Dispatch into the rig as two engine designs. The Dispatch drops all review logic.
+When the Spider is implemented, the review loop migrates from Dispatch into the rig as two engine designs. The Dispatch drops all review logic.
 
 ### Engine Designs
 
@@ -257,7 +257,7 @@ When the Walker is implemented, the review loop migrates from Dispatch into the
 
 The review engine runs the same three checks as the MVP. It writes a `ReviewResult` to its yield. It does not branch — it always completes, passing the result downstream.
 
-The downstream engine (either a `seal` engine or a `revise` engine) reads `reviewResult.passed` to decide what to do. The Walker sees a completed engine regardless of outcome; the branching logic lives in the rig structure (see Rig Pattern below).
+The downstream engine (either a `seal` engine or a `revise` engine) reads `reviewResult.passed` to decide what to do. The Spider sees a completed engine regardless of outcome; the branching logic lives in the rig structure (see Rig Pattern below).
 
 #### `revise` engine (quick)
 
@@ -313,20 +313,20 @@ The default rig for a commission with review enabled:
                 └─────────────┘         └──────────────────┘
 ```
 
-The Walker traverses this graph naturally. Each engine completes and propagates its yield; downstream engines activate when their upstream is complete. The conditional branching (pass → seal, fail → revise) is expressed in the rig structure, not in Walker logic — the Walker just runs whatever is ready.
+The Spider traverses this graph naturally. Each engine completes and propagates its yield; downstream engines activate when their upstream is complete. The conditional branching (pass → seal, fail → revise) is expressed in the rig structure, not in Spider logic — the Spider just runs whatever is ready.
 
 **Seeding the rig:** The origination engine produces this graph when it seeds the rig. For `maxRetries=2`, the origination engine seeds a fixed graph (not dynamically extended). If the guild wants `maxRetries=0` (no review loop), origination seeds the simple `implement → seal` graph.
 
-**Dynamic extension (future):** A more sophisticated design would have the review engine declare a `need: 'revision'` when it fails, and the Fabricator would resolve and graft the next revise+review pair. This avoids pre-seeding the full graph and enables arbitrary retry depths. This is Future scope — the fixed graph is sufficient for MVP and avoids Walker complexity in the initial rigging implementation.
+**Dynamic extension (future):** A more sophisticated design would have the review engine declare a `need: 'revision'` when it fails, and the Fabricator would resolve and graft the next revise+review pair. This avoids pre-seeding the full graph and enables arbitrary retry depths. This is Future scope — the fixed graph is sufficient for MVP and avoids Spider complexity in the initial rigging implementation.
 
-### Walker Integration
+### Spider Integration
 
-The Walker needs no changes to support the review loop. It already:
+The Spider needs no changes to support the review loop. It already:
 - Traverses all engines whose upstream is complete
 - Dispatches ready engines to the Executor
 - Handles both clockwork and quick engine kinds
 
-The review loop is just a graph shape that Walker happens to traverse. The `escalate` clockwork engine signals the Clerk with a `failed` transition; the `seal` clockwork engine signals completion. The Walker itself is agnostic.
+The review loop is just a graph shape that Spider happens to traverse. The `escalate` clockwork engine signals the Clerk with a `failed` transition; the `seal` clockwork engine signals completion. The Spider itself is agnostic.
 
 ---
 
@@ -379,7 +379,7 @@ experiments/data/commissions/<writ-id>/
     escalation.md        (if loop exhausted; patron-facing summary)
 ```
 
-For the MVP (Dispatch-level), the Dispatch writes these artifacts directly. For the full design (Walker-level), the review engine writes them via the Stacks or directly to the commission data directory.
+For the MVP (Dispatch-level), the Dispatch writes these artifacts directly. For the full design (Spider-level), the review engine writes them via the Stacks or directly to the commission data directory.
 
 ### `review.md` Schema
 
@@ -456,7 +456,7 @@ For the MVP (Dispatch-level), review configuration lives in `guild.json`:
 
 All fields are optional. `enabled` defaults to `false` for the MVP (opt-in). The intent is to make it default-on once the loop has been validated in practice.
 
-For the full design (Walker-level), the same configuration is consumed by the origination engine to decide whether to seed the review graph and what configuration to pass to the review engine.
+For the full design (Spider-level), the same configuration is consumed by the origination engine to decide whether to seed the review graph and what configuration to pass to the review engine.
 
 ---
 
@@ -513,7 +513,7 @@ This commission is itself a spec-writing commission. There's no build command to
 - Artifacts written to commission data directory
 - Opt-in via `review.enabled: true` in `guild.json`
 
-### Phase 2 (Walker-level engine designs)
+### Phase 2 (Spider-level engine designs)
 - `review` clockwork engine contributed by a kit
 - `revise` quick engine contributed by the same kit
 - Origination engine seeds review graph by default
diff --git a/docs/architecture/apparatus/scriptorium.md b/docs/architecture/apparatus/scriptorium.md
index 19ab388..8195bf1 100644
--- a/docs/architecture/apparatus/scriptorium.md
+++ b/docs/architecture/apparatus/scriptorium.md
@@ -719,7 +719,7 @@ Until then, downstream consumers query the Scriptorium API directly.
 - **`guild().writeConfig()`** — the Scriptorium uses `guild().writeConfig('codexes', ...)` to persist codex registry changes to `guild.json`. This API was added to the `Guild` interface in `@shardworks/nexus-core` and implemented in Arbor. It updates both the in-memory config and the disk file atomically.
 - **Git operations.** All git operations use `child_process.execFile` (not shell) via a lightweight `git.ts` helper that handles error parsing and provides typed results (`GitResult`, `GitError`).
 - **Concurrency.** Multiple animas may open/seal drafts concurrently. The bare clone's git operations need appropriate locking — git's own ref locking handles most cases, but the fetch-rebase-seal cycle should be serialized per codex to avoid ref races.
-- **No downstream coupling.** The Scriptorium has no dependency on the Surveyor, the Walker, or any other consumer of codex state. It is pure infrastructure. Downstream apparatus query or (future) subscribe to the Scriptorium's state independently.
+- **No downstream coupling.** The Scriptorium has no dependency on the Surveyor, the Spider, or any other consumer of codex state. It is pure infrastructure. Downstream apparatus query or (future) subscribe to the Scriptorium's state independently.
 
 ---
 
diff --git a/docs/architecture/apparatus/walker.md b/docs/architecture/apparatus/spider.md
similarity index 90%
rename from docs/architecture/apparatus/walker.md
rename to docs/architecture/apparatus/spider.md
index 647b000..f424bae 100644
--- a/docs/architecture/apparatus/walker.md
+++ b/docs/architecture/apparatus/spider.md
@@ -1,18 +1,18 @@
-# The Walker — API Contract
+# The Spider — API Contract
 
 Status: **Ready — MVP**
 
-Package: `@shardworks/walker-apparatus` · Plugin id: `walker`
+Package: `@shardworks/spider-apparatus` · Plugin id: `spider`
 
-> **⚠️ MVP scope.** This spec covers a static rig graph: every commission gets the same five-engine pipeline (`draft → implement → review → revise → seal`). No origination, no dynamic extension, no capability resolution. The Walker runs engines directly — the Executor earns its independence later. See [What This Spec Does NOT Cover](#what-this-spec-does-not-cover) for the full list.
+> **⚠️ MVP scope.** This spec covers a static rig graph: every commission gets the same five-engine pipeline (`draft → implement → review → revise → seal`). No origination, no dynamic extension, no capability resolution. The Spider runs engines directly — the Executor earns its independence later. See [What This Spec Does NOT Cover](#what-this-spec-does-not-cover) for the full list.
 
 ---
 
 ## Purpose
 
-The Walker is the spine of the guild's rigging system. It replaces the Dispatch apparatus, which ran one writ in one session with no review. The Walker runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `walk()` step function.
+The Spider is the spine of the guild's rigging system. It replaces the Dispatch apparatus, which ran one writ in one session with no review. The Spider runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `crawl()` step function.
 
-The Walker owns the rig's structural lifecycle — spawn, traverse, complete — and delegates everything else. Engine designs come from the Fabricator. Sessions come from the Animator. Draft bindings come from the Scriptorium. Writ transitions are handled by a CDC handler, not inline. The Walker itself is stateless between `walk()` calls; all state lives in the Stacks.
+The Spider owns the rig's structural lifecycle — spawn, traverse, complete — and delegates everything else. Engine designs come from the Fabricator. Sessions come from the Animator. Draft bindings come from the Scriptorium. Writ transitions are handled by a CDC handler, not inline. The Spider itself is stateless between `crawl()` calls; all state lives in the Stacks.
 
 ---
 
@@ -43,14 +43,14 @@ Engines pull their own apparatus dependencies (Scriptorium, Animator, Loom) via
 
 Engines are the unit of work in a rig. Each engine implements a standard interface defined by the Fabricator apparatus (`@shardworks/fabricator-apparatus`). The `EngineDesign`, `EngineRunContext`, and `EngineRunResult` types are owned and exported by the Fabricator — see the Fabricator spec (`docs/architecture/apparatus/fabricator.md`) for full type definitions. Engines pull their own apparatus dependencies via `guild().apparatus(...)` — same pattern as tool handlers.
 
-The Walker resolves engine designs by `designId` from the Fabricator at runtime: `fabricator.getEngineDesign(id)`.
+The Spider resolves engine designs by `designId` from the Fabricator at runtime: `fabricator.getEngineDesign(id)`.
 
 ### Kit contribution
 
-The Walker contributes its five engine designs via its support kit:
+The Spider contributes its five engine designs via its support kit:
 
 ```typescript
-// In walker-apparatus plugin
+// In spider-apparatus plugin
 supportKit: {
   engines: {
     draft:     draftEngine,
@@ -60,56 +60,56 @@ supportKit: {
     seal:      sealEngine,
   },
   tools: {
-    walk:          walkTool,           // single step — do one thing and return
-    walkContinual: walkContinualTool,  // polling loop — walk every ~5s until stopped
+    walk:          crawlTool,           // single step — do one thing and return
+    crawlContinual: crawlContinualTool,  // polling loop — walk every ~5s until stopped
   },
 },
 ```
 
-**Tool naming note:** Hyphenated tool names (e.g. `start-walking`) have known issues with CLI argument parsing and tool grouping in `nsg`. The names above use camelCase in code; the CLI surface (`nsg walk`, `nsg walk-continual`) needs to work cleanly with the Instrumentarium's tool registration. Final CLI naming TBD — may need to revisit how the Instrumentarium maps tool IDs to CLI commands.
+**Tool naming note:** Hyphenated tool names (e.g. `start-walking`) have known issues with CLI argument parsing and tool grouping in `nsg`. The names above use camelCase in code; the CLI surface (`nsg crawl`, `nsg crawl-continual`) needs to work cleanly with the Instrumentarium's tool registration. Final CLI naming TBD — may need to revisit how the Instrumentarium maps tool IDs to CLI commands.
 
-The Fabricator scans kit `engines` contributions at startup (same pattern as the Instrumentarium scanning tools). The Walker contributes its engines like any other kit — no special registration path.
+The Fabricator scans kit `engines` contributions at startup (same pattern as the Instrumentarium scanning tools). The Spider contributes its engines like any other kit — no special registration path.
 
 ---
 
 ## The Walk Function
 
-The Walker's core is a single step function:
+The Spider's core is a single step function:
 
 ```typescript
-interface WalkerApi {
+interface SpiderApi {
   /**
    * Examine guild state and perform the single highest-priority action.
    * Returns a description of what was done, or null if there's nothing to do.
    */
-  walk(): Promise<WalkResult | null>
+  crawl(): Promise<CrawlResult | null>
 }
 
-type WalkResult =
+type CrawlResult =
   | { action: 'engine-completed'; rigId: string; engineId: string }
   | { action: 'engine-started'; rigId: string; engineId: string }
   | { action: 'rig-spawned'; rigId: string; writId: string }
   | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
 ```
 
-Each `walk()` call does exactly one thing. The priority ordering:
+Each `crawl()` call does exactly one thing. The priority ordering:
 
 1. **Collect a completed engine.** Scan all running rigs for an engine with `status === 'running'`. Read the session record from the sessions book by `engine.sessionId`. If the session has reached a terminal status (`completed` or `failed`), update the engine: set its status and populate its yields (or error). If the engine failed, mark the rig `failed` (same transaction). If the completed engine is the terminal engine (`seal`), mark the rig `completed` (same transaction). Rig status changes trigger the CDC handler (see below). Returns `rig-completed` if the rig transitioned, otherwise `engine-completed`. This is the first priority because it unblocks downstream engines.
-2. **Run a ready engine.** An engine is ready when `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`. Look up the `EngineDesign` by `designId` from the Fabricator. Assemble givens (from givensSpec) and context (with upstream yields), then call `design.run(givens, context)`. For clockwork engines (`status: 'completed'` result): store the yields on the engine instance, mark it completed, and check for rig completion (same as step 1). Returns `engine-completed` (or `rig-completed` if this was the terminal engine). For quick engines (`status: 'launched'` result): store the `sessionId`, mark the engine `running`. Returns `engine-started`. Completion is collected on subsequent walk calls via step 1.
+2. **Run a ready engine.** An engine is ready when `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`. Look up the `EngineDesign` by `designId` from the Fabricator. Assemble givens (from givensSpec) and context (with upstream yields), then call `design.run(givens, context)`. For clockwork engines (`status: 'completed'` result): store the yields on the engine instance, mark it completed, and check for rig completion (same as step 1). Returns `engine-completed` (or `rig-completed` if this was the terminal engine). For quick engines (`status: 'launched'` result): store the `sessionId`, mark the engine `running`. Returns `engine-started`. Completion is collected on subsequent crawl calls via step 1.
 3. **Spawn a rig.** If there's a ready writ with no rig, spawn the static graph. Returns `rig-spawned`.
 
 If nothing qualifies at any level, return null (the guild is idle or all work is blocked on running quick engines).
 
 ### Operational model: `start-walking`
 
-The Walker exports a `start-walking` tool that runs the walk loop:
+The Spider exports a `start-walking` tool that runs the crawl loop:
 
 ```
-nsg start-walking    # starts polling loop, walks every ~5s
-nsg walk             # single step (useful for debugging/testing)
+nsg start-crawling    # starts polling loop, walks every ~5s
+nsg crawl             # single step (useful for debugging/testing)
 ```
 
-The loop: call `walk()`, sleep `pollIntervalMs` (default 5000), repeat. When `walk()` returns null, the loop doesn't stop — it keeps polling. New writs posted via `nsg commission-post` from a separate terminal are picked up on the next poll cycle.
+The loop: call `crawl()`, sleep `pollIntervalMs` (default 5000), repeat. When `crawl()` returns null, the loop doesn't stop — it keeps polling. New writs posted via `nsg commission-post` from a separate terminal are picked up on the next poll cycle.
 
 ---
 
@@ -126,7 +126,7 @@ interface Rig {
 }
 ```
 
-Stored in the Stacks `rigs` book. One rig per writ. The Walker reads and updates rigs via normal Stacks `put()`/`patch()` operations.
+Stored in the Stacks `rigs` book. One rig per writ. The Spider reads and updates rigs via normal Stacks `put()`/`patch()` operations.
 
 ### Engine Instance
 
@@ -152,7 +152,7 @@ An engine is **ready** when: `status === 'pending'` and all engines in its `upst
 Every spawned rig gets this engine list:
 
 ```typescript
-function spawnStaticRig(writ: Writ, config: WalkerConfig): EngineInstance[] {
+function spawnStaticRig(writ: Writ, config: SpiderConfig): EngineInstance[] {
   return [
     { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],
       givensSpec: { writ }, yields: null },
@@ -168,7 +168,7 @@ function spawnStaticRig(writ: Writ, config: WalkerConfig): EngineInstance[] {
 }
 ```
 
-The `givensSpec` is populated from the Walker's config at rig spawn time. The rig is self-contained after spawning — no runtime config lookups needed. The `writ` is passed as a given to engines that need it (most do; `seal` doesn't). All engines start with `yields: null` — yields are populated when the engine completes (see [Yield Types](#yield-types-and-data-flow)).
+The `givensSpec` is populated from the Spider's config at rig spawn time. The rig is self-contained after spawning — no runtime config lookups needed. The `writ` is passed as a given to engines that need it (most do; `seal` doesn't). All engines start with `yields: null` — yields are populated when the engine completes (see [Yield Types](#yield-types-and-data-flow)).
 
 The rig is **completed** when the terminal engine (`seal`) has `status === 'completed'`. The rig is **failed** when any engine has `status === 'failed'`.
 
@@ -178,9 +178,9 @@ The rig is **completed** when the terminal engine (`seal`) has `status === 'comp
 
 Each engine produces typed yields that downstream engines consume. The yields are stored on the `EngineInstance.yields` field in the Stacks.
 
-**Serialization constraint:** Because yields are persisted to the Stacks (JSON-backed), all yield values **must be JSON-serializable**. The Walker should validate this at storage time — if an engine returns a non-serializable value (function, circular reference, etc.), the engine fails with a clear error. This is important because engines are a plugin extension point — kit authors need a hard boundary, not a silent corruption.
+**Serialization constraint:** Because yields are persisted to the Stacks (JSON-backed), all yield values **must be JSON-serializable**. The Spider should validate this at storage time — if an engine returns a non-serializable value (function, circular reference, etc.), the engine fails with a clear error. This is important because engines are a plugin extension point — kit authors need a hard boundary, not a silent corruption.
 
-When the Walker runs an engine, it assembles givens from the givensSpec only — upstream yields are **not** merged into givens. Engines that need upstream data access it via the `context.upstream` escape hatch:
+When the Spider runs an engine, it assembles givens from the givensSpec only — upstream yields are **not** merged into givens. Engines that need upstream data access it via the `context.upstream` escape hatch:
 
 ```typescript
 function assembleGivensAndContext(rig: Rig, engine: EngineInstance) {
@@ -292,7 +292,7 @@ interface SealYields {
 
 ## Engine Implementations
 
-Each engine is an `EngineDesign` contributed by the Walker's support kit. The engine's `run()` method receives assembled givens and a thin context, and returns an `EngineRunResult`. Engines pull apparatus dependencies via `guild().apparatus(...)`.
+Each engine is an `EngineDesign` contributed by the Spider's support kit. The engine's `run()` method receives assembled givens and a thin context, and returns an `EngineRunResult`. Engines pull apparatus dependencies via `guild().apparatus(...)`.
 
 ### `draft` (clockwork)
 
@@ -339,7 +339,7 @@ async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<E
 
 The implement engine wraps the writ body with a commit instruction — each engine owns its own prompt contract rather than relying on `dispatch.sh` to append instructions to the writ body.
 
-**Collect step (Walker, not engine):** When the Walker's collect step detects the session has completed, it builds the yields:
+**Collect step (Walker, not engine):** When the Spider's collect step detects the session has completed, it builds the yields:
 
 ```typescript
 // In Walker's collect step
@@ -454,7 +454,7 @@ Numbered list of specific changes needed, in priority order.
 Produce your findings as your final message in the format above.
 ```
 
-**Collect step:** The Walker retrieves the reviewer's findings from the session output — the reviewer produces structured markdown as its final message, and the Animator captures this on the session record. No file is written to the worktree (review artifacts don't belong in the codebase).
+**Collect step:** The Spider retrieves the reviewer's findings from the session output — the reviewer produces structured markdown as its final message, and the Animator captures this on the session record. No file is written to the worktree (review artifacts don't belong in the codebase).
 
 ```typescript
 // In Walker's collect step
@@ -573,7 +573,7 @@ The seal engine does **not** transition the writ — that's handled by the CDC h
 
 ## CDC Handler
 
-The Walker registers one CDC handler at startup:
+The Spider registers one CDC handler at startup:
 
 ### Rig terminal state → writ transition
 
@@ -620,7 +620,7 @@ When any engine fails (throws, or a quick engine's session has `status: 'failed'
 
 No retry. No recovery. The patron inspects and decides what to do. This is appropriate for the static rig — see [Future Evolution](#future-evolution) for the retry/recovery direction.
 
-Quick engine "failure" definition: if the Animator session completes with `status: 'failed'`, the engine fails. If the session completes with `status: 'completed'`, the engine succeeds — even if the anima's work is incomplete (that's the review engine's job to catch, not the Walker's).
+Quick engine "failure" definition: if the Animator session completes with `status: 'failed'`, the engine fails. If the session completes with `status: 'completed'`, the engine succeeds — even if the anima's work is incomplete (that's the review engine's job to catch, not the Spider's).
 
 ---
 
@@ -642,14 +642,14 @@ Walker
 
 ## Future Evolution
 
-These are known directions the Walker and its data model will grow. None are in scope for the static rig MVP.
+These are known directions the Spider and its data model will grow. None are in scope for the static rig MVP.
 
 - **givensSpec templates.** The givensSpec currently holds literal values set at rig spawn time. It will grow to support template expressions (e.g. `${draft.worktreePath}`) that resolve specific values from upstream yields into typed givens, replacing the current reliance on the `context.upstream` escape hatch.
 - **Engine needs declarations.** Engine designs will declare a `needs` specification that controls which upstream yields are included and how they're mapped — making the data flow between engines explicit and type-safe.
 - **Typed engine contracts.** The `Record<string, unknown>` givens map with type assertions is scaffolding. The needs/planning system will introduce typed contracts between engines — defining what each engine requires and provides. This scaffolding gets replaced, not extended.
 - **Dynamic rig extension.** Capability resolution (via the Fabricator) and rig growth at runtime. Engines can declare needs that the Fabricator resolves to additional engine chains, grafted onto the rig mid-execution.
 - **Retry and recovery.** The static rig has no retry. Recovery logic arrives with dynamic extension — a failed engine can trigger a recovery chain rather than failing the whole rig.
-- **Engine timeouts.** The `startedAt` field on engine instances is included in the data model for future use. During the collect step, the Walker checks `startedAt` against a configurable timeout. If an engine has been running longer than the threshold, the Walker marks it failed (and optionally terminates the session).
+- **Engine timeouts.** The `startedAt` field on engine instances is included in the data model for future use. During the collect step, the Spider checks `startedAt` against a configurable timeout. If an engine has been running longer than the threshold, the Spider marks it failed (and optionally terminates the session).
 - **Unified capability catalog.** The Fabricator may absorb tool designs from the Instrumentarium, becoming the single answer to "what can this guild do?" regardless of whether the answer is an engine or a tool.
 
 ---
@@ -657,8 +657,8 @@ These are known directions the Walker and its data model will grow. None are in
 ## What This Spec Does NOT Cover
 
 - **Origination.** Commission → rig mapping is hardcoded (static graph).
-- **The Executor as a separate apparatus.** The Walker runs engines directly — clockwork engines inline, quick engines via the Animator. The Executor earns its independence when substrate switching (Docker, remote VM) is needed.
-- **Concurrent rigs.** The priority system supports multiple rigs in principle, but the polling loop + single-guild model means we process one commission at a time in practice. Concurrency comes naturally when the Walker processes multiple ready engines across rigs.
+- **The Executor as a separate apparatus.** The Spider runs engines directly — clockwork engines inline, quick engines via the Animator. The Executor earns its independence when substrate switching (Docker, remote VM) is needed.
+- **Concurrent rigs.** The priority system supports multiple rigs in principle, but the polling loop + single-guild model means we process one commission at a time in practice. Concurrency comes naturally when the Spider processes multiple ready engines across rigs.
 - **Reviewer role curriculum/temperament.** The `reviewer` role exists with a blank identity. The review engine assembles the prompt. Loom content for the reviewer is a separate concern.
 
 ---
diff --git a/docs/architecture/index.md b/docs/architecture/index.md
index 917cca6..8619bdc 100644
--- a/docs/architecture/index.md
+++ b/docs/architecture/index.md
@@ -10,7 +10,7 @@ For the conceptual vocabulary — what guilds, animas, commissions, writs, and a
 
 > This section describes the **standard guild** — the configuration `nsg init` produces. The framework itself is a plugin loader; every apparatus named below is part of the default plugin set, not a hard requirement. §4 ([Plugin Architecture](#plugin-architecture)) explains the underlying model; the [Standard Guild](#the-standard-guild) section catalogues what the default set includes.
 
-A Nexus guild is a git repository with a `guild.json` at its root and a `.nexus/` directory holding runtime state. When the system starts, **Arbor** — the guild runtime — reads `guild.json`, loads the declared plugins, validates their dependencies, and starts each apparatus in order. From that point, the guild operates: the patron commissions work; **The Clerk** receives it and issues writs; **The Walker** assembles rigs and drives their engines to completion; **The Clockworks** turns events into action, activating relays in response to standing orders; and **anima sessions** — AI processes launched by **The Animator** — do the work that requires judgment. Results land in codexes and documents; the patron consumes what the guild delivers.
+A Nexus guild is a git repository with a `guild.json` at its root and a `.nexus/` directory holding runtime state. When the system starts, **Arbor** — the guild runtime — reads `guild.json`, loads the declared plugins, validates their dependencies, and starts each apparatus in order. From that point, the guild operates: the patron commissions work; **The Clerk** receives it and issues writs; **The Spider** assembles rigs and drives their engines to completion; **The Clockworks** turns events into action, activating relays in response to standing orders; and **anima sessions** — AI processes launched by **The Animator** — do the work that requires judgment. Results land in codexes and documents; the patron consumes what the guild delivers.
 
 ```
   PATRON
@@ -26,7 +26,7 @@ A Nexus guild is a git repository with a `guild.json` at its root and a `.nexus/
   │  ├───────────────────────────────────────────────────────┤  │
   │  │  Clockworks · Surveyor · Clerk                        │  │
   │  ├───────────────────────────────────────────────────────┤  │
-  │  │  Walker · Fabricator · Executor                        │  │
+  │  │  Spider · Fabricator · Executor                        │  │
   │  │  Loom · Animator                                      │  │
   │  └─────────────────────────┬─────────────────────────────┘  │
   │                            │                                 │
@@ -66,13 +66,13 @@ Two additional commands bypass the tool registry: `nsg consult` and `nsg convene
 
 ### The Apparatus
 
-The guild's operational fabric is provided by apparatus — plugins with a start/stop lifecycle that Arbor starts in dependency order. **The Stacks** is the persistence substrate everything else reads from and writes to. **The Scriptorium** manages codexes — bare clones, draft bindings (worktrees), and the seal-and-push lifecycle. **The Clockworks** is the event-driven nervous system: standing orders bind events to relays, and the summon relay dispatches anima sessions in response. **The Surveyor** tracks what work applies to each registered codex. **The Clerk** handles commission intake, converting patron requests into writs and signaling when work is ready to execute. The Fabricator, Walker, Executor, Loom, and Animator then take it from there — covered in the next section.
+The guild's operational fabric is provided by apparatus — plugins with a start/stop lifecycle that Arbor starts in dependency order. **The Stacks** is the persistence substrate everything else reads from and writes to. **The Scriptorium** manages codexes — bare clones, draft bindings (worktrees), and the seal-and-push lifecycle. **The Clockworks** is the event-driven nervous system: standing orders bind events to relays, and the summon relay dispatches anima sessions in response. **The Surveyor** tracks what work applies to each registered codex. **The Clerk** handles commission intake, converting patron requests into writs and signaling when work is ready to execute. The Fabricator, Spider, Executor, Loom, and Animator then take it from there — covered in the next section.
 
 Each of these is a plugin from the default set, not a built-in. The [Standard Guild](#the-standard-guild) section lists them; the sections that follow document each in detail.
 
 ### Execution, Sessions, and Works
 
-When The Clerk signals a writ is ready, **The Walker** spawns a rig and begins driving it: traversing active engines, dispatching those whose upstream work is complete, and extending the rig by querying **The Fabricator** for engine chains that satisfy declared needs. **The Executor** runs each engine — clockwork engines run their code directly; quick engines launch an anima session.
+When The Clerk signals a writ is ready, **The Spider** spawns a rig and begins driving it: traversing active engines, dispatching those whose upstream work is complete, and extending the rig by querying **The Fabricator** for engine chains that satisfy declared needs. **The Executor** runs each engine — clockwork engines run their code directly; quick engines launch an anima session.
 
 An anima session is an AI process running against an MCP server loaded with the role's tools. Before launch, **The Loom** weaves the session context: system prompt, tool instructions, writ context. **The Animator** then starts the process, monitors it, and records the result. The session exits; the output persists. The Clockworks can also trigger sessions directly via the summon relay, bypassing the rig machinery entirely — The Animator handles both paths the same way.
 
@@ -166,7 +166,7 @@ In the standard guild, `clockworks` contains events and standing orders; `codexe
 
 ## Plugin Architecture
 
-The apparatus described in §2 — The Stacks, The Clockworks, The Clerk, The Walker, and the rest — are all plugins. There is no privileged built-in layer. Arbor, the guild runtime, is only a plugin loader, a dependency graph, and the startup/shutdown lifecycle for what gets loaded. Every piece of operational infrastructure is contributed by a plugin package; the standard guild is simply a particular set of those packages.
+The apparatus described in §2 — The Stacks, The Clockworks, The Clerk, The Spider, and the rest — are all plugins. There is no privileged built-in layer. Arbor, the guild runtime, is only a plugin loader, a dependency graph, and the startup/shutdown lifecycle for what gets loaded. Every piece of operational infrastructure is contributed by a plugin package; the standard guild is simply a particular set of those packages.
 
 Plugins come in two kinds: **kits** and **apparatus**. This section introduces them; [Plugin Architecture](plugins.md) is the full specification.
 
@@ -179,7 +179,7 @@ A **kit** is a passive package contributing capabilities to the guild. Kits have
 export default {
   kit: {
     requires:   ["books"],
-    recommends: ["clockworks", "walker"],
+    recommends: ["clockworks", "spider"],
     engines: [createBranchEngine, mergeBranchEngine],
     relays:  [onMergeRelay],
     tools:   [statusTool, diffTool],
@@ -189,7 +189,7 @@ export default {
 
 A kit is an **open record**: the contribution fields (`engines`, `relays`, `tools`, etc.) are defined by the apparatus packages that consume them, not by the framework. The framework only reads `requires` (hard dependency on an apparatus — validated at startup) and `recommends` (advisory — generates a startup warning if absent). Everything else is forwarded opaquely to consuming apparatus via the `plugin:initialized` lifecycle event.
 
-Type safety for contribution fields is opt-in — each apparatus publishes a kit interface (`ClockworksKit`, `WalkerKit`, etc.) that kit authors can import and `satisfies` against.
+Type safety for contribution fields is opt-in — each apparatus publishes a kit interface (`ClockworksKit`, `SpiderKit`, etc.) that kit authors can import and `satisfies` against.
 
 ### Apparatus
 
@@ -246,7 +246,7 @@ Plugins are listed in `guild.json` by their plugin id. The framework determines
 
 ```json
 {
-  "plugins": ["books", "clockworks", "walker", "sessions", "nexus-git"]
+  "plugins": ["books", "clockworks", "spider", "sessions", "nexus-git"]
 }
 ```
 
@@ -279,7 +279,7 @@ Each section introduces one or more apparatus or kits from the default set. Unde
 | **The Instrumentarium** | `tools` | Tool registry — resolves installed tools, permission-gated tool sets |
 | **The Animator** | `animator` | Session lifecycle — launches, monitors, and records anima sessions |
 | **The Fabricator** | `fabricator` | Engine design registry — answers "what engine chain satisfies this need?" from installed kits |
-| **The Walker** | `walker` | Rig lifecycle — spawns, traverses, extends, and strikes rigs as work progresses |
+| **The Spider** | `spider` | Rig lifecycle — spawns, traverses, extends, and strikes rigs as work progresses |
 | **The Executor** | `executor` | Engine runner — executes clockwork and quick engines against a configured substrate |
 
 ### Default Kits
@@ -358,7 +358,7 @@ See [The Stacks — API Contract](apparatus/stacks.md) for the full specificatio
 
 ## Work Model
 
-<!-- TODO: The obligation pipeline. Commission (patron's request) → Mandate writ (guild's formal record, created by Clerk) → child writs as the guild decomposes the work → Rigs as the execution scaffolding for a writ. Writ lifecycle (ready → active → pending → completed/failed/cancelled). Writ hierarchy and completion rollup. Brief intro to rigs (assembled by Walker from engine designs contributed by kits via Fabricator). Link to rigging.md for rig execution detail. -->
+<!-- TODO: The obligation pipeline. Commission (patron's request) → Mandate writ (guild's formal record, created by Clerk) → child writs as the guild decomposes the work → Rigs as the execution scaffolding for a writ. Writ lifecycle (ready → active → pending → completed/failed/cancelled). Writ hierarchy and completion rollup. Brief intro to rigs (assembled by Spider from engine designs contributed by kits via Fabricator). Link to rigging.md for rig execution detail. -->
 
 ---
 
@@ -392,12 +392,12 @@ Tools can be TypeScript modules or plain scripts (bash, Python, any executable).
 
 ### Engines
 
-**Engines** are the workhorse components of rigs — bounded units of work the Walker mounts and sets in motion. An engine runs when its upstream dependencies (givens) are satisfied and produces yields when done. Two kinds:
+**Engines** are the workhorse components of rigs — bounded units of work the Spider mounts and sets in motion. An engine runs when its upstream dependencies (givens) are satisfied and produces yields when done. Two kinds:
 
 - **Clockwork** — deterministic, no AI. Runs its code directly against the configured substrate.
 - **Quick** — inhabited by an anima for work requiring judgment. The engine defines the work context; the anima brings the skill.
 
-Kits contribute engine designs; the Walker draws on them (via The Fabricator) to extend rigs as work progresses. Engines are not role-gated — they are not wielded by animas directly; they are the work context an anima staffs.
+Kits contribute engine designs; the Spider draws on them (via The Fabricator) to extend rigs as work progresses. Engines are not role-gated — they are not wielded by animas directly; they are the work context an anima staffs.
 
 ### Relays
 
@@ -408,7 +408,7 @@ Kits contribute engine designs; the Walker draws on them (via The Fabricator) to
 | | Tools | Engines | Relays |
 |---|---|---|---|
 | **Purpose** | Instruments animas wield | Rig workhorses | Clockworks event handlers |
-| **Invoked by** | Animas (MCP), humans (CLI), code | Walker (within a rig) | Clockworks runner (standing order) |
+| **Invoked by** | Animas (MCP), humans (CLI), code | Spider (within a rig) | Clockworks runner (standing order) |
 | **Role gating?** | Yes | No | No |
 | **Instructions?** | Optional | No | No |
 | **Clockwork or quick?** | Neither (runs on demand) | Either | Always clockwork |
diff --git a/docs/architecture/kit-components.md b/docs/architecture/kit-components.md
index 354f801..4d26a9a 100644
--- a/docs/architecture/kit-components.md
+++ b/docs/architecture/kit-components.md
@@ -10,7 +10,7 @@ This document describes the artifact model for the guild's installable capabilit
 
 Tools are accessible through multiple paths: animas invoke them as MCP tools during sessions; humans invoke them via the `nexus` CLI; relays and other tools can import them programmatically. All paths execute the same logic with the same inputs and outputs — the tool author writes the logic once.
 
-**Engines** are the workhorse components of rigs — the units of work the Walker mounts and sets in motion. An engine does one bounded piece of work, runs when its upstream dependencies are satisfied, and produces a yield when done. Kits contribute engine designs; the Walker draws on them to extend rigs as needed. An engine may be clockwork (deterministic, no anima required) or quick (inhabited by an anima for work requiring judgment). Engines are described by a `nexus-engine.json` descriptor.
+**Engines** are the workhorse components of rigs — the units of work the Spider mounts and sets in motion. An engine does one bounded piece of work, runs when its upstream dependencies are satisfied, and produces a yield when done. Kits contribute engine designs; the Spider draws on them to extend rigs as needed. An engine may be clockwork (deterministic, no anima required) or quick (inhabited by an anima for work requiring judgment). Engines are described by a `nexus-engine.json` descriptor.
 
 **Relays** are Clockworks handlers — purpose-built to respond to events via standing orders. A relay exports a standard `relay()` contract that the Clockworks runner calls. All relays are clockwork. See [clockworks.md](clockworks.md) for the relay contract and standing order mechanics. Relays are described by a `nexus-relay.json` descriptor.
 
@@ -407,8 +407,8 @@ The guildhall is never a workspace — artifacts flow in through deliberate inst
 
 | | Tools | Engines | Relays |
 |---|---|---|---|
-| Purpose | Instruments animas wield | Rig workhorses (Walker mounts them) | Clockworks handlers |
-| Invoked by | Animas (MCP), humans (CLI), code (import) | Walker (event-driven within a rig) | Clockworks runner (standing order) |
+| Purpose | Instruments animas wield | Rig workhorses (Spider mounts them) | Clockworks handlers |
+| Invoked by | Animas (MCP), humans (CLI), code (import) | Spider (event-driven within a rig) | Clockworks runner (standing order) |
 | Descriptor | `nexus-tool.json` | `nexus-engine.json` | `nexus-relay.json` |
 | SDK factory | `tool()` | none required (engine logic is the rig work) | `relay()` |
 | Instructions doc? | Optional (anima guidance) | No | No |
diff --git a/docs/architecture/plugins.md b/docs/architecture/plugins.md
index 7445687..c45c938 100644
--- a/docs/architecture/plugins.md
+++ b/docs/architecture/plugins.md
@@ -6,7 +6,7 @@ This document describes the plugin system — how the guild's capabilities are p
 
 ## Overview
 
-The guild framework ships with no running infrastructure of its own. The Clockworks, the Walker, the Surveyor — everything that makes a guild operational is contributed by plugins. `nsg init` installs a default plugin set; a guild's installed plugins determine what it can do.
+The guild framework ships with no running infrastructure of its own. The Clockworks, the Spider, the Surveyor — everything that makes a guild operational is contributed by plugins. `nsg init` installs a default plugin set; a guild's installed plugins determine what it can do.
 
 This is a deliberate design choice. Keeping the framework core to a plugin loader and a set of type contracts means each piece of infrastructure is independently testable, replaceable, and comprehensible. There is no privileged built-in layer; a core apparatus and a community kit are the same kind of thing.
 
@@ -41,24 +41,24 @@ A kit package exports its manifest as the default export:
 
 ```typescript
 import type { ClockworksKit } from "nexus-clockworks"
-import type { WalkerKit }     from "nexus-walker"
+import type { SpiderKit }     from "nexus-spider"
 import type { AnimaKit }      from "nexus-sessions"
 
 export default {
   kit: {
     requires:   ["nexus-books"],
-    recommends: ["nexus-clockworks", "nexus-walker"],
+    recommends: ["nexus-clockworks", "nexus-spider"],
     engines: [createBranchEngine, deleteBranchEngine, mergeBranchEngine],
     relays:  [onMergeRelay],
     tools:   [statusTool, diffTool, logTool],
-  } satisfies ClockworksKit & WalkerKit & AnimaKit,
+  } satisfies ClockworksKit & SpiderKit & AnimaKit,
 } satisfies Plugin
 ```
 
 Type safety for contribution fields is provided by the apparatus that consumes them — not by the framework. Each apparatus package publishes a kit interface that kit authors can import and `satisfies` against:
 
 - `ClockworksKit` — defines `relays`. See [ClockworksKit](clockworks.md#clockworkskit).
-- `WalkerKit` — defines `engines`. See [Engine Designs](engine-designs.md).
+- `SpiderKit` — defines `engines`. See [Engine Designs](engine-designs.md).
 - `AnimaKit` — defines `tools`. See [Tools](anima-lifecycle.md#tools).
 
 Kit authors who don't want or need static type checking simply write a plain object — both approaches are valid.
@@ -69,7 +69,7 @@ The framework never inspects contribution field contents. It sees kit records as
 
 ## Apparatus
 
-An apparatus is a package contributing persistent running infrastructure to the guild. It implements a lifecycle in `start` and `stop`. The Clockworks, Walker, and Surveyor are all apparatuses.
+An apparatus is a package contributing persistent running infrastructure to the guild. It implements a lifecycle in `start` and `stop`. The Clockworks, Spider, and Surveyor are all apparatuses.
 
 ```typescript
 type Apparatus = {
@@ -299,7 +299,7 @@ warn: nexus-signals contributes relays but no installed apparatus consumes "rela
 warn: nexus-git contributes engines but no installed apparatus consumes "engines"
 ```
 
-Warnings surface at startup where an operator can act on them — not silently at runtime when a commission fails because no Walker is present.
+Warnings surface at startup where an operator can act on them — not silently at runtime when a commission fails because no Spider is present.
 
 ### Design Notes
 
@@ -492,7 +492,7 @@ The Kit/Apparatus split makes this concrete: everything contributed by a kit is
 
 ## Failure Modes
 
-**Missing dependency** — a plugin declares `requires: ["nexus-clockworks"]` and that plugin is not installed. Loud startup failure before any apparatus starts: *"nexus-walker requires nexus-clockworks, which is not installed."*
+**Missing dependency** — a plugin declares `requires: ["nexus-clockworks"]` and that plugin is not installed. Loud startup failure before any apparatus starts: *"nexus-spider requires nexus-clockworks, which is not installed."*
 
 **Plugin provides nothing** — `guild().apparatus("nexus-git")` where the apparatus has no `provides`. Returns a sentinel; throws with a useful message on access.
 
@@ -508,7 +508,7 @@ Installed plugins are declared in `guild.json`:
 {
   "plugins": [
     "nexus-clockworks",
-    "nexus-walker",
+    "nexus-spider",
     "nexus-surveyor",
     "nexus-stacks",
     "nexus-git"
diff --git a/docs/architecture/rigging.md b/docs/architecture/rigging.md
index 96a4adc..4345871 100644
--- a/docs/architecture/rigging.md
+++ b/docs/architecture/rigging.md
@@ -8,9 +8,9 @@ The rigging system is not a single apparatus. It is four apparatus working in co
 
 ## Apparatus
 
-### Walker
+### Spider
 
-The Walker is the spine of the rigging system. It owns the rig's structural lifecycle from spawn to completion — and nothing else. The Walker does not know how to resolve capabilities, run engines, or manage AI sessions; it delegates all of those to other apparatus. What it does:
+The Spider is the spine of the rigging system. It owns the rig's structural lifecycle from spawn to completion — and nothing else. The Spider does not know how to resolve capabilities, run engines, or manage AI sessions; it delegates all of those to other apparatus. What it does:
 
 - Spawn a rig when the Clerk signals a writ is ready
 - Traverse all active rigs, identifying engines whose upstream is complete
@@ -18,30 +18,30 @@ The Walker is the spine of the rigging system. It owns the rig's structural life
 - Dispatch ready engines to the Executor
 - Strike completed rigs and signal the Clerk
 
-The Walker runs continuously — not bound to any single rig or commission.
+The Spider runs continuously — not bound to any single rig or commission.
 
 ### Fabricator
 
-The Fabricator is the guild's capability catalog — the authoritative collection of engine design specifications. Every installed kit contributes its engine designs to the Fabricator at startup. When an engine in a rig declares a need it cannot yet satisfy, the Walker queries the Fabricator:
+The Fabricator is the guild's capability catalog — the authoritative collection of engine design specifications. Every installed kit contributes its engine designs to the Fabricator at startup. When an engine in a rig declares a need it cannot yet satisfy, the Spider queries the Fabricator:
 
 ```
 fabricator.resolve(need, installedKits) → EngineChain
 ```
 
-The Fabricator returns the chain of engine designs that satisfies the need; the Walker grafts that chain onto the rig. The Fabricator does not touch the rig — it is a pure query service.
+The Fabricator returns the chain of engine designs that satisfies the need; the Spider grafts that chain onto the rig. The Fabricator does not touch the rig — it is a pure query service.
 
 The Fabricator is also consulted directly by planning animas (Sages) when decomposing a commission: before planning work, a Sage can introspect what the guild is actually capable of building.
 
 ### Executor
 
-The Executor runs engine instances. It is the substrate abstraction layer — the Walker calls `executor.run(engine, inputs)` for any ready engine, without knowing or caring whether the engine runs locally, in a Docker container, on a remote VM, or otherwise.
+The Executor runs engine instances. It is the substrate abstraction layer — the Spider calls `executor.run(engine, inputs)` for any ready engine, without knowing or caring whether the engine runs locally, in a Docker container, on a remote VM, or otherwise.
 
 The Executor handles two engine kinds:
 
 - **Clockwork engines** — deterministic, no AI. The Executor runs the engine code directly against its configured substrate.
 - **Quick engines** — AI-backed. The Executor calls the Manifester to compose the anima's session context, then the Summoner to launch and manage the AI session. The yields are the session's output.
 
-From the Walker's perspective, both kinds look identical: givens in, yields out.
+From the Spider's perspective, both kinds look identical: givens in, yields out.
 
 ### Manifester *(dependency)*
 
@@ -53,7 +53,7 @@ The Summoner is a foundational apparatus used by more than the rigging system 
 
 ### Clerk *(dependency)*
 
-The Clerk owns the obligation layer. It signals the Walker when a writ is ready for a rig, and receives completion signals when a rig is struck. The rigging system reports back to the Clerk but does not manage writs itself.
+The Clerk owns the obligation layer. It signals the Spider when a writ is ready for a rig, and receives completion signals when a rig is struck. The rigging system reports back to the Clerk but does not manage writs itself.
 
 ---
 
@@ -61,13 +61,13 @@ The Clerk owns the obligation layer. It signals the Walker when a writ is ready
 
 | # | Step | Apparatus |
 |---|------|-----------|
-| 1 | Writ becomes ready; spawn initial rig | **Walker** *(triggered by Clerk)* |
+| 1 | Writ becomes ready; spawn initial rig | **Spider** *(triggered by Clerk)* |
 | 2 | Engine declares a need; scan installed kits; determine satisfying engine chain | **Fabricator** |
-| 3 | Graft resolved engine chain onto rig structure | **Walker** *(using Fabricator output)* |
-| 4 | Traverse active rigs; identify engines whose upstream is complete | **Walker** |
+| 3 | Graft resolved engine chain onto rig structure | **Spider** *(using Fabricator output)* |
+| 4 | Traverse active rigs; identify engines whose upstream is complete | **Spider** |
 | 5 | Execute ready engine — clockwork or quick, any substrate | **Executor** *(routes to substrate or Manifester → Summoner)* |
-| 6 | Record engine yields; propagate completion state to downstream engines | **Executor** *(yields)* → **Walker** *(state propagation)* |
-| 7 | Detect rig fully complete; signal Clerk; strike rig | **Walker** → **Clerk** |
+| 6 | Record engine yields; propagate completion state to downstream engines | **Executor** *(yields)* → **Spider** *(state propagation)* |
+| 7 | Detect rig fully complete; signal Clerk; strike rig | **Spider** → **Clerk** |
 
 Steps 2–3 repeat as needed throughout a rig's life — engines declare needs at runtime, and the rig grows as it runs. Steps 4–6 also repeat in a continuous traversal loop. Steps 1 and 7 are the lifecycle bookends.
 
@@ -75,28 +75,28 @@ Steps 2–3 repeat as needed throughout a rig's life — engines declare needs a
 
 ## Design Rationale
 
-### Why Fabricator is separate from Walker
+### Why Fabricator is separate from Spider
 
-The natural first instinct is to put capability resolution inside the Walker — it's the Walker that needs the answer, after all. The Fabricator earns its independence from two directions:
+The natural first instinct is to put capability resolution inside the Spider — it's the Spider that needs the answer, after all. The Fabricator earns its independence from two directions:
 
-1. **The Sage case.** Planning animas need to know what the guild can build before they decompose a commission into writs. If capability resolution is internal to the Walker, the Sage has no clean way to query it. A standalone Fabricator is a shared service both the Walker and the Sage can call.
+1. **The Sage case.** Planning animas need to know what the guild can build before they decompose a commission into writs. If capability resolution is internal to the Spider, the Sage has no clean way to query it. A standalone Fabricator is a shared service both the Spider and the Sage can call.
 
-2. **Separation of concerns.** The Walker's job is motion — advancing what's already planned. Capability reasoning ("what engines can satisfy this need, given the installed kits?") is a different cognitive mode. Keeping them separate keeps both apparatus well-scoped and independently testable.
+2. **Separation of concerns.** The Spider's job is motion — advancing what's already planned. Capability reasoning ("what engines can satisfy this need, given the installed kits?") is a different cognitive mode. Keeping them separate keeps both apparatus well-scoped and independently testable.
 
 ### Why Executor handles both engine kinds
 
-From the Walker's perspective, clockwork and quick engines are the same shape: givens in, yields out. Unifying execution in the Executor means the Walker has one dispatch call for any engine type, and the distinction between "run some code" and "run an AI session" lives entirely within the Executor. The substrate-switching logic (local vs Docker vs remote VM) and the AI session management logic are both Executor concerns — neither bleeds into the Walker.
+From the Spider's perspective, clockwork and quick engines are the same shape: givens in, yields out. Unifying execution in the Executor means the Spider has one dispatch call for any engine type, and the distinction between "run some code" and "run an AI session" lives entirely within the Executor. The substrate-switching logic (local vs Docker vs remote VM) and the AI session management logic are both Executor concerns — neither bleeds into the Spider.
 
 ### Why Summoner is not rig-specific
 
-The Summoner manages agentic AI sessions wherever they're needed — not just in rigs. The Clockworks Summon Relay dispatches animas in response to standing orders without going through the rigging system at all. Making the Summoner a foundational apparatus (not a Walker dependency) reflects this: the Executor uses the Summoner, but the Summoner doesn't know it's inside a rig.
+The Summoner manages agentic AI sessions wherever they're needed — not just in rigs. The Clockworks Summon Relay dispatches animas in response to standing orders without going through the rigging system at all. Making the Summoner a foundational apparatus (not a Spider dependency) reflects this: the Executor uses the Summoner, but the Summoner doesn't know it's inside a rig.
 
-### Clerk / Walker boundary
+### Clerk / Spider boundary
 
-The Clerk and the Walker are in contact at two points — writ-ready signals in, completion signals out — but own entirely different domains:
+The Clerk and the Spider are in contact at two points — writ-ready signals in, completion signals out — but own entirely different domains:
 
 - The **Clerk** tracks obligations: what has been commissioned, what is owed, what state each writ is in.
-- The **Walker** tracks execution: what rigs are active, what engines are running, what has been completed.
+- The **Spider** tracks execution: what rigs are active, what engines are running, what has been completed.
 
 Writs can exist without rigs (awaiting planning or dependencies). Rigs always trace back to a writ. The boundary keeps the obligation record clean from execution machinery.
 
@@ -108,7 +108,7 @@ Writs can exist without rigs (awaiting planning or dependencies). Rigs always tr
              Clerk
                │ (writ:ready / rig:complete)
                ▼
-            Walker ──────────────── Fabricator
+            Spider ──────────────── Fabricator
                │
                ▼
             Executor
@@ -122,4 +122,4 @@ Writs can exist without rigs (awaiting planning or dependencies). Rigs always tr
                   Stacks (Daybook)
 ```
 
-The Walker is the only rigging apparatus that touches the Clerk. The Executor is the only rigging apparatus that touches the Summoner. The Fabricator is a stateless query service with no downstream dependencies of its own — it reads from the kit registry provided by installed plugins at startup.
+The Spider is the only rigging apparatus that touches the Clerk. The Executor is the only rigging apparatus that touches the Summoner. The Fabricator is a stateless query service with no downstream dependencies of its own — it reads from the kit registry provided by installed plugins at startup.
diff --git a/docs/guild-metaphor.md b/docs/guild-metaphor.md
index eae1997..6e5ffcb 100644
--- a/docs/guild-metaphor.md
+++ b/docs/guild-metaphor.md
@@ -75,13 +75,13 @@ When a writ is concrete enough to act on, it spawns a **rig** to carry the oblig
 
 ### Rig
 
-The working structure assembled to fulfill a commission. A rig is seeded at commission time — a minimal starting point representing what must be achieved. From there the Walker builds it out: adding engines and arranging them in sequence, each depending on the work of those before it. Some engines are clockwork; others are quick — inhabited by an anima. A rig is never delivered to the patron; it is the scaffolding that enables delivery. When the work is done, the obligation is fulfilled and the rig is struck.
+The working structure assembled to fulfill a commission. A rig is seeded at commission time — a minimal starting point representing what must be achieved. From there the Spider builds it out: adding engines and arranging them in sequence, each depending on the work of those before it. Some engines are clockwork; others are quick — inhabited by an anima. A rig is never delivered to the patron; it is the scaffolding that enables delivery. When the work is done, the obligation is fulfilled and the rig is struck.
 
 Rigs are dynamic. Any engine whose work is not yet complete may be replaced with a chain of engines, allowing the rig to grow and adapt as the work unfolds. Engines that have completed their work are fixed — their yield is final.
 
 ### Engine
 
-Engines are the workhorse components of a rig — purpose-built machines the guild puts to work. Each engine does one bounded piece of work: runs when its upstream work is ready, produces a yield when done. The same engine design may run in many rigs at once, each working independently. Kits bring engine designs to the guild; the Walker mounts them as each rig demands.
+Engines are the workhorse components of a rig — purpose-built machines the guild puts to work. Each engine does one bounded piece of work: runs when its upstream work is ready, produces a yield when done. The same engine design may run in many rigs at once, each working independently. Kits bring engine designs to the guild; the Spider mounts them as each rig demands.
 
 Two kinds:
 
@@ -112,7 +112,7 @@ A body of inscriptions that compels a system to behave. The guild's primary and
 | **Abandoning** | Setting a draft binding aside without sealing. The work persists in the Daybook but never becomes authoritative |
 | **Edition** | The sealed binding at a specific significant moment — marked, versioned, and distributed |
 
-A commission arrives; the Walker opens a draft binding from the codex; an anima staffs the engine — inscribing changes, building up the draft. When the anima signals completion, the sealing engine incorporates the draft into the sealed binding. The codex grows. If the draft contradicts the sealed binding, the sealing engine seizes; the draft must be reconciled before sealing can proceed.
+A commission arrives; the Spider opens a draft binding from the codex; an anima staffs the engine — inscribing changes, building up the draft. When the anima signals completion, the sealing engine incorporates the draft into the sealed binding. The codex grows. If the draft contradicts the sealed binding, the sealing engine seizes; the draft must be reconciled before sealing can proceed.
 
 A codex may have multiple draft bindings open simultaneously. Each is independent. Each must be sealed or abandoned on its own terms.
 
@@ -150,13 +150,13 @@ A named, versioned, immutable personality template. A temperament governs an ani
 
 ### Apparatus
 
-A named, persistent, deterministic system that predates any commission and outlasts any rig is an **apparatus** — the guild's operational fabric. Apparatus are always running; they hold no craft, no spirit, no judgment. Where animas are animated and engines do the work of rigs, apparatus are the guild itself in continuous operation. The Clockworks, the Walker, and the Surveyor are the guild's core apparatus. The set is not fixed — a guild may install additional apparatus as its needs grow.
+A named, persistent, deterministic system that predates any commission and outlasts any rig is an **apparatus** — the guild's operational fabric. Apparatus are always running; they hold no craft, no spirit, no judgment. Where animas are animated and engines do the work of rigs, apparatus are the guild itself in continuous operation. The Clockworks, the Spider, and the Surveyor are the guild's core apparatus. The set is not fixed — a guild may install additional apparatus as its needs grow.
 
 ### Kit
 
-A bundle of engine designs and anima tools contributed to extend what the guild can build. A kit declares what needs it can meet, what prior work it requires, and what chain of engines it will assemble to meet those needs. The Walker draws from installed kits when extending a rig — a guild's installed kits determine what work it can take on.
+A bundle of engine designs and anima tools contributed to extend what the guild can build. A kit declares what needs it can meet, what prior work it requires, and what chain of engines it will assemble to meet those needs. The Spider draws from installed kits when extending a rig — a guild's installed kits determine what work it can take on.
 
-Kits are the guild's extension points. A guild without kits can accept commissions but cannot fulfill them. Each installed kit extends the range of work the Walker can set in motion.
+Kits are the guild's extension points. A guild without kits can accept commissions but cannot fulfill them. Each installed kit extends the range of work the Spider can set in motion.
 
 ### The Clockworks
 
@@ -172,11 +172,11 @@ All relays are clockwork. The summon relay is the built-in relay that handles an
 
 A registered response to an event, defined in `guild.json`. A standing order says: *whenever this event is signaled, do this*. All standing orders invoke relays via the `run` verb. The `summon` verb is syntactic sugar — it invokes the **summon relay**, which manifests an anima in the named role and delivers the event as their context. Standing orders may carry additional params (like `maxSessions` for the circuit breaker) that configure the relay's behavior. Standing orders are guild policy — they live in configuration, not in relay code.
 
-### The Walker
+### The Spider
 
-The apparatus that keeps all active rigs in motion. The Walker moves continuously through every active rig — not bound to any single commission, predating and outlasting them all. When an engine is ready to run, the Walker sets it in motion: starting a clockwork engine or summoning an anima for a quick one. When an engine declares a need the rig cannot yet satisfy, the Walker extends the rig — drawing on installed kits to add the engines needed to meet it.
+The apparatus that keeps all active rigs in motion. The Spider moves continuously through every active rig — not bound to any single commission, predating and outlasting them all. When an engine is ready to run, the Spider sets it in motion: starting a clockwork engine or summoning an anima for a quick one. When an engine declares a need the rig cannot yet satisfy, the Spider extends the rig — drawing on installed kits to add the engines needed to meet it.
 
-The rig grows as it runs. The Walker is why.
+The rig grows as it runs. The Spider is why.
 
 ### The Surveyor
 
diff --git a/packages/plugins/animator/src/types.ts b/packages/plugins/animator/src/types.ts
index 032a7e0..2243445 100644
--- a/packages/plugins/animator/src/types.ts
+++ b/packages/plugins/animator/src/types.ts
@@ -92,7 +92,7 @@ export interface SessionResult {
    * The final assistant text from the session.
    * Extracted by the Animator from the provider's transcript.
    * Useful for programmatic consumers that need the session's conclusion
-   * without parsing the full transcript (e.g. the Walker's review collect step).
+   * without parsing the full transcript (e.g. the Spider's review collect step).
    */
   output?: string;
 }
diff --git a/packages/plugins/dashboard/src/dashboard.ts b/packages/plugins/dashboard/src/dashboard.ts
index 04e11f2..24e4b47 100644
--- a/packages/plugins/dashboard/src/dashboard.ts
+++ b/packages/plugins/dashboard/src/dashboard.ts
@@ -15,7 +15,7 @@ import { dashboardStart } from './tool.ts';
 export function createDashboard(): Plugin {
   return {
     apparatus: {
-      recommends: ['clerk', 'stacks', 'animator', 'walker', 'codexes'],
+      recommends: ['clerk', 'stacks', 'animator', 'spider', 'codexes'],
 
       supportKit: {
         tools: [dashboardStart],
diff --git a/packages/plugins/dashboard/src/html.ts b/packages/plugins/dashboard/src/html.ts
index c0b0b01..397c735 100644
--- a/packages/plugins/dashboard/src/html.ts
+++ b/packages/plugins/dashboard/src/html.ts
@@ -179,7 +179,7 @@ tr:hover td{background:rgba(255,255,255,.02)}
 <nav id="tab-nav">
   <div class="tab active" data-tab="overview">Overview</div>
   <div class="tab" data-tab="clerk">Clerk <span class="tab-badge" id="badge-clerk">—</span></div>
-  <div class="tab" data-tab="walker">Walker <span class="tab-badge" id="badge-walker">—</span></div>
+  <div class="tab" data-tab="spider">Spider <span class="tab-badge" id="badge-spider">—</span></div>
   <div class="tab" data-tab="animator">Animator <span class="tab-badge" id="badge-animator">—</span></div>
   <div class="tab" data-tab="codexes">Codexes <span class="tab-badge" id="badge-codexes">—</span></div>
 </nav>
@@ -271,21 +271,21 @@ tr:hover td{background:rgba(255,255,255,.02)}
     </div>
   </div>
 
-  <!-- WALKER -->
-  <div class="tab-panel" id="panel-walker">
+  <!-- SPIDER -->
+  <div class="tab-panel" id="panel-spider">
     <div class="card" style="margin-bottom:0">
       <div class="toolbar">
-        <select id="walker-filter-status" onchange="loadRigs()">
+        <select id="spider-filter-status" onchange="loadRigs()">
           <option value="">All statuses</option>
           <option value="running">Running</option>
           <option value="completed">Completed</option>
           <option value="failed">Failed</option>
         </select>
         <div class="toolbar-right">
-          <span id="walker-count-label" style="color:var(--muted);font-size:12px"></span>
+          <span id="spider-count-label" style="color:var(--muted);font-size:12px"></span>
         </div>
       </div>
-      <div id="walker-loading" class="loading" style="display:none"><div class="spinner"></div>Loading…</div>
+      <div id="spider-loading" class="loading" style="display:none"><div class="spinner"></div>Loading…</div>
       <table>
         <thead>
           <tr>
@@ -296,12 +296,12 @@ tr:hover td{background:rgba(255,255,255,.02)}
             <th>Progress</th>
           </tr>
         </thead>
-        <tbody id="walker-tbody"></tbody>
+        <tbody id="spider-tbody"></tbody>
       </table>
-      <div id="walker-empty" class="empty-state" style="display:none">
+      <div id="spider-empty" class="empty-state" style="display:none">
         <div class="empty-icon">⚙️</div>
         <h3>No rigs found</h3>
-        <p>Rigs are created when the Walker processes writs.</p>
+        <p>Rigs are created when the Spider processes writs.</p>
       </div>
     </div>
   </div>
@@ -478,7 +478,7 @@ function switchTab(id) {
 function loadTab(id) {
   if (id === 'overview') loadOverview();
   else if (id === 'clerk') loadWrits();
-  else if (id === 'walker') loadRigs();
+  else if (id === 'spider') loadRigs();
   else if (id === 'animator') loadSessions();
   else if (id === 'codexes') loadCodexes();
 }
@@ -578,7 +578,7 @@ function renderOverview(data) {
 
   // Update badges
   if (data.counts.writs !== undefined) setBadge('clerk', data.counts.writs);
-  if (data.counts.rigs !== undefined) setBadge('walker', data.counts.rigs);
+  if (data.counts.rigs !== undefined) setBadge('spider', data.counts.rigs);
   if (data.counts.sessions !== undefined) setBadge('animator', data.counts.sessions);
   if (data.counts.codexes !== undefined) setBadge('codexes', data.counts.codexes);
 }
@@ -794,28 +794,28 @@ async function submitTransition() {
   }
 }
 
-// ── WALKER ────────────────────────────────────────────────────────
+// ── SPIDER ────────────────────────────────────────────────────────
 async function loadRigs() {
-  const status = document.getElementById('walker-filter-status').value;
-  document.getElementById('walker-loading').style.display = 'flex';
+  const status = document.getElementById('spider-filter-status').value;
+  document.getElementById('spider-loading').style.display = 'flex';
   try {
     const params = new URLSearchParams();
     if (status) params.set('status', status);
     const data = await api('/rigs?' + params);
     rigs = data.rigs;
     renderRigs();
-    setBadge('walker', rigs.length);
-    document.getElementById('walker-count-label').textContent = rigs.length + ' rig' + (rigs.length!==1?'s':'');
+    setBadge('spider', rigs.length);
+    document.getElementById('spider-count-label').textContent = rigs.length + ' rig' + (rigs.length!==1?'s':'');
   } catch(e) {
-    document.getElementById('walker-loading').innerHTML = '<span style="color:var(--red)">Error: ' + esc(e.message) + '</span>';
+    document.getElementById('spider-loading').innerHTML = '<span style="color:var(--red)">Error: ' + esc(e.message) + '</span>';
     return;
   }
-  document.getElementById('walker-loading').style.display = 'none';
+  document.getElementById('spider-loading').style.display = 'none';
 }
 
 function renderRigs() {
   const rows = stableSort(rigs, rigSort.col, rigSort.dir);
-  const tbody = document.getElementById('walker-tbody');
+  const tbody = document.getElementById('spider-tbody');
   tbody.innerHTML = rows.map(r => {
     const engines = r.engines || [];
     const done = engines.filter(e => e.status==='completed' || e.status==='failed').length;
@@ -836,7 +836,7 @@ function renderRigs() {
       '</td>' +
     '</tr>';
   }).join('');
-  document.getElementById('walker-empty').style.display = rows.length ? 'none' : 'block';
+  document.getElementById('spider-empty').style.display = rows.length ? 'none' : 'block';
 }
 
 function sortRigs(col) {
diff --git a/packages/plugins/dashboard/src/index.ts b/packages/plugins/dashboard/src/index.ts
index 1a90fa3..0b07e9f 100644
--- a/packages/plugins/dashboard/src/index.ts
+++ b/packages/plugins/dashboard/src/index.ts
@@ -3,7 +3,7 @@
  *
  * Web-based guild operations dashboard. Exposes the `dashboard-start` CLI
  * tool which launches a local web server with a live operations UI including
- * tabs for Overview, Clerk, Walker, Animator, and Codexes.
+ * tabs for Overview, Clerk, Spider, Animator, and Codexes.
  *
  * Usage:
  *   nsg dashboard start
diff --git a/packages/plugins/dashboard/src/rig-types.ts b/packages/plugins/dashboard/src/rig-types.ts
index 4392aa3..0eae120 100644
--- a/packages/plugins/dashboard/src/rig-types.ts
+++ b/packages/plugins/dashboard/src/rig-types.ts
@@ -1,5 +1,5 @@
 /**
- * Local type stubs for Walker rig documents read via Stacks readBook().
+ * Local type stubs for Spider rig documents read via Stacks readBook().
  */
 
 export interface EngineInstance {
diff --git a/packages/plugins/dashboard/src/server.ts b/packages/plugins/dashboard/src/server.ts
index c1a2be5..dc2dd59 100644
--- a/packages/plugins/dashboard/src/server.ts
+++ b/packages/plugins/dashboard/src/server.ts
@@ -128,10 +128,10 @@ async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise
         } catch { /* animator not installed */ }
 
         try {
-          const rigs = stacks.readBook<RigDoc>('walker', 'rigs');
+          const rigs = stacks.readBook<RigDoc>('spider', 'rigs');
           counts.rigs        = await rigs.count();
           counts.runningRigs = await rigs.count([['status', '=', 'running']]);
-        } catch { /* walker not installed */ }
+        } catch { /* spider not installed */ }
       }
 
       const scriptorium = tryApparatus<ScriptoriumApi>('codexes');
@@ -238,7 +238,7 @@ async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise
     const stacks = tryApparatus<StacksApi>('stacks');
     if (!stacks) { json(res, { rigs: [] }); return; }
     try {
-      const rigs = stacks.readBook<RigDoc>('walker', 'rigs');
+      const rigs = stacks.readBook<RigDoc>('spider', 'rigs');
       const where: WhereClause | undefined = qs.status
         ? [['status', '=', qs.status]]
         : undefined;
diff --git a/packages/plugins/dispatch/README.md b/packages/plugins/dispatch/README.md
index 624626d..53e5a6e 100644
--- a/packages/plugins/dispatch/README.md
+++ b/packages/plugins/dispatch/README.md
@@ -1,6 +1,6 @@
 # `@shardworks/dispatch-apparatus`
 
-> **⚠️ Temporary rigging.** The Dispatch is a stand-in for the full rigging system (Walker, Fabricator, Executor). When that system exists, this apparatus is retired.
+> **⚠️ Temporary rigging.** The Dispatch is a stand-in for the full rigging system (Spider, Fabricator, Executor). When that system exists, this apparatus is retired.
 
 The Dispatch is the guild's interim work runner. It bridges the gap between the Clerk (which tracks obligations) and the session machinery (which runs animas). It does one thing: find the oldest ready writ and execute it.
 
diff --git a/packages/plugins/dispatch/src/dispatch.ts b/packages/plugins/dispatch/src/dispatch.ts
index 496a65a..d883225 100644
--- a/packages/plugins/dispatch/src/dispatch.ts
+++ b/packages/plugins/dispatch/src/dispatch.ts
@@ -7,7 +7,7 @@
  * the aftermath (seal the draft, transition the writ).
  *
  * This apparatus is temporary rigging — designed to be retired when the
- * full rigging system (Walker, Fabricator, Executor) is implemented.
+ * full rigging system (Spider, Fabricator, Executor) is implemented.
  *
  * See: docs/architecture/apparatus/dispatch.md
  */
diff --git a/packages/plugins/dispatch/src/index.ts b/packages/plugins/dispatch/src/index.ts
index 2be0178..321c70e 100644
--- a/packages/plugins/dispatch/src/index.ts
+++ b/packages/plugins/dispatch/src/index.ts
@@ -5,7 +5,7 @@
  * the guild's session machinery. Opens a draft binding on the target codex,
  * summons an anima via The Animator, and handles the aftermath (seal the
  * draft, transition the writ). Disposable — retired when the full rigging
- * system (Walker, Fabricator, Executor) is implemented.
+ * system (Spider, Fabricator, Executor) is implemented.
  *
  * See: docs/architecture/apparatus/dispatch.md
  */
diff --git a/packages/plugins/fabricator/src/fabricator.ts b/packages/plugins/fabricator/src/fabricator.ts
index 6edde14..bdfb7ed 100644
--- a/packages/plugins/fabricator/src/fabricator.ts
+++ b/packages/plugins/fabricator/src/fabricator.ts
@@ -2,7 +2,7 @@
  * The Fabricator — guild engine design registry apparatus.
  *
  * Scans installed engine designs from kit contributions and apparatus supportKits,
- * and serves them to the Walker on demand.
+ * and serves them to the Spider on demand.
  *
  * The Fabricator does not execute engines. It is a pure query service:
  * designs in, designs out.
@@ -34,7 +34,7 @@ export interface EngineRunContext {
  * The result of an engine run.
  *
  * 'completed' — synchronous work done inline, yields are available immediately.
- * 'launched'  — async work launched in a session; the Walker polls for completion.
+ * 'launched'  — async work launched in a session; the Spider polls for completion.
  */
 export type EngineRunResult =
   | { status: 'completed'; yields: unknown }
@@ -42,7 +42,7 @@ export type EngineRunResult =
 
 /**
  * An engine design — the unit of work the Fabricator catalogues and the
- * Walker executes. Kit authors import this type from @shardworks/fabricator-apparatus.
+ * Spider executes. Kit authors import this type from @shardworks/fabricator-apparatus.
  */
 export interface EngineDesign {
   /** Unique identifier for this engine design (e.g. 'draft', 'implement', 'review'). */
@@ -51,7 +51,7 @@ export interface EngineDesign {
   /**
    * Execute this engine.
    *
-   * @param givens   — the engine's declared inputs, assembled by the Walker.
+   * @param givens   — the engine's declared inputs, assembled by the Spider.
    * @param context  — minimal execution context: engine id and upstream yields.
    */
   run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;
diff --git a/packages/plugins/walker/package.json b/packages/plugins/spider/package.json
similarity index 87%
rename from packages/plugins/walker/package.json
rename to packages/plugins/spider/package.json
index 9524b64..32fefca 100644
--- a/packages/plugins/walker/package.json
+++ b/packages/plugins/spider/package.json
@@ -1,13 +1,13 @@
 {
-  "name": "@shardworks/walker-apparatus",
+  "name": "@shardworks/spider-apparatus",
   "version": "0.0.0",
   "license": "ISC",
   "repository": {
     "type": "git",
     "url": "https://github.com/shardworks/nexus",
-    "directory": "packages/plugins/walker"
+    "directory": "packages/plugins/spider"
   },
-  "description": "The Walker — rig execution engine apparatus",
+  "description": "The Spider — rig execution engine apparatus",
   "type": "module",
   "exports": {
     ".": "./src/index.ts"
diff --git a/packages/plugins/walker/src/engines/draft.ts b/packages/plugins/spider/src/engines/draft.ts
similarity index 100%
rename from packages/plugins/walker/src/engines/draft.ts
rename to packages/plugins/spider/src/engines/draft.ts
diff --git a/packages/plugins/walker/src/engines/implement.ts b/packages/plugins/spider/src/engines/implement.ts
similarity index 95%
rename from packages/plugins/walker/src/engines/implement.ts
rename to packages/plugins/spider/src/engines/implement.ts
index f6f74b6..2c5527b 100644
--- a/packages/plugins/walker/src/engines/implement.ts
+++ b/packages/plugins/spider/src/engines/implement.ts
@@ -4,7 +4,7 @@
  * Summons an anima to do the commissioned work. Wraps the writ body with
  * a commit instruction, then calls animator.summon() with the draft
  * worktree as the working directory. Returns `{ status: 'launched', sessionId }`
- * so the Walker's collect step can poll for completion on subsequent walks.
+ * so the Spider's collect step can poll for completion on subsequent walks.
  */
 
 import { guild } from '@shardworks/nexus-core';
diff --git a/packages/plugins/walker/src/engines/index.ts b/packages/plugins/spider/src/engines/index.ts
similarity index 100%
rename from packages/plugins/walker/src/engines/index.ts
rename to packages/plugins/spider/src/engines/index.ts
diff --git a/packages/plugins/walker/src/engines/review.ts b/packages/plugins/spider/src/engines/review.ts
similarity index 98%
rename from packages/plugins/walker/src/engines/review.ts
rename to packages/plugins/spider/src/engines/review.ts
index 05f91a1..9f54813 100644
--- a/packages/plugins/walker/src/engines/review.ts
+++ b/packages/plugins/spider/src/engines/review.ts
@@ -3,10 +3,10 @@
  *
  * Runs mechanical checks (build/test) synchronously in the draft worktree,
  * then summons a reviewer anima to assess the implementation against the spec.
- * Returns `{ status: 'launched', sessionId }` so the Walker's collect step
+ * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
  * can parse the reviewer's findings from session.output on subsequent walks.
  *
- * Collect step (Walker):
+ * Collect step (Spider):
  *   - Reads session.output as the reviewer's structured markdown findings
  *   - Parses `passed` from /^###\s*Overall:\s*PASS/mi
  *   - Retrieves mechanicalChecks from session.metadata
diff --git a/packages/plugins/walker/src/engines/revise.ts b/packages/plugins/spider/src/engines/revise.ts
similarity index 97%
rename from packages/plugins/walker/src/engines/revise.ts
rename to packages/plugins/spider/src/engines/revise.ts
index d759e5a..ac4cbf7 100644
--- a/packages/plugins/walker/src/engines/revise.ts
+++ b/packages/plugins/spider/src/engines/revise.ts
@@ -6,7 +6,7 @@
  * If the review failed, the prompt directs the anima to address each item
  * in the findings and commit the result.
  *
- * Returns `{ status: 'launched', sessionId }` so the Walker's collect step
+ * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
  * can store ReviseYields on completion.
  */
 
diff --git a/packages/plugins/walker/src/engines/seal.ts b/packages/plugins/spider/src/engines/seal.ts
similarity index 100%
rename from packages/plugins/walker/src/engines/seal.ts
rename to packages/plugins/spider/src/engines/seal.ts
diff --git a/packages/plugins/walker/src/index.ts b/packages/plugins/spider/src/index.ts
similarity index 74%
rename from packages/plugins/walker/src/index.ts
rename to packages/plugins/spider/src/index.ts
index 02b3407..d7ae4d5 100644
--- a/packages/plugins/walker/src/index.ts
+++ b/packages/plugins/spider/src/index.ts
@@ -1,14 +1,14 @@
 /**
- * @shardworks/walker-apparatus — The Walker.
+ * @shardworks/spider-apparatus — The Spider.
  *
  * Rig execution engine: spawns rigs for ready writs, drives engine pipelines
  * to completion, and transitions writs via the Clerk on rig completion/failure.
  *
- * Public types (RigDoc, EngineInstance, WalkResult, WalkerApi, etc.) are
+ * Public types (RigDoc, EngineInstance, CrawlResult, SpiderApi, etc.) are
  * re-exported for consumers that inspect walk results or rig state.
  */
 
-import { createWalker } from './walker.ts';
+import { createSpider } from './spider.ts';
 
 // ── Public types ──────────────────────────────────────────────────────
 
@@ -17,13 +17,13 @@ export type {
   EngineInstance,
   RigStatus,
   RigDoc,
-  WalkResult,
-  WalkerApi,
-  WalkerConfig,
+  CrawlResult,
+  SpiderApi,
+  SpiderConfig,
   DraftYields,
   SealYields,
 } from './types.ts';
 
 // ── Default export: the apparatus plugin ──────────────────────────────
 
-export default createWalker();
+export default createSpider();
diff --git a/packages/plugins/walker/src/walker.test.ts b/packages/plugins/spider/src/spider.test.ts
similarity index 89%
rename from packages/plugins/walker/src/walker.test.ts
rename to packages/plugins/spider/src/spider.test.ts
index bbf58a4..9c1b5a3 100644
--- a/packages/plugins/walker/src/walker.test.ts
+++ b/packages/plugins/spider/src/spider.test.ts
@@ -1,5 +1,5 @@
 /**
- * Walker — unit tests.
+ * Spider — unit tests.
  *
  * Tests rig lifecycle, walk priority ordering, engine execution (clockwork
  * and quick), failure propagation, and CDC-driven writ transitions.
@@ -25,8 +25,8 @@ import type { FabricatorApi, EngineDesign } from '@shardworks/fabricator-apparat
 
 import type { AnimatorApi, SummonRequest, AnimateHandle, SessionChunk, SessionResult, SessionDoc } from '@shardworks/animator-apparatus';
 
-import { createWalker } from './walker.ts';
-import type { WalkerApi, RigDoc, EngineInstance, ReviewYields, MechanicalCheck } from './types.ts';
+import { createSpider } from './spider.ts';
+import type { SpiderApi, RigDoc, EngineInstance, ReviewYields, MechanicalCheck } from './types.ts';
 
 // ── Test bootstrap ────────────────────────────────────────────────────
 
@@ -55,7 +55,7 @@ function buildCtx(): {
 
 /**
  * Full integration fixture: starts Stacks (memory), Clerk, Fabricator,
- * and Walker. Returns handles to each API plus mock animator controls.
+ * and Spider. Returns handles to each API plus mock animator controls.
  */
 function buildFixture(
   guildConfig: Partial<GuildConfig> = {},
@@ -64,7 +64,7 @@ function buildFixture(
   stacks: StacksApi;
   clerk: ClerkApi;
   fabricator: FabricatorApi;
-  walker: WalkerApi;
+  spider: SpiderApi;
   memBackend: InstanceType<typeof MemoryBackend>;
   fire: (event: string, ...args: unknown[]) => Promise<void>;
   summonCalls: SummonRequest[];
@@ -74,17 +74,17 @@ function buildFixture(
   const stacksPlugin = createStacksApparatus(memBackend);
   const clerkPlugin = createClerk();
   const fabricatorPlugin = createFabricator();
-  const walkerPlugin = createWalker();
+  const spiderPlugin = createSpider();
 
   if (!('apparatus' in stacksPlugin)) throw new Error('stacks must be apparatus');
   if (!('apparatus' in clerkPlugin)) throw new Error('clerk must be apparatus');
   if (!('apparatus' in fabricatorPlugin)) throw new Error('fabricator must be apparatus');
-  if (!('apparatus' in walkerPlugin)) throw new Error('walker must be apparatus');
+  if (!('apparatus' in spiderPlugin)) throw new Error('spider must be apparatus');
 
   const stacksApparatus = stacksPlugin.apparatus;
   const clerkApparatus = clerkPlugin.apparatus;
   const fabricatorApparatus = fabricatorPlugin.apparatus;
-  const walkerApparatus = walkerPlugin.apparatus;
+  const spiderApparatus = spiderPlugin.apparatus;
 
   const apparatusMap = new Map<string, unknown>();
 
@@ -117,11 +117,11 @@ function buildFixture(
   const stacks = stacksApparatus.provides as StacksApi;
   apparatusMap.set('stacks', stacks);
 
-  // Manually ensure all books the Walker and Clerk need
+  // Manually ensure all books the Spider and Clerk need
   memBackend.ensureBook({ ownerId: 'clerk', book: 'writs' }, {
     indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
   });
-  memBackend.ensureBook({ ownerId: 'walker', book: 'rigs' }, {
+  memBackend.ensureBook({ ownerId: 'spider', book: 'rigs' }, {
     indexes: ['status', 'writId', ['status', 'writId']],
   });
   memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
@@ -130,7 +130,7 @@ function buildFixture(
 
   // Mock animator — captures summon() calls and writes session docs to Stacks.
   // The implement engine awaits handle.result to get the session id; the mock
-  // writes a terminal session record before resolving so the Walker's collect
+  // writes a terminal session record before resolving so the Spider's collect
   // step finds it on the next walk() call.
   let currentSessionOutcome = initialSessionOutcome;
   const summonCalls: SummonRequest[] = [];
@@ -175,7 +175,7 @@ function buildFixture(
       return { chunks: emptyChunks(), result };
     },
     animate(): AnimateHandle {
-      throw new Error('animate() not used in Walker tests');
+      throw new Error('animate() not used in Spider tests');
     },
   };
   apparatusMap.set('animator', mockAnimatorApi);
@@ -191,24 +191,24 @@ function buildFixture(
   const fabricator = fabricatorApparatus.provides as FabricatorApi;
   apparatusMap.set('fabricator', fabricator);
 
-  // Start walker
-  walkerApparatus.start(noopCtx);
-  const walker = walkerApparatus.provides as WalkerApi;
-  apparatusMap.set('walker', walker);
+  // Start spider
+  spiderApparatus.start(noopCtx);
+  const spider = spiderApparatus.provides as SpiderApi;
+  apparatusMap.set('spider', spider);
 
-  // Simulate plugin:initialized for the Walker so the Fabricator scans
+  // Simulate plugin:initialized for the Spider so the Fabricator scans
   // its supportKit and picks up the five engine designs.
-  const walkerLoaded: LoadedApparatus = {
-    packageName: '@shardworks/walker-apparatus',
-    id: 'walker',
+  const spiderLoaded: LoadedApparatus = {
+    packageName: '@shardworks/spider-apparatus',
+    id: 'spider',
     version: '0.0.0',
-    apparatus: walkerApparatus,
+    apparatus: spiderApparatus,
   };
   // Fire synchronously — fabricator's handler is sync
-  void fire('plugin:initialized', walkerLoaded);
+  void fire('plugin:initialized', spiderLoaded);
 
   return {
-    stacks, clerk, fabricator, walker, memBackend, fire,
+    stacks, clerk, fabricator, spider, memBackend, fire,
     summonCalls,
     setSessionOutcome(outcome: { status: 'completed' | 'failed'; error?: string; output?: string }) {
       currentSessionOutcome = outcome;
@@ -218,7 +218,7 @@ function buildFixture(
 
 /** Get the rigs book. */
 function rigsBook(stacks: StacksApi) {
-  return stacks.book<RigDoc>('walker', 'rigs');
+  return stacks.book<RigDoc>('spider', 'rigs');
 }
 
 /** Post a writ. */
@@ -228,7 +228,7 @@ async function postWrit(clerk: ClerkApi, title = 'Test writ', codex?: string): P
 
 // ── Tests ─────────────────────────────────────────────────────────────
 
-describe('Walker', () => {
+describe('Spider', () => {
   let fix: ReturnType<typeof buildFixture>;
 
   beforeEach(() => {
@@ -241,7 +241,7 @@ describe('Walker', () => {
 
   // ── Fabricator integration ─────────────────────────────────────────
 
-  describe('Fabricator — Walker engine registration', () => {
+  describe('Fabricator — Spider engine registration', () => {
     it('registers all five engine designs in the Fabricator', () => {
       const { fabricator } = fix;
       assert.ok(fabricator.getEngineDesign('draft'), 'draft engine registered');
@@ -260,7 +260,7 @@ describe('Walker', () => {
 
   describe('walk() — idle', () => {
     it('returns null when there is no work', async () => {
-      const result = await fix.walker.walk();
+      const result = await fix.spider.crawl();
       assert.equal(result, null);
     });
   });
@@ -269,11 +269,11 @@ describe('Walker', () => {
 
   describe('walk() — spawn', () => {
     it('spawns a rig for a ready writ and transitions writ to active', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       const writ = await postWrit(clerk);
       assert.equal(writ.status, 'ready');
 
-      const result = await walker.walk();
+      const result = await spider.crawl();
       assert.ok(result !== null, 'expected a walk result');
       assert.equal(result.action, 'rig-spawned');
       assert.equal((result as { writId: string }).writId, writ.id);
@@ -290,24 +290,24 @@ describe('Walker', () => {
     });
 
     it('does not spawn a second rig for a writ that already has one', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
 
-      await walker.walk(); // spawns rig
+      await spider.crawl(); // spawns rig
 
       const rigs = await rigsBook(stacks).list();
       assert.equal(rigs.length, 1, 'only one rig should exist');
     });
 
     it('spawns rigs for the oldest ready writ first (FIFO)', async () => {
-      const { clerk, walker } = fix;
+      const { clerk, spider } = fix;
 
       // Small delay to ensure different createdAt timestamps
       const w1 = await postWrit(clerk, 'First writ');
       await new Promise((r) => setTimeout(r, 2));
       const w2 = await postWrit(clerk, 'Second writ');
 
-      const r1 = await walker.walk();
+      const r1 = await spider.crawl();
       assert.equal(r1?.action, 'rig-spawned');
       assert.equal((r1 as { writId: string }).writId, w1.id);
 
@@ -315,7 +315,7 @@ describe('Walker', () => {
       const rigs = await rigsBook(fix.stacks).list();
       await rigsBook(fix.stacks).patch(rigs[0].id, { status: 'failed' });
 
-      const r2 = await walker.walk();
+      const r2 = await spider.crawl();
       assert.equal(r2?.action, 'rig-spawned');
       assert.equal((r2 as { writId: string }).writId, w2.id);
     });
@@ -325,16 +325,16 @@ describe('Walker', () => {
 
   describe('walk() — priority ordering: collect > run > spawn', () => {
     it('runs before spawning when a rig already exists', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
 
       // Spawn the rig
-      const r1 = await walker.walk();
+      const r1 = await spider.crawl();
       assert.equal(r1?.action, 'rig-spawned');
 
       // Second walk should run (not spawn another rig)
       // The draft engine will fail (no codexes), resulting in 'rig-completed'
-      const r2 = await walker.walk();
+      const r2 = await spider.crawl();
       assert.notEqual(r2?.action, 'rig-spawned');
       // Only one rig created
       const rigs = await rigsBook(stacks).list();
@@ -342,9 +342,9 @@ describe('Walker', () => {
     });
 
     it('collects before running when a running engine has a terminal session', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -363,7 +363,7 @@ describe('Walker', () => {
       await sessBook.put({ id: fakeSessionId, status: 'completed', startedAt: new Date().toISOString(), provider: 'test' });
 
       // Walk should collect (not run implement which has no completed upstream)
-      const r = await walker.walk();
+      const r = await spider.crawl();
       assert.equal(r?.action, 'engine-completed');
       assert.equal((r as { engineId: string }).engineId, 'draft');
     });
@@ -373,9 +373,9 @@ describe('Walker', () => {
 
   describe('engine readiness — upstream must complete first', () => {
     it('only the first engine (no upstream) is runnable initially', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const [rig] = await rigsBook(stacks).list();
 
@@ -387,9 +387,9 @@ describe('Walker', () => {
     });
 
     it('implement only launches after draft is completed', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -403,7 +403,7 @@ describe('Walker', () => {
       await book.patch(rig.id, { engines: updatedEngines });
 
       // Now walk should launch implement (quick engine → 'engine-started', not 'engine-completed')
-      const result = await walker.walk();
+      const result = await spider.crawl();
       assert.equal(result?.action, 'engine-started');
       assert.equal((result as { engineId: string }).engineId, 'implement');
     });
@@ -413,9 +413,9 @@ describe('Walker', () => {
 
   describe('implement engine execution', () => {
     it('launches session on first walk, then collects yields on second walk', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig0] = await book.list();
@@ -429,7 +429,7 @@ describe('Walker', () => {
       await book.patch(rig0.id, { engines: updatedEngines });
 
       // Walk: implement launches an Animator session (quick engine → 'engine-started')
-      const result = await walker.walk();
+      const result = await spider.crawl();
       assert.equal(result?.action, 'engine-started');
       assert.equal((result as { engineId: string }).engineId, 'implement');
 
@@ -439,7 +439,7 @@ describe('Walker', () => {
       assert.ok(impl1?.sessionId !== undefined, 'sessionId should be stored');
 
       // Walk: collect step finds the terminal session and stores yields
-      const result2 = await walker.walk();
+      const result2 = await spider.crawl();
       assert.equal(result2?.action, 'engine-completed');
       assert.equal((result2 as { engineId: string }).engineId, 'implement');
 
@@ -451,9 +451,9 @@ describe('Walker', () => {
     });
 
     it('marks engine and rig failed when engine design is not found', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -464,7 +464,7 @@ describe('Walker', () => {
       );
       await book.patch(rig.id, { engines: brokenEngines });
 
-      const result = await walker.walk();
+      const result = await spider.crawl();
       assert.equal(result?.action, 'rig-completed');
       assert.equal((result as { outcome: string }).outcome, 'failed');
 
@@ -480,7 +480,7 @@ describe('Walker', () => {
 
   describe('yield serialization failure', () => {
     it('non-serializable engine yields cause engine and rig failure', async () => {
-      const { clerk, walker, stacks, fire } = fix;
+      const { clerk, spider, stacks, fire } = fix;
 
       // Register an engine design that returns non-JSON-serializable yields
       const badEngine: EngineDesign = {
@@ -504,7 +504,7 @@ describe('Walker', () => {
       void fire('plugin:initialized', fakePlugin);
 
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -516,7 +516,7 @@ describe('Walker', () => {
         ),
       });
 
-      const result = await walker.walk();
+      const result = await spider.crawl();
       assert.ok(result !== null);
       assert.equal(result.action, 'rig-completed');
       assert.equal((result as { outcome: string }).outcome, 'failed');
@@ -533,9 +533,9 @@ describe('Walker', () => {
 
   describe('implement engine — Animator integration', () => {
     it('calls animator.summon() with role, prompt, cwd, environment, and metadata', async () => {
-      const { clerk, walker, stacks, summonCalls } = fix;
+      const { clerk, spider, stacks, summonCalls } = fix;
       const writ = await postWrit(clerk, 'My commission', 'my-codex');
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -547,7 +547,7 @@ describe('Walker', () => {
         ),
       });
 
-      const launchResult = await walker.walk(); // launch implement
+      const launchResult = await spider.crawl(); // launch implement
       assert.equal(launchResult?.action, 'engine-started');
 
       assert.equal(summonCalls.length, 1, 'summon should be called once');
@@ -559,9 +559,9 @@ describe('Walker', () => {
     });
 
     it('wraps the writ body with a commit instruction', async () => {
-      const { clerk, walker, stacks, summonCalls } = fix;
+      const { clerk, spider, stacks, summonCalls } = fix;
       await clerk.post({ title: 'My writ', body: 'Build the feature.' });
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -573,7 +573,7 @@ describe('Walker', () => {
         ),
       });
 
-      const launchResult2 = await walker.walk(); // launch implement
+      const launchResult2 = await spider.crawl(); // launch implement
       assert.equal(launchResult2?.action, 'engine-started');
 
       assert.equal(summonCalls.length, 1);
@@ -582,11 +582,11 @@ describe('Walker', () => {
     });
 
     it('session failure propagates: engine fails → rig fails → writ transitions to failed', async () => {
-      const { clerk, walker, stacks, setSessionOutcome } = fix;
+      const { clerk, spider, stacks, setSessionOutcome } = fix;
       setSessionOutcome({ status: 'failed', error: 'Process exited with code 1' });
 
       const writ = await postWrit(clerk, 'Failing writ');
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -598,8 +598,8 @@ describe('Walker', () => {
         ),
       });
 
-      await walker.walk(); // launch implement (session already terminal in Stacks)
-      await walker.walk(); // collect: session failed → engine fails → rig fails
+      await spider.crawl(); // launch implement (session already terminal in Stacks)
+      await spider.crawl(); // collect: session failed → engine fails → rig fails
 
       const [updatedRig] = await book.list();
       assert.equal(updatedRig.status, 'failed', 'rig should be failed');
@@ -611,9 +611,9 @@ describe('Walker', () => {
     });
 
     it('ImplementYields contain sessionId and sessionStatus from the session record', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk, 'Yields test');
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -625,8 +625,8 @@ describe('Walker', () => {
         ),
       });
 
-      await walker.walk(); // launch
-      await walker.walk(); // collect
+      await spider.crawl(); // launch
+      await spider.crawl(); // collect
 
       const [updated] = await book.list();
       const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
@@ -641,9 +641,9 @@ describe('Walker', () => {
 
   describe('quick engine — collect', () => {
     it('collects yields from a terminal session in the sessions book', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -675,7 +675,7 @@ describe('Walker', () => {
       });
 
       // Walk: collect step should find the terminal session
-      const result = await walker.walk();
+      const result = await spider.crawl();
       assert.equal(result?.action, 'engine-completed');
       assert.equal((result as { engineId: string }).engineId, 'implement');
 
@@ -689,9 +689,9 @@ describe('Walker', () => {
     });
 
     it('marks engine and rig failed when session failed', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -720,7 +720,7 @@ describe('Walker', () => {
         error: 'Process exited with code 1',
       });
 
-      const result = await walker.walk();
+      const result = await spider.crawl();
       assert.equal(result?.action, 'rig-completed');
       assert.equal((result as { outcome: string }).outcome, 'failed');
 
@@ -731,9 +731,9 @@ describe('Walker', () => {
     });
 
     it('does not collect a still-running session', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -763,7 +763,7 @@ describe('Walker', () => {
 
       // Nothing to collect, implement is running (no pending with completed upstream),
       // spawn skips (rig exists) → null
-      const result = await walker.walk();
+      const result = await spider.crawl();
       assert.equal(result, null);
     });
   });
@@ -772,10 +772,10 @@ describe('Walker', () => {
 
   describe('failure propagation', () => {
     it('engine failure → rig failed → writ transitions to failed via CDC', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       const writ = await postWrit(clerk);
 
-      await walker.walk(); // spawn (writ → active)
+      await spider.crawl(); // spawn (writ → active)
       const activeWrit = await clerk.show(writ.id);
       assert.equal(activeWrit.status, 'active');
 
@@ -788,7 +788,7 @@ describe('Walker', () => {
       await book.patch(rig.id, { engines: brokenEngines });
 
       // Walk: engine fails → rig fails → CDC → writ fails
-      await walker.walk();
+      await spider.crawl();
 
       const [updatedRig] = await book.list();
       assert.equal(updatedRig.status, 'failed');
@@ -802,9 +802,9 @@ describe('Walker', () => {
 
   describe('givens and context assembly', () => {
     it('each engine receives only the givens it needs', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       const writ = await postWrit(clerk, 'My writ');
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const [rig] = await rigsBook(stacks).list();
       const eng = (id: string) => rig.engines.find((e: EngineInstance) => e.id === id)!;
@@ -832,9 +832,9 @@ describe('Walker', () => {
     });
 
     it('role defaults to "artificer" when not configured', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const [rig] = await rigsBook(stacks).list();
       const implementEngine = rig.engines.find((e: EngineInstance) => e.id === 'implement');
@@ -842,9 +842,9 @@ describe('Walker', () => {
     });
 
     it('upstream map is built from completed engine yields', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -860,12 +860,12 @@ describe('Walker', () => {
       await book.patch(rig.id, { engines: updatedEngines });
 
       // Walk: review launches a session (quick engine → 'engine-started')
-      const result = await walker.walk();
+      const result = await spider.crawl();
       assert.equal(result?.action, 'engine-started');
       assert.equal((result as { engineId: string }).engineId, 'review');
 
       // Walk: collect step picks up the completed review session
-      const result2 = await walker.walk();
+      const result2 = await spider.crawl();
       assert.equal(result2?.action, 'engine-completed');
       assert.equal((result2 as { engineId: string }).engineId, 'review');
     });
@@ -875,10 +875,10 @@ describe('Walker', () => {
 
   describe('full pipeline', () => {
     it('walks through implement → review → revise → rig completion → writ completed', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       const writ = await postWrit(clerk, 'Full pipeline test');
 
-      await walker.walk(); // spawn (writ → active)
+      await spider.crawl(); // spawn (writ → active)
 
       const book = rigsBook(stacks);
       const [rig0] = await book.list();
@@ -892,32 +892,32 @@ describe('Walker', () => {
       });
 
       // Walk: implement launches an Animator session (quick engine)
-      const r1 = await walker.walk();
+      const r1 = await spider.crawl();
       assert.equal(r1?.action, 'engine-started');
       assert.equal((r1 as { engineId: string }).engineId, 'implement');
 
       // Walk: collect step picks up the completed implement session
-      const r1c = await walker.walk();
+      const r1c = await spider.crawl();
       assert.equal(r1c?.action, 'engine-completed');
       assert.equal((r1c as { engineId: string }).engineId, 'implement');
 
       // Walk: review launches a session (quick engine)
-      const r2 = await walker.walk();
+      const r2 = await spider.crawl();
       assert.equal(r2?.action, 'engine-started');
       assert.equal((r2 as { engineId: string }).engineId, 'review');
 
       // Walk: collect review session
-      const r2c = await walker.walk();
+      const r2c = await spider.crawl();
       assert.equal(r2c?.action, 'engine-completed');
       assert.equal((r2c as { engineId: string }).engineId, 'review');
 
       // Walk: revise launches a session (quick engine)
-      const r3 = await walker.walk();
+      const r3 = await spider.crawl();
       assert.equal(r3?.action, 'engine-started');
       assert.equal((r3 as { engineId: string }).engineId, 'revise');
 
       // Walk: collect revise session
-      const r3c = await walker.walk();
+      const r3c = await spider.crawl();
       assert.equal(r3c?.action, 'engine-completed');
       assert.equal((r3c as { engineId: string }).engineId, 'revise');
 
@@ -940,7 +940,7 @@ describe('Walker', () => {
     });
 
     it('walks all 5 engines to rig completion without manual seal patching', async () => {
-      const { clerk, walker, stacks, fire } = fix;
+      const { clerk, spider, stacks, fire } = fix;
 
       // Register a stub seal engine that doesn't require Scriptorium
       const stubSealEngine: EngineDesign = {
@@ -966,7 +966,7 @@ describe('Walker', () => {
       void fire('plugin:initialized', fakePlugin);
 
       const writ = await postWrit(clerk, 'Full pipeline stub seal');
-      await walker.walk(); // spawn (writ → active)
+      await spider.crawl(); // spawn (writ → active)
 
       const book = rigsBook(stacks);
       const [rig0] = await book.list();
@@ -980,37 +980,37 @@ describe('Walker', () => {
       });
 
       // implement launches
-      const r1 = await walker.walk();
+      const r1 = await spider.crawl();
       assert.equal(r1?.action, 'engine-started');
       assert.equal((r1 as { engineId: string }).engineId, 'implement');
 
       // collect implement
-      const r1c = await walker.walk();
+      const r1c = await spider.crawl();
       assert.equal(r1c?.action, 'engine-completed');
       assert.equal((r1c as { engineId: string }).engineId, 'implement');
 
       // review launches (quick engine)
-      const r2 = await walker.walk();
+      const r2 = await spider.crawl();
       assert.equal(r2?.action, 'engine-started');
       assert.equal((r2 as { engineId: string }).engineId, 'review');
 
       // collect review
-      const r2c = await walker.walk();
+      const r2c = await spider.crawl();
       assert.equal(r2c?.action, 'engine-completed');
       assert.equal((r2c as { engineId: string }).engineId, 'review');
 
       // revise launches (quick engine)
-      const r3 = await walker.walk();
+      const r3 = await spider.crawl();
       assert.equal(r3?.action, 'engine-started');
       assert.equal((r3 as { engineId: string }).engineId, 'revise');
 
       // collect revise
-      const r3c = await walker.walk();
+      const r3c = await spider.crawl();
       assert.equal(r3c?.action, 'engine-completed');
       assert.equal((r3c as { engineId: string }).engineId, 'revise');
 
       // seal runs (stub) — last engine → rig completes
-      const r4 = await walker.walk();
+      const r4 = await spider.crawl();
       assert.equal(r4?.action, 'rig-completed');
       assert.equal((r4 as { outcome: string }).outcome, 'completed');
 
@@ -1027,9 +1027,9 @@ describe('Walker', () => {
 
   describe('review engine — Animator integration', () => {
     it('calls animator.summon() with reviewer role, draft cwd, and prompt containing spec', async () => {
-      const { clerk, walker, stacks, summonCalls } = fix;
+      const { clerk, spider, stacks, summonCalls } = fix;
       const writ = await postWrit(clerk, 'Review integration test');
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -1042,7 +1042,7 @@ describe('Walker', () => {
         }),
       });
 
-      const result = await walker.walk(); // launch review
+      const result = await spider.crawl(); // launch review
       assert.equal(result?.action, 'engine-started');
       assert.equal((result as { engineId: string }).engineId, 'review');
 
@@ -1058,9 +1058,9 @@ describe('Walker', () => {
     });
 
     it('collects ReviewYields: parses PASS from session.output', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -1085,7 +1085,7 @@ describe('Walker', () => {
         metadata: { mechanicalChecks: [] },
       });
 
-      const result = await walker.walk(); // collect review
+      const result = await spider.crawl(); // collect review
       assert.equal(result?.action, 'engine-completed');
       assert.equal((result as { engineId: string }).engineId, 'review');
 
@@ -1099,9 +1099,9 @@ describe('Walker', () => {
     });
 
     it('collects ReviewYields: passed is false when output contains FAIL', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -1125,7 +1125,7 @@ describe('Walker', () => {
         metadata: { mechanicalChecks: [] },
       });
 
-      await walker.walk(); // collect review
+      await spider.crawl(); // collect review
       const [updated] = await book.list();
       const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
       const yields = reviewEngine?.yields as ReviewYields;
@@ -1133,9 +1133,9 @@ describe('Walker', () => {
     });
 
     it('collects ReviewYields: mechanicalChecks retrieved from session.metadata', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -1163,7 +1163,7 @@ describe('Walker', () => {
         metadata: { mechanicalChecks: checks },
       });
 
-      await walker.walk(); // collect review
+      await spider.crawl(); // collect review
       const [updated] = await book.list();
       const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
       const yields = reviewEngine?.yields as ReviewYields;
@@ -1182,7 +1182,7 @@ describe('Walker', () => {
 
     beforeEach(() => {
       mechFix = buildFixture({
-        walker: {
+        spider: {
           buildCommand: 'echo "build output"',
           testCommand: 'exit 1',
         },
@@ -1194,9 +1194,9 @@ describe('Walker', () => {
     });
 
     it('executes build and test commands; captures pass/fail from exit code', async () => {
-      const { clerk, walker, stacks, summonCalls } = mechFix;
+      const { clerk, spider, stacks, summonCalls } = mechFix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -1208,7 +1208,7 @@ describe('Walker', () => {
         }),
       });
 
-      const result = await walker.walk(); // launch review (runs checks first)
+      const result = await spider.crawl(); // launch review (runs checks first)
       assert.equal(result?.action, 'engine-started');
 
       assert.equal(summonCalls.length, 1);
@@ -1227,10 +1227,10 @@ describe('Walker', () => {
     });
 
     it('skips checks gracefully when no buildCommand or testCommand configured', async () => {
-      const noCmdFix = buildFixture({ walker: {} }); // no buildCommand/testCommand
-      const { clerk, walker: w, stacks: s, summonCalls: sc } = noCmdFix;
+      const noCmdFix = buildFixture({ spider: {} }); // no buildCommand/testCommand
+      const { clerk, spider: w, stacks: s, summonCalls: sc } = noCmdFix;
       await postWrit(clerk);
-      await w.walk(); // spawn
+      await w.crawl(); // spawn
 
       const book = rigsBook(s);
       const [rig] = await book.list();
@@ -1242,18 +1242,18 @@ describe('Walker', () => {
         }),
       });
 
-      await w.walk(); // launch review
+      await w.crawl(); // launch review
       assert.deepEqual(sc[0].metadata?.mechanicalChecks, [], 'no checks when commands not configured');
       clearGuild();
     });
 
     it('truncates check output to 4KB', async () => {
       const bigFix = buildFixture({
-        walker: { buildCommand: 'python3 -c "print(\'x\' * 8192)"' },
+        spider: { buildCommand: 'python3 -c "print(\'x\' * 8192)"' },
       });
-      const { clerk, walker: w, stacks: s, summonCalls: sc } = bigFix;
+      const { clerk, spider: w, stacks: s, summonCalls: sc } = bigFix;
       await postWrit(clerk);
-      await w.walk(); // spawn
+      await w.crawl(); // spawn
 
       const book = rigsBook(s);
       const [rig] = await book.list();
@@ -1265,7 +1265,7 @@ describe('Walker', () => {
         }),
       });
 
-      await w.walk(); // launch review (runs check with big output)
+      await w.crawl(); // launch review (runs check with big output)
       const checks = sc[0].metadata?.mechanicalChecks as MechanicalCheck[];
       assert.ok(checks[0].output.length <= 4096, `output should be truncated to 4KB, got ${checks[0].output.length} chars`);
       clearGuild();
@@ -1276,9 +1276,9 @@ describe('Walker', () => {
 
   describe('revise engine — Animator integration', () => {
     it('calls animator.summon() with role from givens, draft cwd, and writ env', async () => {
-      const { clerk, walker, stacks, summonCalls } = fix;
+      const { clerk, spider, stacks, summonCalls } = fix;
       const writ = await postWrit(clerk, 'Revise integration test');
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -1292,7 +1292,7 @@ describe('Walker', () => {
         }),
       });
 
-      const result = await walker.walk(); // launch revise
+      const result = await spider.crawl(); // launch revise
       assert.equal(result?.action, 'engine-started');
       assert.equal((result as { engineId: string }).engineId, 'revise');
 
@@ -1304,9 +1304,9 @@ describe('Walker', () => {
     });
 
     it('revision prompt includes pass branch when review passed', async () => {
-      const { clerk, walker, stacks, summonCalls } = fix;
+      const { clerk, spider, stacks, summonCalls } = fix;
       await postWrit(clerk, 'Pass branch test');
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -1325,7 +1325,7 @@ describe('Walker', () => {
         }),
       });
 
-      await walker.walk(); // launch revise
+      await spider.crawl(); // launch revise
       const prompt = summonCalls[0].prompt;
       assert.ok(prompt.includes('## Review Result: PASS'), 'prompt includes PASS result');
       assert.ok(prompt.includes('The review passed'), 'prompt includes pass branch instruction');
@@ -1333,9 +1333,9 @@ describe('Walker', () => {
     });
 
     it('revision prompt includes fail branch when review failed', async () => {
-      const { clerk, walker, stacks, summonCalls } = fix;
+      const { clerk, spider, stacks, summonCalls } = fix;
       await postWrit(clerk, 'Fail branch test');
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -1354,7 +1354,7 @@ describe('Walker', () => {
         }),
       });
 
-      await walker.walk(); // launch revise
+      await spider.crawl(); // launch revise
       const prompt = summonCalls[0].prompt;
       assert.ok(prompt.includes('## Review Result: FAIL'), 'prompt includes FAIL result');
       assert.ok(
@@ -1365,9 +1365,9 @@ describe('Walker', () => {
     });
 
     it('ReviseYields: sessionId and sessionStatus collected from session record', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -1391,7 +1391,7 @@ describe('Walker', () => {
         provider: 'test',
       });
 
-      const result = await walker.walk(); // collect revise
+      const result = await spider.crawl(); // collect revise
       assert.equal(result?.action, 'engine-completed');
       assert.equal((result as { engineId: string }).engineId, 'revise');
 
@@ -1407,14 +1407,14 @@ describe('Walker', () => {
 
   describe('walk() returns null', () => {
     it('returns null when no rigs exist and no ready writs', async () => {
-      const result = await fix.walker.walk();
+      const result = await fix.spider.crawl();
       assert.equal(result, null);
     });
 
     it('returns null when the rig has a running engine with no terminal session', async () => {
-      const { clerk, walker, stacks } = fix;
+      const { clerk, spider, stacks } = fix;
       await postWrit(clerk);
-      await walker.walk(); // spawn
+      await spider.crawl(); // spawn
 
       const book = rigsBook(stacks);
       const [rig] = await book.list();
@@ -1439,7 +1439,7 @@ describe('Walker', () => {
         provider: 'test',
       });
 
-      const result = await walker.walk();
+      const result = await spider.crawl();
       assert.equal(result, null);
     });
   });
diff --git a/packages/plugins/walker/src/walker.ts b/packages/plugins/spider/src/spider.ts
similarity index 92%
rename from packages/plugins/walker/src/walker.ts
rename to packages/plugins/spider/src/spider.ts
index 62c2a9b..00badc3 100644
--- a/packages/plugins/walker/src/walker.ts
+++ b/packages/plugins/spider/src/spider.ts
@@ -1,8 +1,8 @@
 /**
- * The Walker — rig execution engine apparatus.
+ * The Spider — rig execution engine apparatus.
  *
- * The Walker drives writ-to-completion by managing rigs: ordered pipelines
- * of engine instances. Each walk() call performs one unit of work:
+ * The Spider drives writ-to-completion by managing rigs: ordered pipelines
+ * of engine instances. Each crawl() call performs one unit of work:
  *
  *   collect > run > spawn   (priority order)
  *
@@ -13,7 +13,7 @@
  * CDC on the rigs book (Phase 1 cascade) transitions the associated writ
  * when a rig reaches a terminal state (completed or failed).
  *
- * See: docs/architecture/apparatus/walker.md
+ * See: docs/architecture/apparatus/spider.md
  */
 
 import type { Plugin, StartupContext } from '@shardworks/nexus-core';
@@ -26,9 +26,9 @@ import type { SessionDoc } from '@shardworks/animator-apparatus';
 import type {
   RigDoc,
   EngineInstance,
-  WalkerApi,
-  WalkResult,
-  WalkerConfig,
+  SpiderApi,
+  CrawlResult,
+  SpiderConfig,
 } from './types.ts';
 
 import {
@@ -39,7 +39,7 @@ import {
   sealEngine,
 } from './engines/index.ts';
 
-import { walkTool, walkContinualTool } from './tools/index.ts';
+import { crawlTool, crawlContinualTool } from './tools/index.ts';
 
 // ── Helpers ────────────────────────────────────────────────────────────
 
@@ -91,7 +91,7 @@ function findRunnableEngine(rig: RigDoc): EngineInstance | null {
  * Each engine receives only the givens it needs.
  * Upstream yields arrive via context.upstream at run time.
  */
-function buildStaticEngines(writ: WritDoc, config: WalkerConfig): EngineInstance[] {
+function buildStaticEngines(writ: WritDoc, config: SpiderConfig): EngineInstance[] {
   const role = config.role ?? 'artificer';
   const reviewGivens: Record<string, unknown> = {
     writ,
@@ -111,15 +111,15 @@ function buildStaticEngines(writ: WritDoc, config: WalkerConfig): EngineInstance
 
 // ── Apparatus factory ──────────────────────────────────────────────────
 
-export function createWalker(): Plugin {
+export function createSpider(): Plugin {
   let rigsBook: Book<RigDoc>;
   let sessionsBook: ReadOnlyBook<SessionDoc>;
   let writsBook: ReadOnlyBook<WritDoc>;
   let clerk: ClerkApi;
   let fabricator: FabricatorApi;
-  let walkerConfig: WalkerConfig = {};
+  let spiderConfig: SpiderConfig = {};
 
-  // ── Internal walk operations ─────────────────────────────────────
+  // ── Internal crawl operations ─────────────────────────────────────
 
   /**
    * Mark an engine failed and propagate failure to the rig (same update).
@@ -148,7 +148,7 @@ export function createWalker(): Plugin {
    * reached a terminal state. Populate yields and advance the engine
    * (and possibly the rig) to completed or failed.
    */
-  async function tryCollect(): Promise<WalkResult | null> {
+  async function tryCollect(): Promise<CrawlResult | null> {
     const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
     for (const rig of runningRigs) {
       for (const engine of rig.engines) {
@@ -217,7 +217,7 @@ export function createWalker(): Plugin {
    *   check for rig completion.
    * - Quick ('launched') → store sessionId, mark engine running.
    */
-  async function tryRun(): Promise<WalkResult | null> {
+  async function tryRun(): Promise<CrawlResult | null> {
     const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
     for (const rig of runningRigs) {
       const pending = findRunnableEngine(rig);
@@ -297,7 +297,7 @@ export function createWalker(): Plugin {
    * Find the oldest ready writ with no existing rig. Create a rig and
    * transition the writ to active so the Clerk tracks it as in-progress.
    */
-  async function trySpawn(): Promise<WalkResult | null> {
+  async function trySpawn(): Promise<CrawlResult | null> {
     // Find ready writs ordered by creation time (oldest first)
     const readyWrits = await writsBook.find({
       where: [['status', '=', 'ready']],
@@ -314,7 +314,7 @@ export function createWalker(): Plugin {
       if (existing.length > 0) continue;
 
       const rigId = generateId('rig', 4);
-      const engines = buildStaticEngines(writ, walkerConfig);
+      const engines = buildStaticEngines(writ, spiderConfig);
 
       const rig: RigDoc = {
         id: rigId,
@@ -331,7 +331,7 @@ export function createWalker(): Plugin {
       } catch (err) {
         // Only swallow state-transition conflicts (writ already moved past 'ready')
         if (err instanceof Error && err.message.includes('transition')) {
-          // Race condition — another walker got here first. The rig is already created,
+          // Race condition — another spider got here first. The rig is already created,
           // so we continue. The writ is already active or beyond.
         } else {
           throw err;
@@ -344,10 +344,10 @@ export function createWalker(): Plugin {
     return null;
   }
 
-  // ── WalkerApi ─────────────────────────────────────────────────────
+  // ── SpiderApi ─────────────────────────────────────────────────────
 
-  const api: WalkerApi = {
-    async walk(): Promise<WalkResult | null> {
+  const api: SpiderApi = {
+    async crawl(): Promise<CrawlResult | null> {
       const collected = await tryCollect();
       if (collected) return collected;
 
@@ -380,27 +380,27 @@ export function createWalker(): Plugin {
           revise:    reviseEngine,
           seal:      sealEngine,
         },
-        tools: [walkTool, walkContinualTool],
+        tools: [crawlTool, crawlContinualTool],
       },
 
       provides: api,
 
       start(_ctx: StartupContext): void {
         const g = guild();
-        walkerConfig = g.guildConfig().walker ?? {};
+        spiderConfig = g.guildConfig().spider ?? {};
 
         const stacks = g.apparatus<StacksApi>('stacks');
         clerk = g.apparatus<ClerkApi>('clerk');
         fabricator = g.apparatus<FabricatorApi>('fabricator');
 
-        rigsBook = stacks.book<RigDoc>('walker', 'rigs');
+        rigsBook = stacks.book<RigDoc>('spider', 'rigs');
         sessionsBook = stacks.readBook<SessionDoc>('animator', 'sessions');
         writsBook = stacks.readBook<WritDoc>('clerk', 'writs');
 
         // CDC — Phase 1 cascade on rigs book.
         // When a rig reaches a terminal state, transition the associated writ.
         stacks.watch<RigDoc>(
-          'walker',
+          'spider',
           'rigs',
           async (event) => {
             if (event.type !== 'update') return;
diff --git a/packages/plugins/walker/src/tools/walk-continual.ts b/packages/plugins/spider/src/tools/crawl-continual.ts
similarity index 64%
rename from packages/plugins/walker/src/tools/walk-continual.ts
rename to packages/plugins/spider/src/tools/crawl-continual.ts
index 4437139..54b7605 100644
--- a/packages/plugins/walker/src/tools/walk-continual.ts
+++ b/packages/plugins/spider/src/tools/crawl-continual.ts
@@ -1,20 +1,20 @@
 /**
- * walkContinual tool — runs the walk loop continuously.
+ * crawlContinual tool — runs the crawl loop continuously.
  *
- * Polls walk() on a configurable interval until stopped or no remaining
+ * Polls crawl() on a configurable interval until stopped or no remaining
  * work exists for the configured number of consecutive idle cycles.
  */
 
 import { z } from 'zod';
 import { guild } from '@shardworks/nexus-core';
 import { tool } from '@shardworks/tools-apparatus';
-import type { WalkerApi, WalkerConfig } from '../types.ts';
+import type { SpiderApi, SpiderConfig } from '../types.ts';
 
 export default tool({
-  name: 'walkContinual',
-  description: 'Run the Walker loop continuously until idle',
+  name: 'crawlContinual',
+  description: "Run the Spider's crawl loop continuously until idle",
   instructions:
-    'Polls walk() in a loop, sleeping between steps when idle. ' +
+    'Polls crawl() in a loop, sleeping between steps when idle. ' +
     'Stops when the configured number of consecutive idle cycles is reached. ' +
     'Returns a summary of all actions taken.',
   params: {
@@ -23,7 +23,7 @@ export default tool({
       .optional()
       .default(3)
       .describe(
-        'Number of consecutive idle walk() calls before stopping (default: 3)',
+        'Number of consecutive idle crawl() calls before stopping (default: 3)',
       ),
     pollIntervalMs: z
       .number()
@@ -32,11 +32,11 @@ export default tool({
         'Override the configured poll interval in milliseconds',
       ),
   },
-  permission: 'walker:write',
+  permission: 'spider:write',
   handler: async (params) => {
     const g = guild();
-    const walker = g.apparatus<WalkerApi>('walker');
-    const config = g.guildConfig().walker ?? {} as WalkerConfig;
+    const spider = g.apparatus<SpiderApi>('spider');
+    const config = g.guildConfig().spider ?? {} as SpiderConfig;
     const intervalMs = params.pollIntervalMs ?? config.pollIntervalMs ?? 5000;
     const maxIdle = params.maxIdleCycles;
 
@@ -44,11 +44,11 @@ export default tool({
     let idleCount = 0;
 
     while (idleCount < maxIdle) {
-      let result: Awaited<ReturnType<typeof walker.walk>>;
+      let result: Awaited<ReturnType<typeof spider.crawl>>;
       try {
-        result = await walker.walk();
+        result = await spider.crawl();
       } catch (err) {
-        console.error('[walkContinual] walk() error:', err instanceof Error ? err.message : String(err));
+        console.error('[crawlContinual] crawl() error:', err instanceof Error ? err.message : String(err));
         idleCount++;
         if (idleCount < maxIdle) {
           await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
diff --git a/packages/plugins/spider/src/tools/crawl.ts b/packages/plugins/spider/src/tools/crawl.ts
new file mode 100644
index 0000000..4354d8d
--- /dev/null
+++ b/packages/plugins/spider/src/tools/crawl.ts
@@ -0,0 +1,25 @@
+/**
+ * crawl tool — executes a single step of the crawl loop.
+ *
+ * Returns the CrawlResult or null (idle) from one crawl() call.
+ * Useful for manual step-through or testing.
+ */
+
+import { guild } from '@shardworks/nexus-core';
+import { tool } from '@shardworks/tools-apparatus';
+import type { SpiderApi } from '../types.ts';
+
+export default tool({
+  name: 'crawl',
+  description: "Execute one step of the Spider's crawl loop",
+  instructions:
+    'Runs a single crawl() step: collect a pending session result, run the next ' +
+    'ready engine, or spawn a rig for a ready writ — in that priority order. ' +
+    'Returns the action taken, or null if there is nothing to do.',
+  params: {},
+  permission: 'spider:write',
+  handler: async () => {
+    const spider = guild().apparatus<SpiderApi>('spider');
+    return spider.crawl();
+  },
+});
diff --git a/packages/plugins/spider/src/tools/index.ts b/packages/plugins/spider/src/tools/index.ts
new file mode 100644
index 0000000..b497c1b
--- /dev/null
+++ b/packages/plugins/spider/src/tools/index.ts
@@ -0,0 +1,2 @@
+export { default as crawlTool } from './crawl.ts';
+export { default as crawlContinualTool } from './crawl-continual.ts';
diff --git a/packages/plugins/walker/src/types.ts b/packages/plugins/spider/src/types.ts
similarity index 81%
rename from packages/plugins/walker/src/types.ts
rename to packages/plugins/spider/src/types.ts
index 31dad0f..c04c1e4 100644
--- a/packages/plugins/walker/src/types.ts
+++ b/packages/plugins/spider/src/types.ts
@@ -1,7 +1,7 @@
 /**
- * The Walker — public types.
+ * The Spider — public types.
  *
- * Rig and engine data model, WalkResult, WalkerApi, and configuration.
+ * Rig and engine data model, CrawlResult, SpiderApi, and configuration.
  * Engine yield shapes (DraftYields, SealYields) live here too so downstream
  * packages can import them without depending on the engine implementation files.
  */
@@ -19,7 +19,7 @@ export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed';
  * For the static pipeline it matches `designId`.
  *
  * `givensSpec` holds literal values set at spawn time (writ, role, commands).
- * The Walker assembles `givens` from this directly; upstream yields arrive
+ * The Spider assembles `givens` from this directly; upstream yields arrive
  * via `context.upstream` as the escape hatch.
  */
 export interface EngineInstance {
@@ -52,8 +52,8 @@ export type RigStatus = 'running' | 'completed' | 'failed';
 /**
  * A rig — the execution context for a single writ.
  *
- * Stored in The Stacks (`walker/rigs` book). The `engines` array is the
- * ordered pipeline of engine instances. The Walker updates this document
+ * Stored in The Stacks (`spider/rigs` book). The `engines` array is the
+ * ordered pipeline of engine instances. The Spider updates this document
  * in-place as engines run and complete.
  */
 export interface RigDoc {
@@ -69,53 +69,53 @@ export interface RigDoc {
   engines: EngineInstance[];
 }
 
-// ── WalkResult ────────────────────────────────────────────────────────
+// ── CrawlResult ────────────────────────────────────────────────────────
 
 /**
- * The result of a single walk() call.
+ * The result of a single crawl() call.
  *
  * Four variants, ordered by priority:
  * - 'engine-completed' — an engine finished (collected or ran inline); rig still running
  * - 'engine-started'   — launched a quick engine's session
  * - 'rig-spawned'      — created a new rig for a ready writ
- * - 'rig-completed'    — the walk step caused a rig to reach a terminal state
+ * - 'rig-completed'    — the crawl step caused a rig to reach a terminal state
  *
  * null means no work was available.
  */
-export type WalkResult =
+export type CrawlResult =
   | { action: 'engine-completed'; rigId: string; engineId: string }
   | { action: 'engine-started'; rigId: string; engineId: string }
   | { action: 'rig-spawned'; rigId: string; writId: string }
   | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' };
 
-// ── WalkerApi ─────────────────────────────────────────────────────────
+// ── SpiderApi ─────────────────────────────────────────────────────────
 
 /**
- * The Walker's public API — retrieved via guild().apparatus<WalkerApi>('walker').
+ * The Spider's public API — retrieved via guild().apparatus<SpiderApi>('spider').
  */
-export interface WalkerApi {
+export interface SpiderApi {
   /**
-   * Execute one step of the walk loop.
+   * Execute one step of the crawl loop.
    *
    * Priority ordering: collect > run > spawn.
    * Returns null when no work is available.
    */
-  walk(): Promise<WalkResult | null>;
+  crawl(): Promise<CrawlResult | null>;
 }
 
 // ── Configuration ─────────────────────────────────────────────────────
 
 /**
- * Walker apparatus configuration — lives under the `walker` key in guild.json.
+ * Spider apparatus configuration — lives under the `spider` key in guild.json.
  */
-export interface WalkerConfig {
+export interface SpiderConfig {
   /**
    * Role to summon for quick engine sessions.
    * Default: 'artificer'.
    */
   role?: string;
   /**
-   * Polling interval for walkContinual tool (milliseconds).
+   * Polling interval for crawlContinual tool (milliseconds).
    * Default: 5000.
    */
   pollIntervalMs?: number;
@@ -133,7 +133,7 @@ export interface WalkerConfig {
 
 /**
  * Yields from the `draft` clockwork engine.
- * The Walker stores these in the engine instance and passes them
+ * The Spider stores these in the engine instance and passes them
  * to downstream engines via context.upstream['draft'].
  */
 export interface DraftYields {
@@ -165,7 +165,7 @@ export interface SealYields {
 
 /**
  * Yields from the `implement` quick engine.
- * Set by the Walker's collect step when the Animator session completes.
+ * Set by the Spider's collect step when the Animator session completes.
  */
 export interface ImplementYields {
   /** The Animator session id. */
@@ -191,7 +191,7 @@ export interface MechanicalCheck {
 
 /**
  * Yields from the `review` quick engine.
- * Assembled by the Walker's collect step from session.output and session.metadata.
+ * Assembled by the Spider's collect step from session.output and session.metadata.
  */
 export interface ReviewYields {
   /** The Animator session id. */
@@ -206,7 +206,7 @@ export interface ReviewYields {
 
 /**
  * Yields from the `revise` quick engine.
- * Set by the Walker's collect step when the Animator session completes.
+ * Set by the Spider's collect step when the Animator session completes.
  */
 export interface ReviseYields {
   /** The Animator session id. */
@@ -215,9 +215,9 @@ export interface ReviseYields {
   sessionStatus: 'completed' | 'failed';
 }
 
-// Augment GuildConfig so `guild().guildConfig().walker` is typed.
+// Augment GuildConfig so `guild().guildConfig().spider` is typed.
 declare module '@shardworks/nexus-core' {
   interface GuildConfig {
-    walker?: WalkerConfig;
+    spider?: SpiderConfig;
   }
 }
diff --git a/packages/plugins/walker/tsconfig.json b/packages/plugins/spider/tsconfig.json
similarity index 100%
rename from packages/plugins/walker/tsconfig.json
rename to packages/plugins/spider/tsconfig.json
diff --git a/packages/plugins/walker/src/tools/index.ts b/packages/plugins/walker/src/tools/index.ts
deleted file mode 100644
index a54f99c..0000000
--- a/packages/plugins/walker/src/tools/index.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export { default as walkTool } from './walk.ts';
-export { default as walkContinualTool } from './walk-continual.ts';
diff --git a/packages/plugins/walker/src/tools/walk.ts b/packages/plugins/walker/src/tools/walk.ts
deleted file mode 100644
index 430cf95..0000000
--- a/packages/plugins/walker/src/tools/walk.ts
+++ /dev/null
@@ -1,25 +0,0 @@
-/**
- * walk tool — executes a single step of the walk loop.
- *
- * Returns the WalkResult or null (idle) from one walk() call.
- * Useful for manual step-through or testing.
- */
-
-import { guild } from '@shardworks/nexus-core';
-import { tool } from '@shardworks/tools-apparatus';
-import type { WalkerApi } from '../types.ts';
-
-export default tool({
-  name: 'walk',
-  description: 'Execute one step of the Walker loop',
-  instructions:
-    'Runs a single walk() step: collect a pending session result, run the next ' +
-    'ready engine, or spawn a rig for a ready writ — in that priority order. ' +
-    'Returns the action taken, or null if there is nothing to do.',
-  params: {},
-  permission: 'walker:write',
-  handler: async () => {
-    const walker = guild().apparatus<WalkerApi>('walker');
-    return walker.walk();
-  },
-});
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index 21c0c1d..d8b8383 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -236,36 +236,7 @@ importers:
         specifier: 25.5.0
         version: 25.5.0
 
-  packages/plugins/stacks:
-    dependencies:
-      '@shardworks/nexus-core':
-        specifier: workspace:*
-        version: link:../../framework/core
-      better-sqlite3:
-        specifier: 12.8.0
-        version: 12.8.0
-    devDependencies:
-      '@types/better-sqlite3':
-        specifier: 7.6.13
-        version: 7.6.13
-      '@types/node':
-        specifier: 25.5.0
-        version: 25.5.0
-
-  packages/plugins/tools:
-    dependencies:
-      '@shardworks/nexus-core':
-        specifier: workspace:*
-        version: link:../../framework/core
-      zod:
-        specifier: 4.3.6
-        version: 4.3.6
-    devDependencies:
-      '@types/node':
-        specifier: 25.5.0
-        version: 25.5.0
-
-  packages/plugins/walker:
+  packages/plugins/spider:
     dependencies:
       '@shardworks/animator-apparatus':
         specifier: workspace:*
@@ -296,6 +267,35 @@ importers:
         specifier: 25.5.0
         version: 25.5.0
 
+  packages/plugins/stacks:
+    dependencies:
+      '@shardworks/nexus-core':
+        specifier: workspace:*
+        version: link:../../framework/core
+      better-sqlite3:
+        specifier: 12.8.0
+        version: 12.8.0
+    devDependencies:
+      '@types/better-sqlite3':
+        specifier: 7.6.13
+        version: 7.6.13
+      '@types/node':
+        specifier: 25.5.0
+        version: 25.5.0
+
+  packages/plugins/tools:
+    dependencies:
+      '@shardworks/nexus-core':
+        specifier: workspace:*
+        version: link:../../framework/core
+      zod:
+        specifier: 4.3.6
+        version: 4.3.6
+    devDependencies:
+      '@types/node':
+        specifier: 25.5.0
+        version: 25.5.0
+
 packages:
 
   '@hono/node-server@1.19.11':
```
```

## Full File Contents (for context)


=== FILE: docs/architecture/_agent-context.md ===
# Agent Context: Architecture Doc Codebase Scan

> **Purpose:** Notes for agents working on `docs/architecture/index.md` so they don't have to re-scan the codebase from scratch. Written during the initial scaffolding session (2026-03-31). May drift from reality — treat as orientation, not ground truth.

---

## Repo Layout

The Nexus framework lives at `/workspace/nexus/`. Key directories:

```
/workspace/nexus/
  packages/               ← TypeScript packages (pnpm workspace)
  docs/
    architecture/         ← THIS IS WHERE YOU ARE
    reference/            ← API reference (core-api.md, schema.md, event-catalog.md, conversations.md)
    guides/               ← How-to guides (building-engines.md, building-tools.md)
    guild-metaphor.md     ← Conceptual vocabulary; read this first
    philosophy.md         ← Project "why"
```

The live guild workspace (where animas operate) is at `/workspace/shardworks/`.

The patron-side sanctum (experiments, session notes, Coco config) is at `/workspace/nexus-mk2/`.

---

## Packages

| Package | npm name | What it is |
|---------|----------|------------|
| `core` | `@shardworks/nexus-core` | Shared library — Books, config, path utilities, writ/anima/event functions, `tool()` and `engine()` SDK factories, `Rig` type |
| `arbor` | `@shardworks/nexus-arbor` (approx) | Guild runtime object — loads plugins (currently "rigs"), manages tool registry, owns Books database connection |
| `cli` | `@shardworks/nexus` | The `nsg` CLI binary |
| `nexus-clockworks` | `@shardworks/nexus-clockworks` | Clockworks as a rig — contributes clockworks tools and events/dispatches Books tables |
| `nexus-sessions` | `@shardworks/nexus-sessions` | Sessions as a rig — contributes session tools and sessions Book |
| `guild-starter-kit` | `@shardworks/guild-starter-kit` | Starter bundle — curricula, temperaments, migration snapshots |
| `claude-code-apparatus` | `@shardworks/claude-code-apparatus` | Session provider implementation for Claude Code / claude CLI |
| `stdlib` | `@shardworks/nexus-stdlib` | Standard tools, engines, relays |

---

## The Rig Terminology Collision

**This is the most important thing to understand before touching this doc.**

The word "rig" means two completely different things in this codebase:

| Context | Meaning |
|---------|---------|
| **Guild metaphor / target architecture** | The execution scaffold assembled to fulfill a commission — seeded at commission time, built out by Spider with engines, struck when work is done |
| **Current code** (`Rig` type in `core/src/rig.ts`, loaded by Arbor) | A package contributing tools, Books declarations, and other capabilities to the guild — basically what the target architecture calls a Kit or Apparatus |

The current code's `Rig` is what we're moving toward calling a **Kit** (or Apparatus, for packages with a lifecycle). This rename is in progress. When reading source code, mentally substitute "plugin" for `Rig`.

The architecture docs use "rig" exclusively in the metaphor sense (execution scaffold). The source code uses it in the plugin sense. Both are in the same repo. Don't mix them up.

---

## Architecture Docs Status

### Exists and reasonably current

| Doc | Status | Notes |
|-----|--------|-------|
| `architecture/plugins.md` | Good | Describes the Kit/Apparatus model with full type signatures. This is aspirational architecture, not fully implemented. |
| `architecture/clockworks.md` | Good | Detailed; covers events, standing orders, relays, runner phases, daemon. Generally matches current implementation. |
| `architecture/kit-components.md` | Good | Tools, engines, relays — artifact model, descriptors, role gating, installation. Generally accurate. |
| `architecture/rigging.md` | Forward-looking | Describes Spider/Fabricator/Executor/Loom/Animator/Clerk as separate apparatus. This is the *target* design; currently much of this logic is either in core or not yet implemented. |
| `reference/schema.md` | Good | SQLite schema, ERD, entity ID prefixes. Reflects current database. |
| `reference/core-api.md` | Good | Function signatures for `@shardworks/nexus-core`. Generally accurate but some functions are in `legacy/1/` indicating in-flight migration. |
| `reference/event-catalog.md` | Not read | Should describe all framework events and payload shapes. |
| `guides/building-engines.md` | Good | How to write a clockwork engine. Code examples use `engine()` factory from nexus-core. Accurate for current implementation. |
| `guides/building-tools.md` | Not read | Parallel to building-engines.md for tools. |

### Outdated / moved

| Doc | Status | Notes |
|-----|--------|-------|
| `outdated-architecture/overview.md` (in nexus-mk2) | Outdated | Long overview doc from before the apparatus/kit fragmentation. Useful for historical context and some section content (instruction environment, data storage breakdown). Don't trust its package names or directory structures. |

### Exists in nexus-mk2 future/ but not yet written

| Doc | Where referenced | What it should cover |
|-----|-----------------|---------------------|
| `anima-composition.md` | kit-components.md | Curricula, temperaments, oaths — composition artifacts |
| `writs.md` | multiple places | Writ lifecycle, completion rollup, prompt templates, commission→mandate bridge |
| `engine-designs.md` | plugins.md, future/ | SpiderKit engine design specifications |
| `anima-lifecycle.md` | future/ | Anima states, instantiation, retirement |

---

## What's Implemented vs. Aspirational

The codebase is in active transition from a "rig-centric" model (current) toward the full "apparatus/kit" plugin model (target).

### Currently implemented (in actual packages)

- `Rig` type as the plugin interface (tools + books declarations)
- Arbor as the rig loader and runtime object
- Clockworks as a nexus-sessions-style rig (contributes tools + Books)
- Sessions as a rig (contributes tools + Books)
- `tool()` and `engine()` SDK factories in nexus-core
- SQLite Books database with schema migrations
- Standing orders, event queue, Clockworks daemon
- Writ lifecycle (create, activate, complete, fail, cancel)
- Anima instantiation, roster, role assignments
- Commission → mandate writ → dispatch flow
- Session funnel (manifest → MCP engine launch → session record)
- Session providers (pluggable; claude-code-apparatus exists)

### Target architecture (described in docs, not yet fully built)

- Formal `Plugin` type with explicit Kit/Apparatus discriminant
- `Apparatus` with `start`/`stop`/`health`/`supportKit`/`consumes`
- `GuildContext` with `ctx.plugin()`, `ctx.kits()`, `ctx.plugins()`
- Separate named apparatus: Stacks, Guildhall, Clerk, Loom, Animator, Fabricator, Spider, Executor, Surveyor, Warden
- Spider-driven rig execution (the commission → rig → engine chain)
- Fabricator (capability resolution from installed kits)
- `plugin:initialized` reactive consumption
- Startup validation with `requires` / `consumes` cross-referencing

---

## Key Files to Read

If you're working on a specific section of the architecture doc, start with:

| Section | Most relevant files |
|---------|-------------------|
| Plugin Architecture | `docs/architecture/plugins.md`, `packages/arbor/src/arbor.ts` |
| The Books | `docs/reference/schema.md`, `packages/core/src/book.ts`, `packages/arbor/src/db/` |
| Animas | `packages/core/src/legacy/1/anima.ts`, `guild-metaphor.md` (Anima section) |
| Work Model | `packages/core/src/legacy/1/writ.ts`, `docs/reference/schema.md` (writs table), `clockworks.md` |
| Kit Components | `docs/architecture/kit-components.md`, `packages/core/src/tool.ts` |
| Sessions | `packages/plugins/claude-code/src/`, `docs/reference/conversations.md` |
| Clockworks | `docs/architecture/clockworks.md`, `packages/nexus-clockworks/src/` |
| Rigging | `docs/architecture/rigging.md` (aspirational), `packages/arbor/src/arbor.ts` (current) |

---

## guild.json Shape

The V2 type (`GuildConfig` in `packages/core/src/guild-config.ts`) defines the framework keys. All other top-level keys are plugin configuration sections, keyed by derived plugin id.

**Framework keys:** `name`, `nexus`, `plugins` (string array), `settings` (object with `model`, `autoMigrate`).

**Plugin config keys (standard guild):** `clockworks`, `codexes`, `roles`, `baseTools` — owned by their respective apparatus, not by the framework. They sit at the top level because `@shardworks/clockworks` → `clockworks`, `@shardworks/codexes-apparatus` → `codexes`, etc.

Note: the live guild at `/workspace/shardworks/` is still running the V1 config shape (per-capability registries: `tools`, `engines`, `curricula`, `temperaments` as objects, no `plugins` array). V2 has `plugins` as a flat string array and drops per-capability registries. The architecture docs describe V2.

---

## Terminology Quick Reference

| Term in metaphor | Term in code (current) | Term in target architecture |
|-----------------|----------------------|----------------------------|
| Rig (execution scaffold) | (not yet implemented) | Rig |
| Kit / Apparatus | Rig (plugin package) | Kit / Apparatus |
| The Books | nexus.db / SQLite tables | The Stacks (`books` apparatus) |
| Summon relay | built-in clockworks dispatch | summon relay (installed via nexus-stdlib) |
| Arbor | Arbor | Arbor |
| Spider | (not yet implemented) | The Spider (`spider` apparatus) |
| Fabricator | (not yet implemented) | The Fabricator (`fabricator` apparatus) |

---

## Session Notes

- **2026-03-31 (session 1):** Initial scaffold session. Wrote §1–4 scaffold + "Standard Guild" bridge section. Created this context doc. Architecture doc is at `docs/architecture/index.md`. Companion detailed docs are already written for clockworks, plugins, kit-components, and rigging — they're good references even if partially aspirational.

- **2026-03-31 (session 2):** Wrote §2 content (intro paragraph, ASCII diagram, narrative subsections). Scoped §2 explicitly as the "standard guild" — blockquote caveat added before the intro paragraph. Established the intended narrative arc: §2 gives the standard-guild mental model → §4 peels it back ("everything in §2 is a plugin, there is no privileged built-in layer") → Standard Guild bridge lists the defaults → detail sections proceed without hedging. **When writing §4**, open with a callback to §2: *"The apparatus described in §2 — Clerk, Spider, Clockworks, and the rest — are all plugins..."* This converts §2 into setup and §4 into the architectural reveal.

- **2026-03-31 (session 3):** Completed §3 (Guild Root) and §4 (Plugin Architecture). Corrected `guild.json` key names from real V2 type. Documented real `.nexus/` contents. Identified and resolved a plugin configuration specification gap — see design decisions below. Rewrote §4 with the §2 callback opening, corrected Kit/Apparatus examples (new naming convention, correct manifest shape), added Plugin IDs and Configuration subsections, updated GuildContext/HandlerContext interfaces with `config<T>()` and `guildConfig()`. Cleaned up Standard Guild table (dropped Guildhall, dropped layer column, added plugin id column, updated Stacks description). Restructured `guild.json` section to separate framework keys (`name`, `nexus`, `plugins`, `settings`) from plugin config sections (everything else, keyed by plugin id). Updated `plugins.md` spec with Plugin IDs section, Configuration section, and updated context interfaces.

---

## Design Decisions (session 3)

### Plugin name derivation

Plugin ids are derived from npm package names with three rules applied in order:
1. Strip `@shardworks/` scope entirely (bare name)
2. Retain other scopes as prefix without `@` (`@acme/foo` → `acme/foo`)
3. Strip trailing `-(plugin|apparatus|kit)` suffix

This means `@shardworks/clockworks` → `clockworks`, `@shardworks/books-apparatus` → `books`, `@acme/cache-apparatus` → `acme/cache`. Documented in `plugins.md` (Plugin IDs section). **Not yet implemented** — see implementation plan.

### Plugin configuration access

Config sections live at the top level of `guild.json` under the plugin's derived id. Because `@shardworks/clockworks` → `clockworks`, the Clockworks apparatus gets `guild.json["clockworks"]` naturally — no privileged handling.

Access is via `guild().config<T>(pluginId)` — always requires an explicit plugin id (no implicit scoping). `guild().guildConfig()` is the escape hatch for framework-level fields.

Documented in `plugins.md` (Plugin IDs section + Configuration section). **Implemented** in session 4.

### guild() singleton — replaces HandlerContext

**Problem identified:** `HandlerContext` was injected into tool handlers as a second parameter, but the MCP server created a broken stub (all methods threw), and the pattern required a context factory in Arbor, the CLI, and the CDC registry.

**Decision:** Replace with a process-level singleton `guild()` from `@shardworks/nexus-core`. All plugin code — apparatus `start()`, tool handlers, CDC handlers — calls `guild()` to access `home`, `apparatus()`, `config()`, `guildConfig()`, `kits()`, `apparatuses()`.

Arbor creates the `Guild` instance before starting any apparatus (backed by the live `provides` Map, so dependency ordering works). `setGuild()` and `clearGuild()` are exported for testing.

`HandlerContext` and `GuildContext` removed from plugin.ts. `createHandlerContext` removed from Arbor interface. `createMinimalHandlerContext` removed from CLI. Tool handler signature: `(params) => unknown | Promise<unknown>` — no context parameter.

### GuildContext → StartupContext

**Problem:** `GuildContext` (passed to apparatus `start()`) overlapped with `guild()` — same methods (`apparatus()`, `config()`, `home`, etc.), different scoping behavior. Two contexts with similar methods but different semantics is confusing.

**Decision:** Strip `GuildContext` down to `StartupContext` with a single method: `on(event, handler)` for lifecycle event subscription. All other guild access in `start()` goes through `guild()`, same as everywhere else. No overlap, no confusion.

### GuildConfigV2 → GuildConfig

Renamed everywhere. Dropped V2 suffixes from `createInitialGuildConfig`, `readGuildConfig`, `writeGuildConfig`. Legacy V1 `GuildConfig` untouched in its own module scope (`legacy/1/guild-config.ts`).

### CDC handlers — no context injection

CDC handlers (`ChangeHandler`) no longer receive a context parameter. They capture dependencies via closure from the `start()` scope where they're registered. Signature: `(event: ChangeEvent<T>) => Promise<void> | void`.

---

## Next Steps for Architecture Doc (`index.md`)

### Completed sections
- **§1 Introduction** ✅
- **§2 System at a Glance** ✅ — scoped as standard guild, ASCII diagram, narrative subsections
- **§3 The Guild Root** ✅ — directory structure, guild.json (framework keys + plugin config), .nexus/ runtime state
- **§4 Plugin Architecture** ✅ — §2 callback, Kit/Apparatus examples, Plugin IDs, guild() singleton, StartupContext, Installation
- **The Standard Guild** ✅ — apparatus table (plugin ids) and kit table
- **The Books** ✅ — Stacks apparatus, document model, API surface, CDC, backend
- **Kit Components** ✅ — tools/engines/relays, comparison table, link to kit-components.md

### Remaining stub sections
All are `<!-- TODO -->` blocks. In rough priority order:

1. **Work Model** — Commission → Mandate writ → child writs → Rigs. Writ lifecycle states (`ready → active → pending → completed/failed/cancelled`). Writ hierarchy and completion rollup. Brief rig intro (Spider assembles from engine designs via Fabricator). Link to `rigging.md`.

2. **The Clockworks** — Abbreviate; `clockworks.md` is detailed and current. Cover: events as immutable facts, standing orders as guild policy, summon verb, framework vs custom events, runner (manual vs daemon), error handling. Link to `clockworks.md`.

3. **Animas** — MVP: no identity layer. Composition is per-role, not per-anima. The Loom weaves caller-provided system prompt into a session context (pass-through for MVP). Future: anima identity records, curricula, temperaments, states (active/retired). Keep section light on implementation since apparatus are being designed.

4. **Sessions** — Session funnel. Triggered by summon relay or `nsg consult`. Loom → Animator → AI process → result recorded. Session providers (pluggable). System prompt vs initial prompt. Bare mode. Link to `reference/conversations.md`.

5. **Core Apparatus Reference** — Quick-reference table with plugin ids, package names, API surface hints, links to detailed docs.

### Implementation work (not architecture doc)
- **guild() singleton** ✅ — implemented in session 4. `Guild` interface, `setGuild`/`clearGuild`, Arbor wiring, all handlers migrated.
- **GuildContext → StartupContext** ✅ — implemented in session 4. HandlerContext removed. createHandlerContext removed from Arbor.
- **GuildConfigV2 → GuildConfig** ✅ — renamed everywhere in session 4.
- **Plugin rename** — standard apparatus packages should be renamed to match new naming convention (e.g. `@shardworks/nexus-clockworks` → `@shardworks/clockworks`). Not yet commissioned. Scope TBD.
- **The Instrumentarium** — specs at `apparatus/instrumentarium.md`. Not yet implemented.
- **Loom MVP** — specs at `apparatus/loom.md`. Not yet implemented.
- **Animator MVP** — specs at `apparatus/animator.md`. Not yet implemented.

---

## Design Decisions (session 4)

### New apparatus: The Instrumentarium (`tools`)

**Problem:** Tools are currently owned by Arbor (`listTools()`, `findTool()`), but Arbor's design goal is "plugin loader only." Tools need a home that both the session layer (Loom/Animator) and the CLI can depend on, without coupling either to anima identity.

**Decision:** Create a new apparatus — **The Instrumentarium** (plugin id `tools`, package `@shardworks/tools-apparatus`). It owns:
- Tool registry — scanning kit `tools` contributions and apparatus `supportKit` tools at startup
- Role-gating resolution — given a set of roles + baseTools, return the resolved tool set
- CLI tool discovery — `nsg <tool>` resolves through The Instrumentarium

The Instrumentarium has no dependency on animas, sessions, or composition. Both The Loom and the CLI depend on it independently. Apparatus that need to invoke tools programmatically depend on it.

`consumes: ["tools"]` — scans kit and supportKit contributions for tool definitions.

### Loom MVP — composition without identity

**Problem:** Full anima composition (identity lookup → curriculum resolution → temperament resolution → charter + tool instructions) requires several systems that don't exist yet. But The Animator needs *some* composed context to launch sessions.

**Decision:** MVP Loom is a pass-through — the caller provides the system prompt and optional initial prompt. The Loom packages them into a `WovenContext` that The Animator consumes. No role resolution, no tool instructions, no file reading, no identity lookup.

The Loom exists as a separate apparatus even at MVP so that The Animator never assembles prompts itself. As composition grows (role instructions, tool instructions, curricula, temperaments, charter), The Loom's internals change but its output shape (`WovenContext`) stays stable — The Animator is unaffected.

### Animator MVP

**Decision:** MVP Animator takes a `WovenContext` (from Loom) + a working directory and:
1. Launches a session provider (e.g. `claude-code-apparatus`) with the system prompt
2. Monitors the process
3. Records the session result to The Stacks (sessions book)

No MCP tool server, no Instrumentarium dependency, no role awareness in MVP. Tool-equipped sessions with MCP are documented as future state in `apparatus/animator.md`.

### Dependency graph (MVP)

```
The Stacks (books)
    │
    └── The Animator (animator)
            │
            └── The Loom (loom)   ← zero apparatus dependencies, pass-through

The Clockworks (clockworks)
    │
    └── summon relay → The Loom → The Animator

The Instrumentarium (tools)   ← no dependencies in MVP, not yet wired to sessions
    │
    └── CLI (nsg)
```

Note: in MVP, The Loom and The Animator do not depend on The Instrumentarium. Tool-equipped sessions (Animator → Instrumentarium for MCP tool set) are future state.

=== FILE: docs/architecture/apparatus/animator.md ===
# The Animator — API Contract

Status: **Draft — MVP**

Package: `@shardworks/animator-apparatus` · Plugin id: `animator`

> **⚠️ MVP scope.** This spec covers session launch, structured telemetry recording, streaming output, error guarantees, and session inspection tools. There is no MCP tool server, no Instrumentarium dependency, no role awareness, and no event signalling. The Animator receives a woven context and a working directory, launches a session provider process, and records what happened. See the Future sections for the target design.

---

## Purpose

The Animator brings animas to life. It is the guild's session apparatus — the single entry point for making an anima do work. Two API levels serve different callers:

- **`summon()`** — the high-level "make an anima do a thing" call. Composes context via The Loom, launches a session, records the result. This is what the summon relay, the CLI, and most callers use.
- **`animate()`** — the low-level call for callers that compose their own `AnimaWeave` (e.g. The Parlour for multi-turn conversations).

Both methods return an `AnimateHandle` synchronously — a `{ chunks, result }` pair. The `result` promise resolves when the session completes. The `chunks` async iterable yields output when `streaming: true` is set; otherwise it completes immediately with no items. There is no separate streaming method — the `streaming` flag on the request controls the behavior, and the return shape is always the same.

The Animator does not assemble system prompts — that is The Loom's job. `summon()` delegates context composition to The Loom; `animate()` accepts a pre-composed `AnimaWeave` from any source. This separation means The Loom can evolve its composition model (adding role instructions, curricula, temperaments) without changing The Animator's interface.

---

## Dependencies

```
requires:   ['stacks']
recommends: ['loom']
```

- **The Stacks** (required) — records session results (the `sessions` book) and full transcripts (the `transcripts` book).
- **The Loom** (recommended) — composes session context for `summon()`. Not needed for `animate()`, which accepts a pre-composed context. Resolved at call time, not at startup — the Animator starts without the Loom, but `summon()` throws if it's not installed. Arbor emits a startup warning if the Loom is not installed.

---

## Kit Contribution

The Animator contributes two books and session tools via its supportKit:

```typescript
supportKit: {
  books: {
    sessions: {
      indexes: ['startedAt', 'status', 'conversationId', 'provider'],
    },
    transcripts: {
      indexes: ['sessionId'],
    },
  },
  tools: [sessionList, sessionShow, summon],
},
```

### `session-list` tool

List recent sessions with optional filters. Returns session summaries ordered by `startedAt` descending (newest first).

| Parameter | Type | Description |
|---|---|---|
| `status` | `'running' \| 'completed' \| 'failed' \| 'timeout'` | Filter by terminal status |
| `provider` | `string` | Filter by provider name |
| `conversationId` | `string` | Filter by conversation |
| `limit` | `number` | Maximum results (default: 20) |

Returns: `SessionResult[]` (summary projection — id, status, provider, startedAt, endedAt, durationMs, exitCode, costUsd).

Callers that need to filter by metadata fields (e.g. `metadata.writId`, `metadata.animaName`) use The Stacks' query API directly. The tool exposes filters for fields the Animator itself indexes.

### `session-show` tool

Show full detail for a single session by id.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Session id |

Returns: the complete session record from The Stacks, including `tokenUsage`, `metadata`, `output`, and all indexed fields.

### `summon` tool

Summon an anima from the CLI. Calls `animator.summon()` with the guild home as working directory. CLI-only (`callableBy: 'cli'`). Requires `animate` permission.

| Parameter | Type | Description |
|---|---|---|
| `prompt` | `string` (required) | The work prompt — what the anima should do |
| `role` | `string` (optional) | Role to summon (e.g. `'artificer'`, `'scribe'`) |

Returns: session summary (id, status, provider, durationMs, exitCode, costUsd, tokenUsage, error).

---

## `AnimatorApi` Interface (`provides`)

```typescript
interface AnimatorApi {
  /**
   * Summon an anima — compose context via The Loom and launch a session.
   *
   * This is the high-level entry point. Passes the role to The Loom for
   * identity composition, then animate() for session launch and recording.
   * The work prompt bypasses The Loom and goes directly to the provider.
   * Auto-populates session metadata with `trigger: 'summon'` and `role`.
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   * Requires The Loom apparatus to be installed. Throws if not available.
   */
  summon(request: SummonRequest): AnimateHandle

  /**
   * Animate a session — launch an AI process with the given context.
   *
   * This is the low-level entry point for callers that compose their own
   * AnimaWeave (e.g. The Parlour for multi-turn conversations).
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   * Records the session result to The Stacks before `result` resolves.
   *
   * Set `streaming: true` to receive output chunks as the session runs.
   * When streaming is disabled (default), `chunks` completes immediately.
   */
  animate(request: AnimateRequest): AnimateHandle
}

/** The return value from animate() and summon(). */
interface AnimateHandle {
  /** Output chunks. Empty iterable when not streaming. */
  chunks: AsyncIterable<SessionChunk>
  /** Resolves to the final SessionResult after recording. */
  result: Promise<SessionResult>
}

/** A chunk of output from a running session. */
type SessionChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string }

interface SummonRequest {
  /** The work prompt — sent directly to the provider, bypasses The Loom. */
  prompt: string
  /** The role to summon (e.g. 'artificer'). Passed to The Loom for composition. */
  role?: string
  /** Working directory for the session. */
  cwd: string
  /** Optional conversation id to resume a multi-turn conversation. */
  conversationId?: string
  /**
   * Additional metadata recorded alongside the session.
   * Merged with auto-generated metadata ({ trigger: 'summon', role }).
   * See § Caller Metadata.
   */
  metadata?: Record<string, unknown>
  /**
   * Environment variable overrides for the session process.
   * Merged with the AnimaWeave's environment (request overrides weave).
   * Use this for per-task identity — e.g. setting GIT_AUTHOR_EMAIL
   * to a writ ID for commit attribution.
   * See § Session Environment.
   */
  environment?: Record<string, string>
  /** Enable streaming output (default false). */
  streaming?: boolean
}

interface AnimateRequest {
  /** The anima weave — composed identity context from The Loom (or self-composed). */
  context: AnimaWeave
  /** The work prompt — sent directly to the provider as initialPrompt. */
  prompt?: string
  /**
   * Working directory for the session.
   * The session provider launches the AI process here.
   */
  cwd: string
  /**
   * Optional conversation id to resume a multi-turn conversation.
   * If provided, the session provider resumes the existing conversation
   * rather than starting a new one.
   */
  conversationId?: string
  /**
   * Caller-supplied metadata recorded alongside the session.
   * The Animator stores this as-is — it does not interpret the contents.
   * See § Caller Metadata.
   */
  metadata?: Record<string, unknown>
  /**
   * Environment variable overrides for the session process.
   * Merged with the AnimaWeave's environment (request overrides weave).
   * See § Session Environment.
   */
  environment?: Record<string, string>
  /** Enable streaming output (default false). */
  streaming?: boolean
}

interface SessionResult {
  /** Unique session id (generated by The Animator). */
  id: string
  /** Terminal status. */
  status: 'completed' | 'failed' | 'timeout'
  /** When the session started (ISO-8601). */
  startedAt: string
  /** When the session ended (ISO-8601). */
  endedAt: string
  /** Wall-clock duration in milliseconds. */
  durationMs: number
  /** Provider name (e.g. 'claude-code'). */
  provider: string
  /** Numeric exit code from the provider process. */
  exitCode: number
  /** Error message if failed. */
  error?: string
  /** Conversation id (for multi-turn resume). */
  conversationId?: string
  /** Session id from the provider (e.g. for --resume). */
  providerSessionId?: string
  /** Token usage from the provider, if available. */
  tokenUsage?: TokenUsage
  /** Cost in USD from the provider, if available. */
  costUsd?: number
  /** Caller-supplied metadata, recorded as-is. See § Caller Metadata. */
  metadata?: Record<string, unknown>
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message in the provider's transcript.
   * Useful for programmatic consumers that need the session's conclusion
   * without parsing the full transcript (e.g. the Spider's review collect step).
   */
  output?: string
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}
```

---

## Session Lifecycle

### `summon()` — the high-level path

```
summon(request)
  │
  ├─ 1. Resolve The Loom (throws if not installed)
  ├─ 2. Compose identity: loom.weave({ role })
  │     (Loom produces systemPrompt from anima identity layers;
  │      MVP: systemPrompt is undefined — composition not yet implemented)
  ├─ 3. Build AnimateRequest with:
  │     - context (AnimaWeave from Loom — includes environment)
  │     - prompt (work prompt, bypasses Loom)
  │     - environment (per-request overrides, if any)
  │     - auto-metadata { trigger: 'summon', role }
  └─ 4. Delegate to animate() → full animate lifecycle below
```

### `animate()` — the low-level path

```
animate(request)  →  { chunks, result }  (returned synchronously)
  │
  ├─ 1. Generate session id, capture startedAt
  ├─ 2. Write initial session record to The Stacks (status: 'running')
  │
  ├─ 3. Call provider.launch(config):
  │     - System prompt, initial prompt, model, cwd, conversationId
  │     - environment (merged: weave defaults + request overrides)
  │     - streaming flag passed through for provider to honor
  │     → provider returns { chunks, result } immediately
  │
  ├─ 4. Wrap provider result promise with recording:
  │     - On resolve: capture endedAt, durationMs, extract output from
  │       provider transcript, record session to Stacks, record transcript
  │       to transcripts book
  │     - On reject: record failed result, re-throw
  │     (ALWAYS records — see § Error Handling Contract)
  │
  └─ 5. Return { chunks, result } to caller
        chunks: the provider's iterable (may be empty)
        result: wraps provider result with Animator recording
```

The Animator does not branch on streaming. It passes the `streaming` flag to the provider via `SessionProviderConfig` and returns whatever the provider gives back. Providers that support streaming yield chunks when the flag is set; providers that don't return empty chunks. Callers should not assume chunks will be emitted.

---

## Session Providers

The Animator delegates AI process management to a **session provider** — a pluggable apparatus that knows how to launch and communicate with a specific AI system. The provider is discovered at runtime via guild config:

```json
{
  "animator": {
    "sessionProvider": "claude-code"
  }
}
```

The `sessionProvider` field names the plugin id of an apparatus whose `provides` object implements `AnimatorSessionProvider`. The Animator looks it up via `guild().apparatus<AnimatorSessionProvider>(config.sessionProvider)` at animate-time. Defaults to `'claude-code'` if not specified.

```typescript
interface AnimatorSessionProvider {
  /** Human-readable name (e.g. 'claude-code'). */
  name: string

  /**
   * Launch a session. Returns { chunks, result } synchronously.
   *
   * The result promise resolves when the AI process exits.
   * The chunks async iterable yields output when config.streaming
   * is true and the provider supports streaming; otherwise it
   * completes immediately with no items.
   *
   * Providers that don't support streaming simply ignore the flag
   * and return empty chunks — no separate method needed.
   */
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>
    result: Promise<SessionProviderResult>
  }
}

interface SessionProviderConfig {
  /** System prompt from the AnimaWeave — may be undefined at MVP. */
  systemPrompt?: string
  /** Work prompt from AnimateRequest.prompt — what the anima should do. */
  initialPrompt?: string
  /** Model to use (from guild settings). */
  model: string
  /** Optional conversation id for resume. */
  conversationId?: string
  /** Working directory for the session. */
  cwd: string
  /** Enable streaming output. Providers may ignore this flag. */
  streaming?: boolean
  /**
   * Environment variables for the session process.
   * Merged by the Animator from the AnimaWeave's environment and any
   * per-request overrides (request overrides weave). The provider
   * spreads these into the spawned process environment.
   */
  environment?: Record<string, string>
}

interface SessionProviderResult {
  /** Exit status. */
  status: 'completed' | 'failed' | 'timeout'
  /** Numeric exit code from the process. */
  exitCode: number
  /** Error message if failed. */
  error?: string
  /** Provider's session id (e.g. for --resume). */
  providerSessionId?: string
  /** Token usage, if the provider can report it. */
  tokenUsage?: TokenUsage
  /** Cost in USD, if the provider can report it. */
  costUsd?: number
  /** Full session transcript — array of NDJSON message objects. */
  transcript?: TranscriptMessage[]
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message's text content blocks.
   */
  output?: string
}

/** A single message from the NDJSON stream. Shape varies by provider. */
type TranscriptMessage = Record<string, unknown>
```

The default provider is `@shardworks/claude-code-apparatus` (plugin id: `claude-code`), which launches a `claude` CLI process in autonomous mode with `--output-format stream-json`. Provider packages import the `AnimatorSessionProvider` type from `@shardworks/animator-apparatus` and export an apparatus whose `provides` satisfies the interface.

---

## Error Handling Contract

The Animator guarantees that **step 5 (recording) always executes**, even if the provider throws or the process crashes. The provider launch (steps 3–4) is wrapped in try/finally. If the provider fails:

- The session record is still updated in The Stacks with `status: 'failed'`, the captured `endedAt`, `durationMs`, and the error message.
- `exitCode` defaults to `1` if the provider didn't return one.
- `tokenUsage` and `costUsd` are omitted (the provider may not have reported them).

If the Stacks write itself fails (e.g. database locked), the error is logged but does not propagate — the Animator returns or re-throws the provider error, not a recording error. Session data loss is preferable to masking the original failure.

```
Provider succeeds  → record status 'completed', return result
Provider fails     → record status 'failed' + error, re-throw provider error
Provider times out → record status 'timeout', return result with error
Recording fails    → log warning, continue with return/re-throw
```

---

## Caller Metadata

The `metadata` field on `AnimateRequest` is an opaque pass-through. The Animator records it in the session's Stacks entry without interpreting it. This allows callers to attach contextual information that the Animator itself doesn't understand:

```typescript
// Example: the summon relay attaches dispatch context
const { result } = animator.animate({
  context: wovenContext,
  cwd: '/path/to/worktree',
  metadata: {
    trigger: 'summon',
    animaId: 'anm-3f7b2c1',
    animaName: 'scribe',
    writId: 'wrt-8a4c9e2',
    workshop: 'nexus-mk2',
    workspaceKind: 'workshop-temp',
  },
});
const session = await result;

// Example: nsg consult attaches interactive session context
const { chunks, result: consultResult } = animator.animate({
  context: wovenContext,
  cwd: guildHome,
  streaming: true,
  metadata: {
    trigger: 'consult',
    animaId: 'anm-b2e8f41',
    animaName: 'coco',
  },
});
for await (const chunk of chunks) { /* stream to terminal */ }
const consultSession = await consultResult;
```

The `metadata` field is indexed in The Stacks as a JSON blob. Callers that need to query by metadata fields (e.g. "all sessions for writ X") use The Stacks' JSON path queries against the stored metadata.

This design keeps the Animator focused: it launches sessions and records what happened. Identity, dispatch context, and writ binding are concerns of the caller.

---

## Session Environment

The Animator supports environment variable injection into the spawned session process. This is the mechanism for giving animas distinct identities (e.g. git author) without modifying global host configuration.

Environment variables come from two sources, merged at session launch time:

1. **AnimaWeave** (`context.environment`) — identity-layer defaults from The Loom. Set per-role. Example: `GIT_AUTHOR_NAME=Artificer`, `GIT_AUTHOR_EMAIL=artificer@nexus.local`.
2. **Request** (`request.environment`) — per-task overrides from the caller. Example: the Dispatch sets `GIT_AUTHOR_EMAIL=w-{writId}@nexus.local` for per-commission git attribution.

The merge is simple: `{ ...weave.environment, ...request.environment }`. Request values override weave values for the same key. The merged result is passed to the session provider as `SessionProviderConfig.environment`, which the provider spreads into the child process environment (`{ ...process.env, ...config.environment }`).

This keeps the Animator generic — it does not interpret environment variables or know about git. The Loom decides what identity defaults a role should have. Orchestrators decide what per-task overrides are needed. The Animator just merges and passes through.

---

## Invocation Paths

The Animator is called from three places:

1. **The summon relay** — when a standing order fires `summon: "role"`, the relay calls `animator.summon()`. This is the Clockworks-driven autonomous path.

2. **`nsg summon`** — the CLI command for direct dispatch. Calls `animator.summon()` to launch a session with a work prompt.

3. **`nsg consult`** — the CLI command for interactive multi-turn sessions. Uses The Parlour, which composes its own context and calls `animator.animate()` directly.

Paths 1 and 2 use `summon()` (high-level — The Loom composes the context). Path 3 uses `animate()` (low-level — The Parlour composes the context). The Animator doesn't know or care which path invoked it — the session lifecycle is identical.

### CLI streaming behavior

The `nsg summon` command invokes the `summon` tool through the generic CLI tool runner, which `await`s the handler and prints the return value. The tool contract (`ToolDefinition.handler`) returns a single value — there is no streaming return type. The CLI prints the structured session summary (id, status, cost, token usage) to stdout when the session completes.

However, **real-time session output is visible during execution via stderr**. The claude-code provider spawns `claude` with `--output-format stream-json` and parses NDJSON from the child process's stdout. As assistant text chunks arrive, the provider writes them to `process.stderr` as a side effect of parsing (in `parseStreamJsonMessage`). Because the CLI inherits the provider's stderr, users see streaming text output in the terminal while the session runs.

This is intentional: stderr carries progress output, stdout carries the structured result. The pattern is standard for CLI tools that produce both human-readable progress and machine-readable results. The streaming output is a provider-level concern — the Animator and the tool system are not involved.

---

## Open Questions

- ~~**Provider discovery.** How does The Animator find installed session providers?~~ **Resolved:** the `guild.json["animator"]["sessionProvider"]` config field names the plugin id of the provider apparatus. The Animator looks it up via `guild().apparatus()`. Defaults to `'claude-code'`.
- **Timeout.** How are session timeouts configured? MVP: no timeout (the session runs until the provider exits).
- **Concurrency.** Can multiple sessions run simultaneously? Current answer: yes, each `animate()` call is independent.

---

## Future: Event Signalling

When The Clockworks integration is updated, The Animator will signal lifecycle events:

- **`session.started`** — fired after step 2 (initial record written). Payload includes `sessionId`, `provider`, `startedAt`, and caller-supplied `metadata`.
- **`session.ended`** — fired after step 5 (result recorded). Payload includes `sessionId`, `status`, `exitCode`, `durationMs`, `costUsd`, `error`, and `metadata`.
- **`session.record-failed`** — fired if the Stacks write in step 5 fails. Payload includes `sessionId` and the recording error. This is a diagnostic event — it means session data was lost.

These events are essential for clockworks standing orders (e.g. retry-on-failure, cost alerting, session auditing). The Animator fires them best-effort — event signalling failures are logged but never mask session results.

Blocked on: Clockworks apparatus spec finalization.

---

## Future: Enriched Session Records

At MVP, the Animator records what it directly observes (provider telemetry) and what the caller passes via `metadata`. The session record in The Stacks looks like:

```typescript
// MVP session record (what The Animator writes)
{
  id: 'ses-a3f7b2c1',
  status: 'completed',
  startedAt: '2026-04-01T12:00:00Z',
  endedAt: '2026-04-01T12:05:30Z',
  durationMs: 330000,
  provider: 'claude-code',
  exitCode: 0,
  providerSessionId: 'claude-sess-xyz',
  tokenUsage: {
    inputTokens: 12500,
    outputTokens: 3200,
    cacheReadTokens: 8000,
    cacheWriteTokens: 1500,
  },
  costUsd: 0.42,
  conversationId: null,
  metadata: { trigger: 'summon', animaId: 'anm-3f7b2c1', writId: 'wrt-8a4c9e2' },
  output: '### Overall: PASS\n\n### Completeness\n...',  // final assistant message
}
```

When The Loom and The Roster are available, the session record can be enriched with anima provenance — a snapshot of the identity and composition at session time. This provenance is critical for experiment ethnography (understanding what an anima "was" when it produced a given output).

Enriched fields (contributed by the caller or a post-session enrichment step):

| Field | Source | Purpose |
|---|---|---|
| `animaId` | Roster / caller metadata | Which anima ran |
| `animaName` | Roster / caller metadata | Human-readable identity |
| `roles` | Roster | Roles the anima held at session time |
| `curriculumName` | Loom / manifest | Curriculum snapshot |
| `curriculumVersion` | Loom / manifest | Curriculum version for reproducibility |
| `temperamentName` | Loom / manifest | Temperament snapshot |
| `temperamentVersion` | Loom / manifest | Temperament version |
| `trigger` | Caller (clockworks / CLI) | What invoked the session |
| `workshop` | Caller (workspace resolver) | Workshop name |
| `workspaceKind` | Caller (workspace resolver) | guildhall / workshop-temp / workshop-managed |
| `writId` | Caller (clockworks) | Bound writ for traceability |
| `turnNumber` | Caller (conversation manager) | Position in a multi-turn conversation |

**Design question:** Should enrichment happen via (a) the caller passing structured metadata that The Animator promotes into indexed fields, or (b) a post-session enrichment step that reads the session record and augments it? Option (a) is simpler; option (b) keeps the Animator interface stable as the enrichment set grows. Both work with the current `metadata` bag — the difference is whether The Animator's Stacks schema gains named columns for these fields or whether they remain JSON-path-queried properties inside `metadata`.

---

## Transcripts

The Animator captures full session transcripts in a dedicated `transcripts` book, separate from the `sessions` book. This keeps the operational session records lean (small records, fast CDC) while making the full interaction history available for web UIs, operational logs, debugging, and research.

Each transcript record contains the complete NDJSON message stream from the session provider:

```typescript
interface TranscriptDoc {
  id: string                          // same as session id — 1:1 relationship
  messages: TranscriptMessage[]       // full NDJSON transcript
}

type TranscriptMessage = Record<string, unknown>
```

The transcript is written at session completion (step 4 in the animate lifecycle), alongside the session result. If the transcript write fails, the error is logged but does not propagate — same error handling contract as session recording.

The `output` field on the session record (the final assistant message text) is extracted from the transcript before storage. This gives programmatic consumers a fast path to the session's conclusion without parsing the full transcript.

### Data scale

Transcripts are typically 500KB–5MB per session. At ~60 sessions/day, this is ~30–300MB/day in the transcripts book. SQLite handles this comfortably — primary key lookups are microseconds regardless of row size. The transcripts book has no CDC handlers, so there is no amplification concern. Retention/archival is a future concern.

---

## Future: Tool-Equipped Sessions

When The Instrumentarium ships, The Animator gains the ability to launch sessions with an MCP tool server. Tool resolution is the Loom's responsibility — the Loom resolves role → permissions → tools and returns them on the `AnimaWeave`. The Animator receives the resolved tool set and handles MCP server lifecycle.

### Updated lifecycle

```
summon(request)
  │
  ├─ 1. Resolve The Loom
  ├─ 2. loom.weave({ role }) → AnimaWeave { systemPrompt, tools }
  │     (Loom resolves role → permissions, calls instrumentarium.resolve(),
  │      reads tool instructions, composes full system prompt)
  └─ 3. Delegate to animate()

animate(request)
  │
  ├─ 1. Generate session id
  ├─ 2. Write initial session record to The Stacks
  │
  ├─ 3. If context.tools is present, configure MCP server:
  │     - Register each tool from the resolved set
  │     - Each tool handler accesses guild infrastructure via guild() singleton
  │
  ├─ 4. Launch session provider (with MCP server attached)
  ├─ 5. Monitor process until exit
  ├─ 6. Record result to The Stacks
  └─ 7. Return SessionResult
```

The Animator does not call the Instrumentarium directly — it receives the tool set from the AnimaWeave. This keeps tool resolution and system prompt composition together in the Loom, where tool instructions can be woven into the prompt alongside the tools they describe.

### Updated `SessionProviderConfig`

```typescript
interface SessionProviderConfig {
  systemPrompt: string
  initialPrompt?: string
  /** Resolved tools to serve via MCP. */
  tools?: ToolDefinition[]
  model: string
  conversationId?: string
  cwd: string
  streaming?: boolean
  /** Environment variables for the session process. */
  environment?: Record<string, string>
}
```

The session provider interface gains an optional `tools` field. The provider configures the MCP server from the tool definitions. Providers that don't support MCP ignore it. The Animator handles MCP server lifecycle (start before launch, stop after exit).

---

## Future: Streaming Through the Tool Contract

The current CLI streaming path works via a stderr side-channel in the provider (see § CLI streaming behavior). This is pragmatic and works well for the `nsg summon` use case, but it has limitations:

- The CLI has no control over formatting or filtering of streamed output — it's raw provider text on stderr.
- MCP callers cannot receive streaming output at all — the tool contract returns a single value.
- Callers that want to interleave chunk types (text, tool_use, tool_result) with their own UI cannot — the stderr stream is unstructured text.

The Animator already supports structured streaming internally: `animate({ streaming: true })` returns an `AnimateHandle` whose `chunks` async iterable yields typed `SessionChunk` objects in real time. The gap is that the tool system has no way to expose this to callers.

### Design sketch

Extend `ToolDefinition.handler` to support an `AsyncIterable` return type:

```typescript
// Current
handler: (params: T) => unknown | Promise<unknown>

// Extended
handler: (params: T) => unknown | Promise<unknown> | AsyncIterable<unknown>
```

Each caller adapts the iterable to its transport:

- **CLI** — detects `AsyncIterable`, writes chunks to stdout as they arrive (e.g. text chunks as plain text, tool_use/tool_result as structured lines). Prints the final summary after iteration completes.
- **MCP** — maps the iterable to MCP's streaming response model (SSE or streaming content blocks, depending on MCP protocol version).
- **Engines** — consume the iterable directly for programmatic streaming.

The `summon` tool handler would change from:

```typescript
const { result } = animator.summon({ prompt, role, cwd });
const session = await result;
return { id: session.id, status: session.status, ... };
```

To:

```typescript
const { chunks, result } = animator.summon({ prompt, role, cwd, streaming: true });
yield* chunks;           // stream output to caller
const session = await result;
return { id: session.id, status: session.status, ... };
```

(Using an async generator handler, or a dedicated streaming return wrapper — exact syntax TBD.)

### What this enables

- CLI users see formatted, filterable streaming output on stdout instead of raw stderr.
- MCP clients (e.g. IDE extensions, web UIs) receive real-time session output through the standard tool response channel.
- The stderr side-channel in the provider becomes unnecessary — streaming is a first-class concern of the tool contract.

### Dependencies

- Tool contract change (`ToolDefinition` in tools-apparatus)
- CLI adapter for async iterable tool returns
- MCP server adapter for streaming tool responses
- Decision: should the streaming return include both chunks and a final summary, or just chunks (with the summary as the last chunk)?

Blocked on: tool contract design discussion, MCP streaming support.

=== FILE: docs/architecture/apparatus/clerk.md ===
# The Clerk — API Contract

Status: **Draft**

Package: `@shardworks/clerk-apparatus` · Plugin id: `clerk`

> **⚠️ MVP scope.** The first implementation covers flat mandate writs with patron-triggered dispatch. No writ hierarchy, no Clockworks integration. Future sections describe where this apparatus is headed once the Clockworks and rigging system exist.

---

## Purpose

The Clerk is the guild's obligation authority. It receives commissions from the patron, issues writs that formally record what is owed, manages the lifecycle of those writs through to completion or failure, and maintains the Ledger — the guild's book of work.

The Clerk owns the boundary between "what is asked for" and "how it gets done." A commission arrives; the Clerk creates a mandate writ. When work completes, the Clerk records the outcome. Connecting writs to sessions is the job of the dispatch layer — currently [The Dispatch](dispatch.md), eventually the full rigging system (Spider, Executor, Fabricator). The Clerk tracks the obligation, not the execution.

The Clerk does **not** execute work. It does not launch sessions, manage rigs, or orchestrate engines. It tracks obligations: what has been commissioned, what state each obligation is in, and whether the guild has fulfilled its commitments. When the Clockworks and rigging system exist, the Clerk will integrate with them via lifecycle events and signals.

---

## Dependencies

```
requires: ['stacks']
```

- **The Stacks** (required) — persists writs in the `writs` book. All writ state lives here.

---

## Kit Interface

The Clerk does not consume kit contributions. No `consumes` declaration.

Kits that need to create or manage writs do so through the Clerk's tools or programmatic API, not through kit contribution fields. Writ creation is an operational act (with validation and lifecycle rules), not a declarative registration.

---

## Support Kit

```typescript
supportKit: {
  books: {
    writs: {
      indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
    },
  },
  tools: [
    commissionPost,
    writShow,
    writList,
    writAccept,
    writComplete,
    writFail,
    writCancel,
  ],
},
```

### `commission-post` tool

Post a new commission. Creates a mandate writ in `ready` status.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | `string` | yes | Short description of the work |
| `body` | `string` | yes | Full spec — what to do, acceptance criteria, context |
| `codex` | `string` | no | Target codex name |
| `type` | `string` | no | Writ type (default: `"mandate"`) |

Returns the created `WritDoc`.

Permission: `clerk:write`

### `writ-show` tool

Read a writ by id. Returns the full `WritDoc` including status history.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |

Permission: `clerk:read`

### `writ-list` tool

List writs with optional filters. Returns writs ordered by `createdAt` descending.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | `WritStatus` | no | Filter by status |
| `type` | `string` | no | Filter by writ type |
| `limit` | `number` | no | Max results (default: 20) |

Permission: `clerk:read`

### `writ-accept` tool

Claim a writ. Transitions `ready → active`. Sets `acceptedAt`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |

Permission: `clerk:write`

### `writ-complete` tool

Mark a writ as successfully completed. Transitions `active → completed`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |
| `resolution` | `string` | yes | What was done — summary of the work delivered |

Permission: `clerk:write`

### `writ-fail` tool

Mark a writ as failed. Transitions `active → failed`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |
| `resolution` | `string` | yes | Why the work failed |

Permission: `clerk:write`

### `writ-cancel` tool

Cancel a writ. Transitions `ready|active → cancelled`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |
| `resolution` | `string` | no | Why the writ was cancelled |

Permission: `clerk:write`

---

## `ClerkApi` Interface (`provides`)

```typescript
interface ClerkApi {
  // ── Commission Intake ─────────────────────────────────────────

  /**
   * Post a commission — create a mandate writ in ready status.
   *
   * This is the primary entry point for patron-originated work.
   * Creates a WritDoc and persists it to the writs book.
   */
  post(request: PostCommissionRequest): Promise<WritDoc>

  // ── Writ Queries ──────────────────────────────────────────────

  /** Read a single writ by id. Throws if not found. */
  show(id: string): Promise<WritDoc>

  /** List writs with optional filters. */
  list(filters?: WritFilters): Promise<WritDoc[]>

  /** Count writs matching filters. */
  count(filters?: WritFilters): Promise<number>

  // ── Writ Lifecycle ────────────────────────────────────────────

  /**
   * Transition a writ to a new status.
   *
   * Enforces the status machine — invalid transitions throw.
   * Updates the writ document and sets timestamp fields.
   *
   * Valid transitions:
   *   ready → active
   *   active → completed
   *   active → failed
   *   ready|active → cancelled
   *
   * The `fields` parameter allows setting additional fields
   * atomically with the transition (e.g. `resolution`).
   */
  transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>
}
```

### Supporting Types

```typescript
interface WritDoc {
  /** Unique writ id (prefixed, sortable: `w-{base36_timestamp}{hex_random}`). */
  id: string
  /** Writ type — guild vocabulary. e.g. "mandate", "task", "bug". */
  type: string
  /** Current status. */
  status: WritStatus
  /** Short description. */
  title: string
  /** Full spec — what to do, acceptance criteria, context. */
  body: string
  /** Target codex name, if applicable. */
  codex?: string

  // ── Timestamps ──────────────────────────────────────────────

  /** When the writ was created. */
  createdAt: string
  /** When the writ was last modified. */
  updatedAt: string
  /** When status moved to active (accepted). */
  acceptedAt?: string
  /** When terminal status was reached. */
  resolvedAt?: string

  // ── Resolution ───────────────────────────────────────────────

  /** Summary of how the writ resolved. Set on any terminal transition.
   *  What was done (completed), why it failed (failed), or why it
   *  was cancelled (cancelled). The `status` field distinguishes which. */
  resolution?: string
}

type WritStatus =
  | "ready"       // Posted, awaiting acceptance or dispatch
  | "active"      // Claimed by an anima, work in progress
  | "completed"   // Work done successfully
  | "failed"      // Work failed
  | "cancelled"   // Cancelled by patron or system

interface PostCommissionRequest {
  title: string
  body: string
  codex?: string
  type?: string       // default: "mandate"
}

interface WritFilters {
  status?: WritStatus
  type?: string
  limit?: number
  offset?: number
}
```

---

## Configuration

All Clerk configuration lives under the `clerk` key in `guild.json`. The Clerk uses [module augmentation](../plugins.md#typed-config-via-module-augmentation-recommended) to extend `GuildConfig`, so config is accessed via `guild().guildConfig().clerk` with full type safety — no manual cast needed.

```json
{
  "clerk": {
    "writTypes": [
      { "name": "mandate" },
      { "name": "task", "description": "A concrete unit of implementation work" },
      { "name": "bug", "description": "A defect to investigate and fix" }
    ],
    "defaultType": "mandate"
  }
}
```

```typescript
interface ClerkConfig {
  writTypes?: WritTypeEntry[]
  defaultType?: string
}

interface WritTypeEntry {
  name: string
  description?: string
}

// Module augmentation — typed access via guild().guildConfig().clerk
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    clerk?: ClerkConfig
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `writTypes` | `WritTypeEntry[]` | `[]` | Additional writ type declarations. Each entry has a `name` and optional `description`. The built-in type `"mandate"` is always valid regardless of this list. |
| `defaultType` | `string` | `"mandate"` | Default type when `commission-post` is called without a type. |

Both fields are optional. A guild with no `clerk` config (or an empty one) gets only the built-in `mandate` type with `defaultType: "mandate"` — enough to post commissions with no configuration.

Writ types are the guild's vocabulary — not a framework-imposed hierarchy. A guild that does only implementation work might use only `mandate`. A guild with planning animas might add `task`, `step`, `bug`, `spike`. The Clerk validates that posted writs use a declared type but assigns no behavioral semantics to the type name — that meaning lives in role instructions and (when available) standing orders and engine designs.

---

## Status Machine

The writ status machine governs all transitions. The Clerk enforces this — invalid transitions throw.

```
            ┌──────────────┐
            │    ready     │──────────┐
            └──────┬───────┘          │
                   │                  │
              accept               cancel
                   │                  │
                   ▼                  │
            ┌──────────────┐          │
            │    active    │──────┐   │
            └──┬───────┬───┘      │   │
               │       │          │   │
          complete    fail     cancel  │
               │       │          │   │
               ▼       ▼          │   │
        ┌───────────┐ ┌────────┐  │   │
        │ completed │ │ failed │  │   │
        └───────────┘ └────────┘  │   │
                                  │   │
              ┌───────────┐       │   │
              │ cancelled │◀──────┘   │
              │           │◀──────────┘
              └───────────┘
```

Terminal statuses: `completed`, `failed`, `cancelled`. No transitions out of terminal states.

### [Future] The `pending` status

When writ hierarchy is implemented, a parent writ transitions to `pending` when it has active children and is not directly actionable itself. `pending` is not a terminal state — when all children complete, the parent can transition to `completed`. If any child fails, the parent can transition to `failed`.

```
ready → pending    (when children are created via decompose())
pending → completed  (when all children complete — may be automatic)
pending → failed     (when a child fails — patron decides)
pending → cancelled
```

---

## Commission Intake Pipeline

Commission intake is a single synchronous step:

```
├─ 1. Patron calls commission-post (or ClerkApi.post())
├─ 2. Clerk validates input, generates ULID, creates WritDoc
├─ 3. Clerk writes WritDoc to writs book (status: ready)
└─ 4. Returns WritDoc to caller
```

One commission = one mandate writ. No planning, no decomposition. Dispatch is handled by [The Dispatch](dispatch.md) — a separate apparatus that reads ready writs and runs them through the guild's session machinery.

---

## Future: Clockworks Integration

When the Clockworks apparatus exists, the Clerk gains event emission and reactive dispatch.

### Dependency Change

```
requires:   ['stacks']
recommends: ['clockworks']
```

The Clockworks becomes a recommended (not required) dependency. The Clerk checks for the Clockworks at emit time — not at startup — so it functions standalone. When the Clockworks is absent, event emission is silently skipped.

### Lifecycle Events

The Clerk emits events into the Clockworks event stream at each status transition. Event names use the writ's `type` as the namespace, matching the framework event catalog.

| Transition | Event | Payload |
|-----------|-------|---------|
| Commission posted | `commission.posted` | `{ writId, title, type, codex }` |
| Writ signaled ready | `{type}.ready` | `{ writId, title, type, codex }` |
| `ready → active` | `{type}.active` | `{ writId }` |
| `active → completed` | `{type}.completed` | `{ writId, resolution }` |
| `active → failed` | `{type}.failed` | `{ writId, resolution }` |
| `* → cancelled` | `{type}.cancelled` | `{ writId, resolution }` |

These events are what standing orders bind to. The canonical dispatch pattern:

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "mandate.ready", "summon": "artificer", "prompt": "Read your writ with writ-show and fulfill the commission. Writ id: {{writ.id}}" }
    ]
  }
}
```

### `signal()` Method

A new method on `ClerkApi`:

```typescript
/**
 * Signal that a writ is ready for dispatch.
 *
 * Emits `{type}.ready` into the Clockworks event stream.
 * In the full design, called after intake processing (Sage
 * decomposition, validation) completes. This is the signal
 * the Spider (or summon relay) listens for to begin execution.
 */
signal(id: string): Promise<void>
```

### Dispatch Integration

The Clerk integrates with the dispatch layer at two points:

**Outbound: Ready Signal.** When a writ is signaled ready, the Clockworks event stream carries it to standing orders. The summon relay (or the Spider, for rig-based execution) picks it up and begins work. The Clerk does not know or care which dispatch path handles the writ — it signals readiness; the guild's configuration determines the response.

**Inbound: Completion Signal.** When work completes (session ends, rig strikes), the completing apparatus calls `clerk.transition(id, 'completed', { outcome })`. For rig-based execution, the Spider calls this when it strikes a completed rig. For direct-summon execution, the anima calls `writ-complete` (which wraps `clerk.transition()`). Both paths converge on the same Clerk API.

### Intake with Planning

When Sage animas and the Clockworks are available, the intake pipeline gains a planning step:

```
├─ 1. Patron calls commission-post
├─ 2. Clerk creates mandate writ (status: ready)
├─ 3. Clerk emits commission.posted
├─ 4. Standing order on commission.posted summons a Sage
├─ 5. Sage reads the mandate, decomposes into child writs via decompose()
├─ 6. Clerk creates child writs (status: ready), sets parent to pending
├─ 7. Clerk emits {childType}.ready for each child
├─ 8. Standing orders on {childType}.ready dispatch workers
├─ 9. As children complete, Clerk rolls up status to parent
└─ 10. When all children complete, parent mandate → completed
```

The patron's experience doesn't change — they still call `commission-post`. The planning step is internal to the guild.

---

## Future: Writ Hierarchy

Writs form a tree. A mandate writ may be decomposed into child writs (tasks, steps, etc.) by a planning anima. The hierarchy enables:

- **Decomposition** — a broad commission broken into concrete tasks
- **Completion rollup** — parent completes when all children complete
- **Failure propagation** — parent awareness of child failures
- **Scope tracking** — the patron sees one mandate; the guild sees the tree

### Hierarchy Rules

- A writ may have zero or one parent.
- A writ may have zero or many children.
- Depth is not limited (but deep hierarchies are a design smell).
- Children inherit the parent's `codex` unless explicitly overridden.
- The parent's `childCount` is denormalized and maintained by the Clerk.

### Completion Rollup

When a child writ reaches a terminal status, the Clerk checks siblings:
- All children `completed` → parent auto-transitions to `completed`
- Any child `failed` → the Clerk emits `{parentType}.child-failed` but does NOT auto-fail the parent. The patron (or a standing order) decides whether to fail, retry, or cancel.
- Child `cancelled` → no automatic parent transition.

### `decompose()` Method

```typescript
/**
 * Create child writs under a parent.
 *
 * Used by planning animas (Sages) to decompose a mandate into
 * concrete tasks. Children inherit the parent's codex unless
 * overridden. The parent transitions to `pending` when it has
 * active children and is not directly actionable.
 */
decompose(parentId: string, children: CreateWritRequest[]): Promise<WritDoc[]>
```

---

## Open Questions

- **Should `commission-post` be a permissionless tool?** It represents patron authority — commissions come from outside the guild. But Coco (running inside a session) needs to call it. Current thinking: gate it with `clerk:write` and grant that to the steward role.

- **Writ type validation — strict or advisory?** The Clerk validates against `clerk.writTypes` in config. But this means adding a new type requires a config change. Alternative: accept any string, use the config list only for documentation/tooling hints. Current thinking: strict validation — the guild should know its own vocabulary.

---

## Implementation Notes

- Standalone apparatus package at `packages/plugins/clerk/`. Requires only the Stacks.
- `WritDoc.type` uses a guild-defined vocabulary, not a framework enum. The Clerk validates against `clerk.writTypes` in the apparatus config section but the framework imposes no meaning on the type name.
- Writ ids use the format `w-{base36_timestamp}{hex_random}` — sortable by creation time, unique without coordination. Not a formal ULID, but provides the same useful properties (temporal ordering, no coordination).
- The `transition()` method is the single choke point for all status changes. All tools and future integrations go through it. This is where validation, timestamp setting, and (future) event emission and hierarchy rollup happen.
- When the Clockworks is eventually added as a recommended dependency, resolve it at emit time via `guild().apparatus()`, not at startup — so the Clerk functions with or without it.

=== FILE: docs/architecture/apparatus/dispatch.md ===
# The Dispatch — API Contract

Status: **Draft**

Package: `@shardworks/dispatch-apparatus` · Plugin id: `dispatch`

> **⚠️ Temporary rigging.** This apparatus is a stand-in for the full rigging system (Spider, Fabricator, Executor). It provides a single dispatch tool that takes the oldest ready writ and runs it through the guild's existing machinery. When the full rigging system exists, this apparatus is retired and its responsibilities absorbed by the Spider and summon relay. Designed to be disposable.

---

## Purpose

The Dispatch is the guild's interim work runner. It bridges the gap between the Clerk (which tracks obligations) and the session machinery (which runs animas) — without the full rigging system.

It does one thing: find a ready writ and execute it. "Execute" means open a draft binding on the target codex, compose context for an anima via the Loom, launch a session via the Animator, and handle the aftermath (seal the draft, transition the writ). This is the minimum viable loop that turns a commission into delivered work.

The Dispatch does **not** decompose writs, manage engine chains, or run multiple steps. One writ, one session. If the session completes, the draft is sealed and the writ is completed. If it fails, the writ is failed. That's the whole lifecycle.

---

## Dependencies

```
requires: ['stacks', 'clerk', 'codexes', 'animator']
recommends: ['loom']
```

- **The Stacks** (required) — reads writs via the Clerk's book.
- **The Clerk** (required) — queries ready writs and transitions their status.
- **The Scriptorium** (required) — opens and seals draft bindings on the target codex.
- **The Animator** (required) — launches anima sessions. Uses `summon()` (high-level, Loom-composed) when the Loom is available, `animate()` (low-level) otherwise.
- **The Loom** (recommended) — composes session context (system prompt, tools, role instructions). Resolved at dispatch time via the Animator's `summon()`. Not a direct dependency of the Dispatch — it's the Animator that calls the Loom.

---

## Kit Interface

The Dispatch does not consume kit contributions. No `consumes` declaration.

---

## Support Kit

```typescript
supportKit: {
  tools: [dispatchNext],
},
```

### `dispatch-next` tool

Find the oldest ready writ and dispatch it. This is the primary entry point — callable from the CLI via `nsg dispatch-next` or programmatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `role` | `string` | no | Role to summon (default: `"artificer"`) |
| `dryRun` | `boolean` | no | If true, find and report the writ but don't dispatch |

Returns a dispatch summary: writ id, session id, outcome.

Permission: `dispatch:write`

Callable by: `cli` (patron-side operation, not an anima tool)

---

## `DispatchApi` Interface (`provides`)

```typescript
interface DispatchApi {
  /**
   * Find the oldest ready writ and execute it.
   *
   * The full dispatch lifecycle:
   *   1. Query the Clerk for the oldest ready writ
   *   2. Transition the writ to active
   *   3. Open a draft binding on the writ's codex (if specified)
   *   4. Summon an anima session with the writ context as prompt
   *   5. Wait for session completion
   *   6. On success: seal the draft, push, transition writ to completed
   *   7. On failure: abandon the draft, transition writ to failed
   *
   * Returns null if no ready writs exist.
   *
   * If the writ has no codex, steps 3/6/7 (draft lifecycle) are
   * skipped — the session runs in the guild home directory with
   * no codex binding.
   */
  next(request?: DispatchRequest): Promise<DispatchResult | null>
}

interface DispatchRequest {
  /** Role to summon. Default: 'artificer'. */
  role?: string
  /** If true, find and report the writ but don't dispatch. */
  dryRun?: boolean
}

interface DispatchResult {
  /** The writ that was dispatched. */
  writId: string
  /** The session id (from the Animator). Absent if dryRun. */
  sessionId?: string
  /** Terminal writ status after dispatch. Absent if dryRun. */
  outcome?: 'completed' | 'failed'
  /** Resolution text set on the writ. Absent if dryRun. */
  resolution?: string
  /** Whether this was a dry run. */
  dryRun: boolean
}
```

---

## Dispatch Lifecycle

```
dispatch.next({ role: 'artificer' })
│
├─ 1. Query Clerk: oldest writ where status = 'ready', ordered by createdAt asc
│     → if none found, return null
│
├─ 2. Clerk: transition writ ready → active
│
├─ 3. [if writ.codex] Scriptorium: openDraft({ codex: writ.codex })
│     → draftRecord (worktree path = session cwd)
│     → if no codex on writ, cwd = guild home
│
├─ 4. Animator: summon({
│       role,
│       prompt: <assembled from writ title + body>,
│       cwd: draftRecord.path (or guild home),
│       environment: {
│         GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
│       },
│       metadata: { writId: writ.id, trigger: 'dispatch' }
│     })
│     → { chunks, result }
│
├─ 5. Await result
│
├─ 6a. [success] Session completed normally
│      ├─ [if codex] Scriptorium: seal({ codex, branch: draft.branch })
│      ├─ [if codex] Scriptorium: push({ codex })
│      ├─ Clerk: transition writ active → completed
│      │    resolution = session result summary
│      └─ return DispatchResult { outcome: 'completed' }
│
└─ 6b. [failure] Session failed or errored
       ├─ [if codex] Scriptorium: abandonDraft({ codex, branch: draft.branch, force: true })
       ├─ Clerk: transition writ active → failed
       │    resolution = failure reason from session
       └─ return DispatchResult { outcome: 'failed' }
```

### Prompt Assembly

The dispatch prompt is assembled from the writ's fields. The anima receives enough context to understand its assignment and use the `writ-show` tool for full details:

```
You have been dispatched to fulfill a commission.

## Assignment

**Title:** {writ.title}

**Writ ID:** {writ.id}

{writ.body}
```

The prompt is intentionally minimal — the anima's curriculum and role instructions carry the craft knowledge. The Dispatch just delivers the assignment.

The Dispatch owns the writ transition — the anima does not call `writ-complete` or `writ-fail`. The Dispatch observes the session outcome and transitions the writ accordingly. This keeps writ lifecycle management out of the anima's instructions, which simplifies the prompt and avoids relying on animas to self-report correctly.

### Git Identity

The Dispatch sets per-writ git identity via the `environment` field on the summon request. The Loom provides role-level defaults (e.g. `GIT_AUTHOR_NAME=Artificer`, `GIT_AUTHOR_EMAIL=artificer@nexus.local`). The Dispatch overrides the email with the writ ID for per-commission attribution:

```typescript
environment: {
  GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
}
```

This produces commits authored by `Artificer <w-{writId}@nexus.local>`, enabling commit-level tracing back to the originating commission. The committer identity is left to the system default so that commit signatures remain verified on GitHub. The Animator merges these overrides with the Loom's defaults (request overrides weave) and passes the result to the session provider.

### Error Handling

- **No ready writs:** `next()` returns null. Not an error.
- **Draft open fails:** Writ transitions to `failed` with resolution describing the Scriptorium error. No session launched.
- **Session fails:** Draft abandoned, writ failed. The Animator already records the session result to the Stacks.
- **Seal fails (contention):** Writ transitions to `failed`. The draft is NOT abandoned — the inscriptions are preserved for manual recovery or re-dispatch. Resolution describes the seal failure.
- **Push fails:** Same as seal failure — writ failed, draft preserved.

---

## Configuration

No configuration. The Dispatch reads writs from the Clerk and uses default behaviors for all apparatus calls. The role is specified per dispatch via the tool parameter.

---

## Open Questions

- **Should dispatch-next accept a specific writ id?** The current design always picks the oldest ready writ. An `id` parameter would let the patron dispatch a specific commission. Probably useful — but adds complexity (what if the writ isn't ready? what if it doesn't exist?). Could add later.

---

## Future: Retirement

When the full rigging system (Spider, Fabricator, Executor) is implemented, the Dispatch apparatus is retired:

- The Spider takes over rig spawning and engine traversal
- The summon relay handles anima dispatch from standing orders
- The Fabricator resolves engine chains (draft-open → session → seal is just one possible chain)
- `dispatch-next` is replaced by the Clockworks processing `mandate.ready` events

The Dispatch is designed to be removable with zero impact on the Clerk, Scriptorium, Animator, or Loom. It is a consumer of their APIs, not a provider of anything they depend on.

---

## Implementation Notes

- Small apparatus — types, core dispatch logic, one tool, barrel. ~5 source files.
- The `next()` method is the entire API surface. No books, no state, no CDC. Pure orchestration.
- The Dispatch queries the Clerk's writs book via `clerk.list({ status: 'ready' })` with a limit of 1 and ordered by `createdAt` asc. The `['status', 'createdAt']` compound index on the writs book makes this efficient.
- Session `cwd` is the draft worktree path when a codex is specified, or the guild home directory otherwise.
- The prompt template is hardcoded in the apparatus, not configurable. This is disposable infrastructure — configurability is wasted investment.

=== FILE: docs/architecture/apparatus/fabricator.md ===
# The Fabricator — API Contract

Status: **Draft — MVP**

Package: `@shardworks/fabricator-apparatus` · Plugin id: `fabricator`

> **⚠️ MVP scope.** The first implementation is an engine design registry with kit scanning and a single lookup method. No capability resolution, no need-based queries, no chain composition. The Fabricator earns those features when dynamic rig extension arrives.

---

## Purpose

The Fabricator is the guild's capability catalog. It holds engine design specifications and serves them to the Spider on demand. When the Spider needs to run an engine, it asks the Fabricator for the design by ID — the Fabricator resolves it, the Spider runs it.

The Fabricator does **not** execute engines. It does not touch rigs, manage sessions, or interact with the Clerk. It is a pure query service: designs in, designs out.

---

## Dependencies

```
requires: []
consumes: ['engines']    — scans kit and supportKit contributions for engine designs
```

---

## Engine Design Contract

The `@shardworks/fabricator-apparatus` package is the canonical home for the `EngineDesign` interface. Kit authors and apparatus that contribute engines import from this package:

```typescript
import type { EngineDesign, EngineRunContext, EngineRunResult } from '@shardworks/fabricator-apparatus'
```

### `EngineDesign`

```typescript
interface EngineDesign {
  /** Unique identifier for this engine design (e.g. 'draft', 'implement', 'review'). */
  id: string

  /**
   * Execute this engine.
   *
   * Returns 'completed' with yields (synchronous work done inline), or
   * 'launched' with a sessionId (async work the Spider polls for).
   * The Spider inspects the result shape — no need to declare the kind up front.
   *
   * @param givens — the engine's declared inputs, assembled by the Spider.
   *   A mix of values from the givensSpec (set at rig spawn time, e.g. role,
   *   buildCommand, writ) and upstream yields (resolved from completed engines,
   *   e.g. draft worktree path). The engine doesn't know or care about
   *   provenance — all values arrive the same way.
   *
   * @param context — minimal execution context. The engine id and an escape hatch
   *   (`upstream`) containing all upstream yields keyed by engine id.
   *
   * Engines pull their own apparatus dependencies via guild().apparatus(...) —
   * same pattern as tool handlers.
   */
  run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>
}
```

### `EngineRunContext`

```typescript
interface EngineRunContext {
  /** Simple string identity for this engine instance (e.g. 'draft', 'implement'). */
  engineId: string
  /** All upstream yields, keyed by engine id. Escape hatch for engines that need to inspect the full upstream chain. */
  upstream: Record<string, unknown>
}
```

### `EngineRunResult`

```typescript
type EngineRunResult =
  | { status: 'completed'; yields: unknown }    // clockwork: done, here are the yields
  | { status: 'launched'; sessionId: string }    // quick: session launched, Spider will poll
```

---

## Kit Contribution

Kits contribute engine designs via an `engines` field:

```typescript
export default {
  kit: {
    requires: ['fabricator'],
    engines: {
      draft:     draftEngine,
      implement: implementEngine,
      review:    reviewEngine,
    },
  },
} satisfies Plugin
```

Each value is an `EngineDesign`. The Fabricator scans these contributions reactively via `plugin:initialized` at startup — the same pattern the Instrumentarium uses for tools. See the [Instrumentarium spec](instrumentarium.md) for the reference implementation of kit-contribution scanning.

---

## Support Kit

None. No books, no tools. The Fabricator is a pure in-memory registry.

---

## `FabricatorApi` Interface (`provides`)

```typescript
interface FabricatorApi {
  /**
   * Look up an engine design by ID.
   * Returns the design if registered, undefined otherwise.
   */
  getEngineDesign(id: string): EngineDesign | undefined
}
```

---

## Configuration

None. No `guild.json` entry needed.

---

## Implementation Notes

- The implementation is small: a `Map<string, EngineDesign>` populated by scanning kit contributions at startup, and a single `get` method. Ship it as a standalone package (`@shardworks/fabricator-apparatus`) to establish the dependency boundary and to own the `EngineDesign` type exports.
- The Instrumentarium's kit-scanning lifecycle is the model to follow — reactive consumption of `plugin:initialized` events, collecting contributions into an internal registry.

---

## Future

The Fabricator is deliberately thin. Its planned evolution:

**Capability resolution.** When dynamic rig extension arrives, the API grows:

```typescript
interface FabricatorApi {
  // ... existing methods ...

  /**
   * Resolve a declared need to an engine chain.
   * Searches installed engine designs for those that satisfy the need,
   * composes them into an ordered chain, and returns the chain for the
   * Spider to graft onto the rig.
   */
  resolve(need: string, context?: ResolutionContext): EngineChain | null
}
```

The Fabricator is also the Sage's entry point: planning animas query it to introspect what the guild can build before decomposing a commission into writs. A standalone Fabricator (rather than capability resolution buried inside the Spider) is what makes this possible — it's a shared service both the Spider and the Sage can call.

**Unified capability catalog.** The Fabricator may absorb tool designs from the Instrumentarium, becoming the single answer to "what can this guild do?" regardless of whether the answer is an engine or a tool.

=== FILE: docs/architecture/apparatus/review-loop.md ===
# The Review Loop — Design Spec

Status: **Design** (not yet implemented)

> **Not a traditional apparatus.** The review loop does not have a `start()`/`stop()` lifecycle or a persistent runtime API. It is a composition pattern — a pair of engine designs and a rig structure — that lives at the intersection of the Spider, the Executor, and the Dispatch apparatus. This document specifies the full design, including an MVP path that works before the Spider exists.

---

## Purpose

The review loop moves quality assurance inside the rig. Instead of dispatching a commission once and surfacing the result to the patron regardless of quality, the rig runs an implementation pass, evaluates the result against concrete criteria, and — if the criteria are not met — runs a revision pass. The patron receives work only after it has cleared at least one automated review gate, or after the loop has exhausted its retry budget.

This is not a general-purpose test harness. The review loop does one thing: catch the most common and cheapest-to-detect failure modes before they become patron problems.

**What the review loop is not:**
- A replacement for spec quality. A bad spec produces bad work; the review loop helps only when the anima had the information to succeed but failed in execution.
- A Clockworks-dependent system. The loop runs entirely within the dispatch pipeline using existing apparatus.
- A complete quality gate. The MVP catches mechanical failures; richer review criteria are future scope.

---

## Empirical Motivation

Commission log X013 (`experiments/data/commission-log.yaml`) through 2026-04-02 shows the following outcome distribution across patron-tracked commissions with known outcomes:

| Outcome | Count | Notes |
|---------|-------|-------|
| success | 7 | Includes 1 with revision_required=true (partial attribution issue) |
| partial | 2 | Required follow-up commissions |
| abandoned | 3 | Two were test/infra noise; one was execution_error |
| cancelled | 1 | Process failure, not work failure |

Of the real work failures, the two most common causes were:
1. **Uncommitted changes** — anima produced correct work but did not commit before session end. Mechanically detectable.
2. **Partial execution** — anima completed some of the spec but missed a subsystem (e.g. missed a test file, broke a build). Partially detectable via build/test runs.

Both are catchable with cheap, mechanical review criteria. Neither requires an LLM judge. This is the MVP's target.

---

## Design Decision: Where Does the Loop Live?

Three candidate locations were considered:

### Option A: Dispatch-level wrapper (MVP path)

The Dispatch apparatus (`dispatch-next`) runs the implementation session, then runs a review pass, then optionally a revision session — all within a single dispatch call. No new apparatus; no Spider dependency.

**Pros:** Implementable now. Works with existing infrastructure. Dispatch is already the single entry point for writ execution.

**Cons:** The Dispatch is temporary infrastructure, scheduled for retirement when the Spider is implemented. Any logic added to Dispatch must be migrated. Also, the dispatch-level wrapper can only retry the entire session; it cannot retry a subcomponent.

### Option B: Review engine in every rig (full design)

The Spider seeds every rig with an `implement → review → [revise → review]*N` chain by default. The review engine is a clockwork engine; the revise engine is a quick engine. Both are standard engine designs contributed by a kit.

**Pros:** Architecturally clean. Composes naturally with Spider's traversal. Reusable engine designs. No migration from Dispatch required — Dispatch simply dispatches, and the rig handles iteration.

**Cons:** Requires the Spider. Not implementable until the rigging system exists.

### Option C: Rig pattern via origination engine

The origination engine seeds rigs with review chains by default. Superficially similar to Option B, but the decision of whether to include a review loop is made at origination time, not by a default rig structure.

**Pros:** Gives origination agency over review strategy (some work may not need review; some may need richer review).

**Cons:** Complicates origination. Review is almost always appropriate; making it opt-in inverts the sensible default.

### Decision

**Adopt both Option A (MVP) and Option B (full design).**

The Dispatch-level wrapper is the MVP: implementable now, catches the known failure modes, produces data on review loop effectiveness. When the Spider is implemented, the review logic migrates to engine designs (Option B), and the Dispatch drops its review wrapping entirely. The rig pattern (Option C) governs per-commission review configuration as a future enhancement.

The two designs share the same review criteria and artifact schemas — the MVP is a direct precursor to the full design, not a throwaway.

---

## MVP: Dispatch-Level Review Loop

The Dispatch `next()` method gains an optional `review` configuration. When enabled, after the implementation session completes, the Dispatch runs a review pass and conditionally launches a revision session.

### Data Flow

```
dispatch.next({ role: 'artificer', review: { enabled: true, maxRetries: 2 } })
│
├─ 1. Claim oldest ready writ (existing Dispatch logic)
├─ 2. Open draft binding (existing)
├─ 3. Launch implementation session (existing)
├─ 4. Await session completion
│
├─ [loop: up to maxRetries times]
│   ├─ 5. Run review pass against worktree
│   │      → ReviewResult { passed: boolean, failures: ReviewFailure[] }
│   │
│   ├─ [if passed] → break loop, proceed to seal
│   │
│   └─ [if failed]
│       ├─ 6. Write review artifact to commission data dir
│       ├─ 7. Launch revision session
│       │      context: original writ + review failures + git status/diff
│       └─ 8. Await revision session completion
│
├─ [if loop exhausted without passing]
│   ├─ 9. Write escalation artifact
│   ├─ 10. Abandon draft
│   └─ 11. Fail writ with resolution: "Review loop exhausted after N retries. See review artifacts."
│
└─ [if passed] → seal, push, complete writ (existing logic)
```

### Review Pass

The review pass is a synchronous, in-process check — not an anima session. It runs directly against the worktree. For MVP, three checks:

**Check 1: Uncommitted changes** (always enabled)

```
git -C <worktree> status --porcelain
```

Fails if output is non-empty. This catches the most common failure mode: the anima did the work but did not commit. Cheap, fast, definitive.

**Check 2: Build** (enabled if `guild.json` declares `review.buildCommand`)

```
<buildCommand> run in worktree
```

Fails if exit code is non-zero. Catches regressions introduced during implementation.

**Check 3: Tests** (enabled if `guild.json` declares `review.testCommand`)

```
<testCommand> run in worktree
```

Fails if exit code is non-zero. Captures stdout/stderr for inclusion in revision context.

Each check produces a `ReviewFailure`:

```typescript
interface ReviewFailure {
  check: 'uncommitted_changes' | 'build' | 'test'
  message: string        // human-readable summary
  detail?: string        // command output (truncated to 4KB)
}

interface ReviewResult {
  passed: boolean
  attempt: number        // 1-based: which attempt produced this result
  checks: ReviewCheck[]  // all checks run (pass or fail)
  failures: ReviewFailure[]
}

interface ReviewCheck {
  check: 'uncommitted_changes' | 'build' | 'test'
  passed: boolean
  durationMs: number
}
```

### Revision Context

When review fails, the revising anima receives a prompt assembled from:

1. **Original writ** — the full writ title and body (same as initial dispatch)
2. **Review failure report** — structured description of what checks failed and why
3. **Worktree state** — output of `git status` and `git diff HEAD` (if there are staged/unstaged changes)

The prompt template:

```
You have been dispatched to revise prior work on a commission.

## Assignment

**Title:** {writ.title}

**Writ ID:** {writ.id}

{writ.body}

---

## Review Findings (Attempt {attempt})

The previous implementation attempt did not pass automated review.
The following checks failed:

{for each failure}
### {check name}
{message}

{detail (if present)}
{end for}

---

## Current Worktree State

### git status
{git status output}

### git diff HEAD
{git diff HEAD output, truncated to 8KB}

---

Revise the work to address the review findings. Commit all changes before your session ends.
```

The revision session runs in the same worktree as the original implementation. It can see the prior work and build on it, not start from scratch.

### Iteration Cap

`maxRetries` defaults to 2. This means at most 3 sessions per writ: 1 implementation + 2 revisions. The cap is hard — the Dispatch does not exceed it regardless of review outcome.

Rationale: a third failed attempt almost always indicates a spec problem, an environment problem, or a complexity overrun — none of which another revision pass will fix. Escalating to the patron is the right call.

### Escalation

When the loop exhausts its retry budget without passing review:

1. The draft is abandoned (preserving the inscriptions for patron inspection)
2. The writ is transitioned to `failed`
3. The writ resolution is set to: `"Review loop exhausted after {N} retries. See review artifacts in commission data directory."`
4. All review artifacts are preserved (see Artifact Schema below)

The patron can inspect the artifacts, diagnose the failure mode, and either rewrite the spec or manually review the worktree before re-dispatching.

---

## Full Design: Review Engines in the Rig

When the Spider is implemented, the review loop migrates from Dispatch into the rig as two engine designs. The Dispatch drops all review logic.

### Engine Designs

#### `review` engine (clockwork)

**Design:**
```typescript
{
  id: 'review',
  kind: 'clockwork',
  inputs: ['writId', 'worktreePath', 'attempt'],
  outputs: ['reviewResult'],
  config: {
    checks: ['uncommitted_changes', 'build', 'test'],
    buildCommand: string | undefined,
    testCommand: string | undefined,
  }
}
```

The review engine runs the same three checks as the MVP. It writes a `ReviewResult` to its yield. It does not branch — it always completes, passing the result downstream.

The downstream engine (either a `seal` engine or a `revise` engine) reads `reviewResult.passed` to decide what to do. The Spider sees a completed engine regardless of outcome; the branching logic lives in the rig structure (see Rig Pattern below).

#### `revise` engine (quick)

**Design:**
```typescript
{
  id: 'revise',
  kind: 'quick',
  inputs: ['writId', 'worktreePath', 'reviewResult', 'attempt'],
  outputs: ['sessionResult'],
  role: 'artificer',
}
```

The revise engine assembles the revision prompt (same template as MVP) and launches an anima session. The session runs in the existing worktree — it does not open a new draft.

### Rig Pattern

The default rig for a commission with review enabled:

```
                ┌──────────────┐
                │  implement   │  (quick engine: artificer)
                │    engine    │
                └──────┬───────┘
                       │ yield: sessionResult
                       ▼
                ┌──────────────┐
                │    review    │  (clockwork engine)
                │   engine 1  │
                └──────┬───────┘
                       │ yield: reviewResult
          ┌────────────┴────────────┐
          │ passed                  │ failed (attempt < maxRetries)
          ▼                         ▼
   ┌─────────────┐         ┌──────────────────┐
   │    seal     │         │     revise       │  (quick engine: artificer)
   │   engine    │         │     engine 1     │
   └─────────────┘         └────────┬─────────┘
                                    │ yield: sessionResult
                                    ▼
                           ┌──────────────────┐
                           │     review       │  (clockwork engine)
                           │    engine 2      │
                           └────────┬─────────┘
                                    │ yield: reviewResult
                       ┌────────────┴────────────┐
                       │ passed                  │ failed
                       ▼                         ▼
                ┌─────────────┐         ┌──────────────────┐
                │    seal     │         │    escalate      │  (clockwork engine)
                │   engine    │         │    engine        │
                └─────────────┘         └──────────────────┘
```

The Spider traverses this graph naturally. Each engine completes and propagates its yield; downstream engines activate when their upstream is complete. The conditional branching (pass → seal, fail → revise) is expressed in the rig structure, not in Spider logic — the Spider just runs whatever is ready.

**Seeding the rig:** The origination engine produces this graph when it seeds the rig. For `maxRetries=2`, the origination engine seeds a fixed graph (not dynamically extended). If the guild wants `maxRetries=0` (no review loop), origination seeds the simple `implement → seal` graph.

**Dynamic extension (future):** A more sophisticated design would have the review engine declare a `need: 'revision'` when it fails, and the Fabricator would resolve and graft the next revise+review pair. This avoids pre-seeding the full graph and enables arbitrary retry depths. This is Future scope — the fixed graph is sufficient for MVP and avoids Spider complexity in the initial rigging implementation.

### Spider Integration

The Spider needs no changes to support the review loop. It already:
- Traverses all engines whose upstream is complete
- Dispatches ready engines to the Executor
- Handles both clockwork and quick engine kinds

The review loop is just a graph shape that Spider happens to traverse. The `escalate` clockwork engine signals the Clerk with a `failed` transition; the `seal` clockwork engine signals completion. The Spider itself is agnostic.

---

## Review Criteria Reference

### MVP Criteria (Mechanical)

| Check | Description | Detection Method | Cost |
|-------|-------------|-----------------|------|
| `uncommitted_changes` | All work is committed | `git status --porcelain` | < 100ms |
| `build` | Build command exits cleanly | Run configured build command | Varies |
| `test` | Test suite passes | Run configured test command | Varies |

The `uncommitted_changes` check is always enabled. Build and test checks are opt-in via guild configuration.

### Future Criteria (Judgment-Required)

These are not in scope for MVP but are the natural next layer:

| Check | Description | Detection Method | Cost |
|-------|-------------|-----------------|------|
| `spec_coverage` | Diff addresses spec requirements | LLM-as-judge pass on (spec, diff) | Medium |
| `no_regressions` | No tests were deleted or disabled | Diff analysis | Low |
| `type_check` | TypeScript compilation passes | `tsc --noEmit` | Varies |
| `lint` | Linter passes | Run configured lint command | Varies |

The LLM-as-judge `spec_coverage` check is the most valuable future criterion — it catches the "anima only addressed part of the spec" failure mode that mechanical checks miss. It requires a separate quick engine with access to the writ body and the diff, and a structured prompt asking whether the diff achieves the spec's stated goals.

---

## Artifact Schema

Every review pass writes an artifact. Artifacts live in the commission data directory alongside the existing artifacts written by the Laboratory.

### Location

```
experiments/data/commissions/<writ-id>/
  commission.md          (existing — writ body)
  review.md              (existing template — patron review slot)
  review-loop/
    attempt-1/
      review.md          (ReviewResult as structured markdown)
      git-status.txt     (git status output)
      git-diff.txt       (git diff HEAD output)
    attempt-2/
      review.md
      git-status.txt
      git-diff.txt
    escalation.md        (if loop exhausted; patron-facing summary)
```

For the MVP (Dispatch-level), the Dispatch writes these artifacts directly. For the full design (Spider-level), the review engine writes them via the Stacks or directly to the commission data directory.

### `review.md` Schema

```markdown
# Review — Attempt {N}

**Writ:** {writId}
**Timestamp:** {ISO 8601}
**Result:** PASSED | FAILED

## Checks

| Check | Result | Duration |
|-------|--------|----------|
| uncommitted_changes | ✓ PASS / ✗ FAIL | {ms}ms |
| build | ✓ PASS / ✗ FAIL | {ms}ms |
| test | ✓ PASS / ✗ FAIL | {ms}ms |

## Failures

{for each failure}
### {check}
{message}

```
{detail}
```
{end for}
```

### `escalation.md` Schema

```markdown
# Review Loop Escalated

**Writ:** {writId}
**Title:** {writ.title}
**Attempts:** {N}
**Timestamp:** {ISO 8601}

The review loop exhausted its retry budget ({maxRetries} retries) without
achieving a passing review. The draft has been abandoned.

## Summary of Failures

{for each attempt}
### Attempt {N}
{list of failed checks with messages}
{end for}

## Recommended Actions

- Inspect the worktree state preserved in the draft artifacts
- Review the git-diff.txt files in each attempt directory
- Revise the spec to address the observed failure mode before re-dispatching
```

---

## Configuration

For the MVP (Dispatch-level), review configuration lives in `guild.json`:

```json
{
  "review": {
    "enabled": true,
    "maxRetries": 2,
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test"
  }
}
```

All fields are optional. `enabled` defaults to `false` for the MVP (opt-in). The intent is to make it default-on once the loop has been validated in practice.

For the full design (Spider-level), the same configuration is consumed by the origination engine to decide whether to seed the review graph and what configuration to pass to the review engine.

---

## Observability

The review loop is itself experiment data. Every iteration produces artifacts that the Laboratory can capture and analyze:

1. **Review artifacts** (`review-loop/attempt-N/`) — structured pass/fail evidence for each check. Enables quantitative analysis: which checks catch what failure modes? How often does the second attempt pass where the first failed?

2. **Session records** — revision sessions are recorded in the Animator's `sessions` book with `metadata.trigger: 'review-revision'` and `metadata.attempt: N`. Enables cost accounting: how much does the review loop add per commission?

3. **Writ resolution field** — when the loop escalates, the writ resolution includes the retry count. The commission log's `failure_mode` can be set to `review_exhausted` to distinguish review-loop failures from first-try failures.

4. **Commission log** — the `revision_required` field will more accurately reflect anima-driven revisions vs. patron-driven revisions once the review loop is active. The distinction becomes: `revision_required: true, revision_source: patron | review_loop`.

---

## Open Questions

These questions could not be resolved without patron input or empirical data from MVP deployment. Flag for patron review before implementation.

**Q1: Default-on or opt-in?**

The spec recommends opt-in for MVP (`enabled: false` default) to avoid surprises during initial deployment. However, opting-in per guild means the review loop doesn't run in experiments where it would produce the most useful data. Consider making it default-on from the start, with `enabled: false` as the escape hatch for commissions where review is inappropriate (e.g. spec-writing commissions like this one, where there's no build/test to run).

**Q2: Should revision sessions open new drafts or continue in the existing worktree?**

The current design continues in the existing worktree. This means revision builds on what the first attempt produced — which is usually correct (fix what's broken, don't start over). But it also means the revision session can see a messy worktree with uncommitted changes from the first attempt. Does the first attempt's work contaminate the revision? Or is seeing it in context (via `git diff`) actually helpful? No empirical evidence yet.

**Q3: What is the revision session's role?**

Should the revising anima be the same role as the implementing anima (e.g. `artificer`)? Or should the review loop summon a different role with explicit "you are reviewing and fixing prior work" instructions? The current spec defaults to the same role with a modified prompt. A distinct `revisor` role with specialized temperament could perform better. Needs a/b testing once the loop is running.

**Q4: Should the review pass happen before sealing, or is it implicitly "before sealing"?**

The current design places the review pass between the implementation session and the seal step. This means the draft is open during review. If the review pass runs the test suite, the test suite runs inside the worktree before sealing — which is correct. But it also means the worktree is mutable during review (in theory another process could write to it). Is this a problem in practice? Probably not for single-dispatch guilds, but worth noting.

**Q5: LLM-as-judge: when and how?**

The spec defers LLM-as-judge review to future scope, but it's the most valuable future criterion. Key unresolved questions: which model? What's the prompt structure? What's the acceptance threshold (0-10 score? binary pass/fail from the judge)? Who pays for the judge session — is it accounted separately from the commission cost? These need design work before the feature is useful.

**Q6: Should the review loop apply to spec-writing commissions?**

This commission is itself a spec-writing commission. There's no build command to run, no test suite to pass. The only mechanical check that applies is `uncommitted_changes`. Is that sufficient to warrant running the loop? Or should spec-writing commissions (like this one, with no target codex build) opt out of the loop by default? Consider: a charge type hint (`spec` vs. `implementation`) could guide the origination engine to include or exclude the review loop in the initial rig.

---

## Future Evolution

### Phase 1 (MVP — Dispatch-level)
- `uncommitted_changes` check always enabled
- `build` and `test` checks opt-in via `guild.json`
- `maxRetries: 2` hard cap
- Artifacts written to commission data directory
- Opt-in via `review.enabled: true` in `guild.json`

### Phase 2 (Spider-level engine designs)
- `review` clockwork engine contributed by a kit
- `revise` quick engine contributed by the same kit
- Origination engine seeds review graph by default
- Review configuration passed per-rig, not just per-guild

### Phase 3 (Richer review criteria)
- LLM-as-judge `spec_coverage` check
- `type_check` and `lint` checks
- Per-commission review configuration (charge type → review strategy)
- Distinct `revisor` role with specialized temperament

### Phase 4 (Dynamic extension)
- Review engine declares `need: 'revision'` on failure
- Fabricator resolves revision chain dynamically
- Arbitrary retry depth (or patron-configured per-commission)
- Review loop data feeds Surveyor codex profiles (this codex has a 60% first-try rate → seed richer review graph by default)

---

## Implementation Notes for MVP

The MVP requires changes to the Dispatch apparatus only:

1. **Add `ReviewConfig` to `DispatchRequest`** — optional field, all checks disabled by default
2. **Add `runReviewPass(worktreePath, config)` function** — pure function, no apparatus dependencies, runs git/build/test checks, returns `ReviewResult`
3. **Add `assembleRevisionPrompt(writ, reviewResult, worktreeState)` function** — pure function, returns string
4. **Extend `dispatch.next()` loop** — after implementation session, call `runReviewPass`; if failed and retries remain, launch revision session via `animator.summon()` with the revision prompt
5. **Write artifacts** — write `review-loop/attempt-N/review.md` and supporting files after each review pass. The commission data directory path is owned by the Laboratory; the Dispatch needs to know where it is, or the Laboratory's CDC hook writes these based on session metadata.

> **Artifact writing ownership:** The Laboratory currently auto-writes commission artifacts via CDC on session completion. It does not know about individual review passes within a dispatch. Two options: (a) Dispatch writes review artifacts directly to the commission data directory (requires Dispatch to know the Laboratory's path convention), or (b) review pass results are stored in the Stacks (a `review-passes` book) and the Laboratory's CDC picks them up. Option (b) is architecturally cleaner — the Stacks is the record of everything, and the Laboratory writes files from it. This is a detail for the implementing session to resolve.

The implementing session should also update the `DispatchResult` type to include `reviewAttempts?: number` and surface this in the dispatch summary.

=== FILE: docs/architecture/apparatus/scriptorium.md ===
# The Scriptorium — API Contract

Status: **Draft**

Package: `@shardworks/codexes-apparatus` · Plugin id: `codexes`

> **⚠️ MVP scope.** This spec covers codex registration, draft binding lifecycle, and sealing/push operations. Clockworks integration (events, standing orders) is future work — the Scriptorium will emit events when the Clockworks apparatus exists. The Surveyor's codex-awareness integration is also out of scope for now.

---

## Purpose

The Scriptorium manages the guild's codexes — the git repositories where the guild's inscriptions accumulate. It owns the registry of known codexes, maintains local bare clones for efficient access, opens and closes draft bindings (worktrees) for concurrent work, and handles the sealing lifecycle that incorporates drafts into the sealed binding.

The Scriptorium does **not** know what a codex contains or what work applies to it (that's the Surveyor's domain). It does **not** orchestrate which anima works in which draft (that's the caller's concern — rig engines, dispatch scripts, or direct human invocation). It is pure git infrastructure — repository lifecycle, draft isolation, and branch management.

### Vocabulary Mapping

The Scriptorium's tools use the [guild metaphor's binding vocabulary](../../guild-metaphor.md#binding-canonical). The mapping to git concepts:

| Metaphor | Git | Scriptorium API |
|----------|-----|-----------------|
| **Codex** | Repository | `add`, `list`, `show`, `remove`, `fetch` |
| **Draft binding** (draft) | Worktree + branch | `openDraft`, `listDrafts`, `abandonDraft` |
| **Sealed binding** | Default branch (e.g. `main`) | Target of `seal` |
| **Sealing** | Fast-forward merge (or rebase + ff) | `seal` |
| **Abandoning** | Remove worktree + branch | `abandonDraft` |
| **Inscription** | Commit | *(not managed by the Scriptorium — animas inscribe directly via git)* |

Use plain git terms (branch, commit, merge) in error messages and logs where precision matters; the binding vocabulary is for the tool-facing API and documentation.

---

## Dependencies

```
requires: ['stacks']
consumes: []
```

- **The Stacks** — persists the codex registry and draft tracking records. Configuration in `guild.json` is the source of truth for registered codexes; the Stacks tracks runtime state (active drafts, clone status).

---

## Kit Interface

The Scriptorium does not consume kit contributions. No `consumes` declaration.

---

## Support Kit

```typescript
supportKit: {
  tools: [
    codexAddTool,
    codexListTool,
    codexShowTool,
    codexRemoveTool,
    codexPushTool,
    draftOpenTool,
    draftListTool,
    draftAbandonTool,
    draftSealTool,
  ],
},
```

---

## `ScriptoriumApi` Interface (`provides`)

```typescript
interface ScriptoriumApi {
  // ── Codex Registry ──────────────────────────────────────────

  /**
   * Register an existing repository as a codex.
   * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the
   * entry to the `codexes` config section in `guild.json`.
   * Blocks until the clone completes.
   */
  add(name: string, remoteUrl: string): Promise<CodexRecord>

  /**
   * List all registered codexes with their status.
   */
  list(): Promise<CodexRecord[]>

  /**
   * Show details for a single codex, including active drafts.
   */
  show(name: string): Promise<CodexDetail>

  /**
   * Remove a codex from the guild. Abandons all active drafts,
   * removes the bare clone from `.nexus/codexes/`, and removes the
   * entry from `guild.json`. Does NOT delete the remote repository.
   */
  remove(name: string): Promise<void>

  /**
   * Fetch latest refs from the remote for a codex's bare clone.
   * Called automatically before draft creation and sealing; can
   * also be invoked manually.
   */
  fetch(name: string): Promise<void>

  /**
   * Push a branch to the codex's remote.
   * Pushes the specified branch (default: codex's default branch)
   * to the bare clone's configured remote. Does not force-push.
   */
  push(request: PushRequest): Promise<void>

  // ── Draft Binding Lifecycle ─────────────────────────────────

  /**
   * Open a draft binding on a codex.
   *
   * Creates a new git branch from `startPoint` (default: the codex's
   * sealed binding) and checks it out as an isolated worktree under
   * `.nexus/worktrees/<codex>/<branch>`. Fetches from the remote
   * before branching to ensure freshness.
   *
   * If `branch` is omitted, generates one automatically as `draft-<ulid>`.
   * Rejects with a clear error if a draft with the same branch name
   * already exists for this codex.
   */
  openDraft(request: OpenDraftRequest): Promise<DraftRecord>

  /**
   * List active drafts, optionally filtered by codex.
   */
  listDrafts(codexName?: string): Promise<DraftRecord[]>

  /**
   * Abandon a draft — remove the draft's worktree and git branch.
   * Fails if the draft has unsealed inscriptions unless `force: true`.
   * The inscriptions persist in the git reflog but the draft is no
   * longer active.
   */
  abandonDraft(request: AbandonDraftRequest): Promise<void>

  /**
   * Seal a draft — incorporate its inscriptions into the sealed binding.
   *
   * Git strategy: fast-forward merge only. If ff is not possible,
   * rebases the draft branch onto the target and retries. Retries up
   * to `maxRetries` times (default: from settings.maxMergeRetries)
   * to handle contention from concurrent sealing. Fails hard if the
   * rebase produces conflicts — no auto-resolution, no merge commits.
   *
   * On success, abandons the draft (unless `keepDraft: true`).
   */
  seal(request: SealRequest): Promise<SealResult>
}
```

### Supporting Types

```typescript
interface CodexRecord {
  /** Codex name — unique within the guild. */
  name: string
  /** Remote repository URL. */
  remoteUrl: string
  /** Whether the bare clone exists and is healthy. */
  cloneStatus: 'ready' | 'cloning' | 'error'
  /** Number of active drafts for this codex. */
  activeDrafts: number
}

interface CodexDetail extends CodexRecord {
  /** Default branch name on the remote (e.g. 'main'). */
  defaultBranch: string
  /** Timestamp of last fetch. */
  lastFetched: string | null
  /** Active drafts for this codex. */
  drafts: DraftRecord[]
}

interface DraftRecord {
  /** Unique draft id (ULID). */
  id: string
  /** Codex this draft belongs to. */
  codexName: string
  /** Git branch name for this draft. */
  branch: string
  /** Absolute filesystem path to the draft's working directory (git worktree). */
  path: string
  /** When the draft was opened. */
  createdAt: string
  /** Optional association — e.g. a writ id. */
  associatedWith?: string
}

interface OpenDraftRequest {
  /** Codex to open the draft for. */
  codexName: string
  /** Branch name for the draft. If omitted, generates `draft-<ulid>`. */
  branch?: string
  /**
   * Starting point — branch, tag, or commit to branch from.
   * Default: remote HEAD (the codex's default branch).
   */
  startPoint?: string
  /** Optional association metadata (e.g. writ id). */
  associatedWith?: string
}

interface AbandonDraftRequest {
  /** Codex name. */
  codexName: string
  /** Git branch name of the draft to abandon. */
  branch: string
  /** Force abandonment even if the draft has unsealed inscriptions. */
  force?: boolean
}

interface SealRequest {
  /** Codex name. */
  codexName: string
  /** Git branch to seal (the draft's branch). */
  sourceBranch: string
  /** Target branch (the sealed binding). Default: codex's default branch. */
  targetBranch?: string
  /** Max rebase retry attempts under contention. Default: from settings.maxMergeRetries (3). */
  maxRetries?: number
  /** Keep the draft after successful sealing. Default: false. */
  keepDraft?: boolean
}

interface SealResult {
  /** Whether sealing succeeded. */
  success: boolean
  /** Strategy used: 'fast-forward' or 'rebase'. */
  strategy: 'fast-forward' | 'rebase'
  /** Number of retry attempts needed (0 = first try). */
  retries: number
  /** The commit SHA at head of target after sealing. */
  sealedCommit: string
  /** Number of inscriptions (commits) incorporated from the draft. 0 means no-op seal. */
  inscriptionsSealed: number
}

interface PushRequest {
  /** Codex name. */
  codexName: string
  /**
   * Branch to push. Default: codex's default branch.
   */
  branch?: string
}
```

---

## Configuration

The `codexes` key in `guild.json` has two sections: `settings` (apparatus-level configuration) and `registered` (the codex registry). Both can be edited by hand or through tools.

```json
{
  "codexes": {
    "settings": {
      "maxMergeRetries": 3,
      "draftRoot": ".nexus/worktrees"
    },
    "registered": {
      "nexus": {
        "remoteUrl": "git@github.com:shardworks/nexus.git"
      },
      "my-app": {
        "remoteUrl": "git@github.com:patron/my-app.git"
      }
    }
  }
}
```

### Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxMergeRetries` | `number` | `3` | Max rebase-retry attempts during sealing under contention. |
| `draftRoot` | `string` | `".nexus/worktrees"` | Directory where draft worktrees are created, relative to guild root. |

### Registered Codexes

Each key in `registered` is the codex name (unique within the guild). The value:

| Field | Type | Description |
|-------|------|-------------|
| `remoteUrl` | `string` | The remote URL of the codex's git repository. Used for cloning and fetching. |

The config is intentionally minimal — a human can add a codex by hand-editing `guild.json` and the Scriptorium will pick it up on next startup (cloning the bare repo if needed).

---

## Tool Definitions

### `codex-add`

Register an existing repository as a codex.

```typescript
tool({
  name: 'codex-add',
  description: 'Register an existing git repository as a guild codex',
  permission: 'write',
  params: {
    name: z.string().describe('Name for the codex (unique within the guild)'),
    remoteUrl: z.string().describe('Git remote URL of the repository'),
  },
  handler: async ({ name, remoteUrl }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.add(name, remoteUrl)
  },
})
```

### `codex-list`

List all registered codexes.

```typescript
tool({
  name: 'codex-list',
  description: 'List all codexes registered with the guild',
  permission: 'read',
  params: {},
  handler: async () => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.list()
  },
})
```

### `codex-show`

Show details of a specific codex including active drafts.

```typescript
tool({
  name: 'codex-show',
  description: 'Show details of a registered codex including active draft bindings',
  permission: 'read',
  params: {
    name: z.string().describe('Codex name'),
  },
  handler: async ({ name }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.show(name)
  },
})
```

### `codex-remove`

Remove a codex from the guild (does not delete the remote).

```typescript
tool({
  name: 'codex-remove',
  description: 'Remove a codex from the guild (does not affect the remote repository)',
  permission: 'delete',
  params: {
    name: z.string().describe('Codex name to remove'),
  },
  handler: async ({ name }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.remove(name)
  },
})
```

### `codex-push`

Push a branch to the codex's remote.

```typescript
tool({
  name: 'codex-push',
  description: 'Push a branch to the codex remote',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex name'),
    branch: z.string().optional().describe('Branch to push (default: codex default branch)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.push(params)
  },
})
```

### `draft-open`

Open a draft binding — create an isolated worktree for a codex.

```typescript
tool({
  name: 'draft-open',
  description: 'Open a draft binding on a codex (creates an isolated git worktree)',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex to open the draft for'),
    branch: z.string().optional().describe('Branch name for the draft (default: auto-generated draft-<ulid>)'),
    startPoint: z.string().optional().describe('Branch/tag/commit to start from (default: remote HEAD)'),
    associatedWith: z.string().optional().describe('Optional association (e.g. writ id)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.openDraft(params)
  },
})
```

### `draft-list`

List active draft bindings.

```typescript
tool({
  name: 'draft-list',
  description: 'List active draft bindings, optionally filtered by codex',
  permission: 'read',
  params: {
    codexName: z.string().optional().describe('Filter by codex name'),
  },
  handler: async ({ codexName }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.listDrafts(codexName)
  },
})
```

### `draft-abandon`

Abandon a draft binding.

```typescript
tool({
  name: 'draft-abandon',
  description: 'Abandon a draft binding (removes the git worktree and branch)',
  permission: 'delete',
  params: {
    codexName: z.string().describe('Codex name'),
    branch: z.string().describe('Branch of the draft to abandon'),
    force: z.boolean().optional().describe('Force abandonment even with unmerged changes'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.abandonDraft(params)
  },
})
```

### `draft-seal`

Seal a draft — merge its branch into the sealed binding.

```typescript
tool({
  name: 'draft-seal',
  description: 'Seal a draft binding into the codex (ff-only merge or rebase; no merge commits)',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex name'),
    sourceBranch: z.string().describe('Draft branch to seal'),
    targetBranch: z.string().optional().describe('Target branch (default: codex default branch)'),
    maxRetries: z.number().optional().describe('Max rebase retries under contention (default: 3)'),
    keepDraft: z.boolean().optional().describe('Keep draft after sealing (default: false)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.seal(params)
  },
})
```

---

## Session Integration

The Scriptorium and the Animator are **intentionally decoupled**. The Scriptorium manages git infrastructure; the Animator manages sessions. Neither knows about the other. They compose through a simple handoff: the `DraftRecord.path` returned by `openDraft()` is the `cwd` passed to the Animator's `summon()` or `animate()`.

### Composition pattern

The binding between a session and a draft is the caller's responsibility. The typical flow:

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
    ├─ 3. scriptorium.seal({ codexName, sourceBranch })
    │     → draft sealed into codex
    │
    └─ 4. scriptorium.push({ codexName })
          → sealed binding pushed to remote
```

The anima never touches draft lifecycle — it is launched *inside* the draft's working directory and inscribes there naturally. Infrastructure steps (open, seal, push) happen outside the session, ensuring they execute even if the session crashes or times out.

### The `DraftRecord` as handoff object

The `DraftRecord` carries everything the Animator needs:

- **`path`** — the session's `cwd`
- **`codexName`** — for session metadata (which codex this session worked on)
- **`branch`** — for session metadata (which draft)
- **`associatedWith`** — the writ id, if any (passed through to session metadata)

The Animator stores these as opaque metadata on the session record. The Scriptorium doesn't read session records; the Animator doesn't read draft records. They share data through the orchestrator that calls both.

### Why not tighter integration?

Animas cannot reliably manage their own draft lifecycle. A session's working directory is set at launch — the anima cannot relocate itself to a draft it opens mid-session. Even if it could (via absolute paths and `cd`), the failure modes are poor: crashed sessions leave orphaned drafts, forgotten seal steps leave inscriptions stranded, and every anima reimplements the same boilerplate. External orchestration is simpler and more reliable.

---

## Interim Dispatch Pattern

Before rig engines and the Clockworks exist, a shell script orchestrates the open → session → seal → push lifecycle. This is the recommended interim pattern:

```bash
#!/usr/bin/env bash
# dispatch-commission.sh — open a draft, run a session, seal and push
set -euo pipefail

CODEX="${1:?codex name required}"
ROLE="${2:?role required}"
PROMPT="${3:?prompt required}"

# 1. Open a draft binding (branch auto-generated)
DRAFT=$(nsg codex draft-open --codexName "$CODEX")

DRAFT_PATH=$(echo "$DRAFT" | jq -r '.path')
DRAFT_BRANCH=$(echo "$DRAFT" | jq -r '.branch')

# 2. Run the session in the draft
nsg summon \
  --role "$ROLE" \
  --cwd "$DRAFT_PATH" \
  --prompt "$PROMPT" \
  --metadata "{\"codex\": \"$CODEX\", \"branch\": \"$DRAFT_BRANCH\"}"

# 3. Seal the draft into the codex
nsg codex draft-seal \
  --codexName "$CODEX" \
  --sourceBranch "$DRAFT_BRANCH"

# 4. Push the sealed binding to the remote
nsg codex codex-push \
  --codexName "$CODEX"

echo "Commission sealed and pushed for $CODEX ($DRAFT_BRANCH)"
```

This script is intentionally simple — no error recovery, no retry logic beyond what `draft-seal` provides internally. A failed seal leaves the draft in place for manual inspection. A failed push leaves the sealed binding local — re-running `codex-push` is safe. The auto-generated branch name flows through the `DraftRecord` — the orchestrator never needs to invent one.

---

## Bare Clone Architecture

The Scriptorium maintains **bare clones** of each codex under `.nexus/codexes/<name>.git`. This is the local git infrastructure that makes draft operations fast and network-efficient.

```
.nexus/
  codexes/
    nexus.git/          ← bare clone of git@github.com:shardworks/nexus.git
    my-app.git/         ← bare clone of git@github.com:patron/my-app.git
  worktrees/
    nexus/
      writ-42/          ← draft: nexus, branch writ-42
      writ-57/          ← draft: nexus, branch writ-57
    my-app/
      writ-63/          ← draft: my-app, branch writ-63
```

### Why bare clones?

- **Single clone, many drafts.** A bare clone has no working tree of its own — it's just the git object database. Multiple draft worktrees can be created from it simultaneously without duplicating the repository data.
- **Network efficiency.** After the initial clone, updates are `git fetch` operations — fast, incremental, no full re-clone.
- **Transparent to animas.** An anima inscribing in a draft sees a normal git checkout. It doesn't know or care that the underlying repo is a bare clone. `git commit`, `git log`, `git diff` all work normally.
- **Clean separation.** The bare clone in `.nexus/codexes/` is infrastructure; the draft worktrees in `.nexus/worktrees/` are workspaces. Neither pollutes the guild's versioned content.

### Lifecycle

```
codex-add
  ├─ 1. Write entry to guild.json config
  ├─ 2. git clone --bare <remoteUrl> .nexus/codexes/<name>.git
  └─ 3. Record clone status in Stacks

draft-open
  ├─ 1. git fetch (in bare clone) — ensure refs are current
  ├─ 2. git worktree add .nexus/worktrees/<codex>/<branch> -b <branch> <startPoint>
  └─ 3. Record draft in Stacks

draft-seal
  ├─ 1. Fetch remote refs (git fetch --prune origin +refs/heads/*:refs/remotes/origin/*)
  │     → populates refs/remotes/origin/* without touching local sealed binding or draft branches
  ├─ 2. Advance local sealed binding if remote is ahead
  │     → if refs/remotes/origin/<target> is ahead of refs/heads/<target>: advance refs/heads/<target>
  │     → if local is ahead (unpushed seals): keep local — preserves inter-draft contention ordering
  ├─ 3. Attempt fast-forward merge
  │     └─ If ff not possible: rebase source onto target
  │        └─ If rebase conflicts: FAIL (no auto-resolution)
  │        └─ If rebase succeeds: retry ff (up to maxRetries)
  ├─ 4. Update target branch ref in bare clone
  └─ 5. Abandon draft (unless keepDraft)

codex-push
  ├─ 1. git push origin <branch> (from bare clone)
  └─ 2. Never force-push

codex-remove
  ├─ 1. Abandon all drafts for codex
  ├─ 2. Remove bare clone directory
  ├─ 3. Remove entry from guild.json
  └─ 4. Clean up Stacks records
```

### Sealing Strategy Detail

Sealing enforces **linear history** on the sealed binding — no merge commits, no force pushes. If a draft's inscriptions contradict the sealed binding (i.e. the sealed binding has advanced since the draft was opened), the sealing engine attempts to reconcile via rebase. If reconciliation fails, sealing seizes — the tool fails rather than creating non-linear history or silently resolving conflicts.

Git mechanics:

```
Seal Attempt:
  ├─ Try: git merge --ff-only <draft-branch> into <sealed-branch>
  │   ├─ Success → draft sealed
  │   └─ Fail (sealed binding has advanced) →
  │       ├─ Fetch latest sealed binding from remote
  │       ├─ Try: git rebase <sealed-branch> <draft-branch>
  │       │   ├─ Conflict → FAIL (sealing seizes — manual reconciliation needed)
  │       │   └─ Clean rebase →
  │       │       └─ Retry ff-only merge (loop, up to maxRetries)
  │       └─ All retries exhausted → FAIL
  └─ Never: merge commits, force push, conflict auto-resolution
```

The retry loop handles **contention** — when multiple animas seal to the same codex in quick succession, each fetch-rebase-ff cycle picks up the other's sealed inscriptions. Three retries (configurable via `settings.maxMergeRetries`) is sufficient for typical guild concurrency; the limit prevents infinite loops in pathological cases.

---

## Clone Readiness and Fetch Policy

### Initial clone

The `add()` API **blocks until the bare clone completes**. The caller gets back a `CodexRecord` with `cloneStatus: 'ready'` — registration isn't done until the clone is usable. This keeps the contract simple: if `add()` returns successfully, the codex is operational.

At **startup**, the Scriptorium checks each configured codex for an existing bare clone. Missing clones are initiated in the background — the apparatus starts without waiting. However, any tool invocation that requires the bare clone (everything except `codex-list`) **blocks until that codex's clone is ready**. The tool doesn't fail or return stale data; it waits. If the clone fails, the tool fails with a clear error referencing the clone failure.

### Fetch before branch operations

Every operation that creates or modifies branches **fetches from the remote first**:

- **`openDraft`** — fetches before branching, ensuring the start point reflects the latest remote state.
- **`seal`** — fetches the target branch before attempting ff-only, and again on each retry iteration. The fetch uses an explicit refspec (`+refs/heads/*:refs/remotes/origin/*`) to populate remote-tracking refs — a plain `git fetch origin` in a bare clone (which has no default fetch refspec) only updates `FETCH_HEAD` and leaves both `refs/heads/*` and `refs/remotes/origin/*` stale. After fetching, if `refs/remotes/origin/<target>` is strictly ahead of `refs/heads/<target>` (i.e. commits were pushed outside the Scriptorium), the local sealed binding is advanced to the remote position before the seal attempt. This ensures the draft is rebased onto the actual remote state and the subsequent push fast-forwards cleanly.
- **`push`** — does **not** fetch first (it's pushing, not pulling).

`fetch` is also exposed as a standalone API for manual use, but callers generally don't need it — the branch operations handle freshness internally.

### Startup reconciliation

On `start()`, the Scriptorium:

1. Reads the `codexes` config from `guild.json`
2. For each configured codex, checks whether a bare clone exists at `.nexus/codexes/<name>.git`
3. Initiates background clones for any missing codexes
4. Reconciles Stacks records with filesystem state (cleans up records for drafts that no longer exist on disk)

This means a patron can hand-edit `guild.json` to add a codex, and the Scriptorium will clone it on next startup.

---

## Draft Branch Collisions

If a caller requests a draft with a branch name that already exists for that codex, `openDraft` **rejects with a clear error**. Branch naming is the caller's responsibility. Auto-suffixing would hide real problems (two writs accidentally opening drafts on the same branch). Git enforces this at the worktree level — a branch can only be checked out in one worktree at a time — and the Scriptorium surfaces the constraint rather than working around it.

---

## Draft Cleanup

The Scriptorium does **not** automatically reap stale drafts. It provides the `abandonDraft` API; when and why to call it is an external concern. A future reaper process, standing order, or manual cleanup can use `draft-list` and `draft-abandon` as needed. This keeps the Scriptorium ignorant of writ lifecycle and other domain concerns.

---

## Future: Clockworks Events

When the Clockworks apparatus exists, the Scriptorium should emit events for downstream consumers (particularly the Surveyor):

| Event | Payload | When |
|-------|---------|------|
| `codex.added` | `{ name, remoteUrl }` | A codex is registered |
| `codex.removed` | `{ name }` | A codex is deregistered |
| `codex.fetched` | `{ name }` | A codex's bare clone is fetched |
| `draft.opened` | `{ codexName, branch, path, associatedWith? }` | A draft is opened |
| `draft.abandoned` | `{ codexName, branch }` | A draft is abandoned |
| `draft.sealed` | `{ codexName, sourceBranch, targetBranch, strategy }` | A draft is sealed |
| `codex.pushed` | `{ codexName, branch }` | A branch is pushed to remote |

Until then, downstream consumers query the Scriptorium API directly.

---

## Implementation Notes

- **`guild().writeConfig()`** — the Scriptorium uses `guild().writeConfig('codexes', ...)` to persist codex registry changes to `guild.json`. This API was added to the `Guild` interface in `@shardworks/nexus-core` and implemented in Arbor. It updates both the in-memory config and the disk file atomically.
- **Git operations.** All git operations use `child_process.execFile` (not shell) via a lightweight `git.ts` helper that handles error parsing and provides typed results (`GitResult`, `GitError`).
- **Concurrency.** Multiple animas may open/seal drafts concurrently. The bare clone's git operations need appropriate locking — git's own ref locking handles most cases, but the fetch-rebase-seal cycle should be serialized per codex to avoid ref races.
- **No downstream coupling.** The Scriptorium has no dependency on the Surveyor, the Spider, or any other consumer of codex state. It is pure infrastructure. Downstream apparatus query or (future) subscribe to the Scriptorium's state independently.

---

## Future State

### Draft Persistence via Stacks

The current implementation tracks active drafts **in memory**, reconstructed from filesystem state at startup. This is sufficient for MVP — draft worktrees are durable on disk and the Scriptorium reconciles on restart. However, this means:

- Draft metadata (`associatedWith`, `createdAt`) is approximate after a restart — the original values are lost.
- There is no queryable history of past drafts (abandoned or sealed).
- Other apparatus cannot subscribe to draft state changes via CDC.

A future iteration should persist `DraftRecord` entries to a Stacks book (`codexes/drafts`), enabling:

- Durable metadata that survives restarts
- Historical draft records (with terminal status: `sealed`, `abandoned`)
- CDC-driven downstream reactions (e.g. the Surveyor updating its codex-awareness when a draft is sealed)

### Per-Codex Sealing Lock

The sealing retry loop (fetch → rebase → ff) is not currently serialized per codex. Under high concurrency (multiple animas sealing to the same codex simultaneously), ref races are possible. Git's own ref locking prevents corruption, but the retry loop may exhaust retries unnecessarily.

A per-codex async mutex around the seal operation would eliminate this. The lock should be held only during the seal attempt, not during the preceding fetch or the subsequent draft cleanup.

### Clockworks Event Emission

Documented in the **Future: Clockworks Events** section above. When the Clockworks apparatus exists, the Scriptorium should emit events for each lifecycle operation. This replaces the current pattern where downstream consumers poll the API directly.

=== FILE: docs/architecture/apparatus/spider.md ===
# The Spider — API Contract

Status: **Ready — MVP**

Package: `@shardworks/spider-apparatus` · Plugin id: `spider`

> **⚠️ MVP scope.** This spec covers a static rig graph: every commission gets the same five-engine pipeline (`draft → implement → review → revise → seal`). No origination, no dynamic extension, no capability resolution. The Spider runs engines directly — the Executor earns its independence later. See [What This Spec Does NOT Cover](#what-this-spec-does-not-cover) for the full list.

---

## Purpose

The Spider is the spine of the guild's rigging system. It replaces the Dispatch apparatus, which ran one writ in one session with no review. The Spider runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `crawl()` step function.

The Spider owns the rig's structural lifecycle — spawn, traverse, complete — and delegates everything else. Engine designs come from the Fabricator. Sessions come from the Animator. Draft bindings come from the Scriptorium. Writ transitions are handled by a CDC handler, not inline. The Spider itself is stateless between `crawl()` calls; all state lives in the Stacks.

---

## Dependencies

```
requires: ['fabricator', 'clerk', 'stacks']
```

- **The Fabricator** — resolves engine designs by `designId`.
- **The Clerk** — queries ready writs; receives writ transitions via CDC.
- **The Stacks** — persists rigs book, reads sessions book, hosts CDC handler on rigs book.

Engines pull their own apparatus dependencies (Scriptorium, Animator, Loom) via the `guild()` singleton — these are not Walker dependencies.

### Reference docs

- **The Rigging System** (`docs/architecture/rigging.md`) — full rigging architecture (Walker, Fabricator, Executor, Manifester). This spec implements a subset.
- **The Fabricator** (`docs/architecture/apparatus/fabricator.md`) — engine design registry and `EngineDesign` type definitions.
- **The Scriptorium** (`docs/architecture/apparatus/scriptorium.md`) — draft binding API (`openDraft`, `seal`, `abandonDraft`).
- **The Animator** (`docs/architecture/apparatus/animator.md`) — session API (`summon`, `animate`), `AnimateHandle`, `SessionResult`.
- **The Clerk** (`docs/architecture/apparatus/clerk.md`) — writ lifecycle API.
- **The Stacks** (`docs/architecture/apparatus/stacks.md`) — CDC phases, cascade vs notification, `watch()` API.

---

## The Engine Interface

Engines are the unit of work in a rig. Each engine implements a standard interface defined by the Fabricator apparatus (`@shardworks/fabricator-apparatus`). The `EngineDesign`, `EngineRunContext`, and `EngineRunResult` types are owned and exported by the Fabricator — see the Fabricator spec (`docs/architecture/apparatus/fabricator.md`) for full type definitions. Engines pull their own apparatus dependencies via `guild().apparatus(...)` — same pattern as tool handlers.

The Spider resolves engine designs by `designId` from the Fabricator at runtime: `fabricator.getEngineDesign(id)`.

### Kit contribution

The Spider contributes its five engine designs via its support kit:

```typescript
// In spider-apparatus plugin
supportKit: {
  engines: {
    draft:     draftEngine,
    implement: implementEngine,
    review:    reviewEngine,
    revise:    reviseEngine,
    seal:      sealEngine,
  },
  tools: {
    walk:          crawlTool,           // single step — do one thing and return
    crawlContinual: crawlContinualTool,  // polling loop — walk every ~5s until stopped
  },
},
```

**Tool naming note:** Hyphenated tool names (e.g. `start-walking`) have known issues with CLI argument parsing and tool grouping in `nsg`. The names above use camelCase in code; the CLI surface (`nsg crawl`, `nsg crawl-continual`) needs to work cleanly with the Instrumentarium's tool registration. Final CLI naming TBD — may need to revisit how the Instrumentarium maps tool IDs to CLI commands.

The Fabricator scans kit `engines` contributions at startup (same pattern as the Instrumentarium scanning tools). The Spider contributes its engines like any other kit — no special registration path.

---

## The Walk Function

The Spider's core is a single step function:

```typescript
interface SpiderApi {
  /**
   * Examine guild state and perform the single highest-priority action.
   * Returns a description of what was done, or null if there's nothing to do.
   */
  crawl(): Promise<CrawlResult | null>
}

type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
```

Each `crawl()` call does exactly one thing. The priority ordering:

1. **Collect a completed engine.** Scan all running rigs for an engine with `status === 'running'`. Read the session record from the sessions book by `engine.sessionId`. If the session has reached a terminal status (`completed` or `failed`), update the engine: set its status and populate its yields (or error). If the engine failed, mark the rig `failed` (same transaction). If the completed engine is the terminal engine (`seal`), mark the rig `completed` (same transaction). Rig status changes trigger the CDC handler (see below). Returns `rig-completed` if the rig transitioned, otherwise `engine-completed`. This is the first priority because it unblocks downstream engines.
2. **Run a ready engine.** An engine is ready when `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`. Look up the `EngineDesign` by `designId` from the Fabricator. Assemble givens (from givensSpec) and context (with upstream yields), then call `design.run(givens, context)`. For clockwork engines (`status: 'completed'` result): store the yields on the engine instance, mark it completed, and check for rig completion (same as step 1). Returns `engine-completed` (or `rig-completed` if this was the terminal engine). For quick engines (`status: 'launched'` result): store the `sessionId`, mark the engine `running`. Returns `engine-started`. Completion is collected on subsequent crawl calls via step 1.
3. **Spawn a rig.** If there's a ready writ with no rig, spawn the static graph. Returns `rig-spawned`.

If nothing qualifies at any level, return null (the guild is idle or all work is blocked on running quick engines).

### Operational model: `start-walking`

The Spider exports a `start-walking` tool that runs the crawl loop:

```
nsg start-crawling    # starts polling loop, walks every ~5s
nsg crawl             # single step (useful for debugging/testing)
```

The loop: call `crawl()`, sleep `pollIntervalMs` (default 5000), repeat. When `crawl()` returns null, the loop doesn't stop — it keeps polling. New writs posted via `nsg commission-post` from a separate terminal are picked up on the next poll cycle.

---

## Rig Data Model

### Rig

```typescript
interface Rig {
  id: string
  writId: string
  status: 'running' | 'completed' | 'failed'
  engines: EngineInstance[]
}
```

Stored in the Stacks `rigs` book. One rig per writ. The Spider reads and updates rigs via normal Stacks `put()`/`patch()` operations.

### Engine Instance

```typescript
interface EngineInstance {
  id: string               // unique within the rig, e.g. 'draft', 'implement', 'review', 'revise', 'seal'
  designId: string         // engine design id — resolved from the Fabricator
  status: 'pending' | 'running' | 'completed' | 'failed'
  upstream: string[]       // ids of engines that must complete first (empty = first engine)
  givensSpec: Record<string, unknown>  // givens specification — literal values now, templates later
  yields: unknown          // set on completion — the engine's yields (see Yield Types below)
  error?: string           // set on failure
  sessionId?: string       // set when run() returns 'launched' — Walker polls for completion
  startedAt?: string       // ISO-8601, set when engine begins running (enables future timeout detection)
  completedAt?: string     // ISO-8601, set when engine reaches terminal status
}
```

An engine is **ready** when: `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`.

### The Static Graph

Every spawned rig gets this engine list:

```typescript
function spawnStaticRig(writ: Writ, config: SpiderConfig): EngineInstance[] {
  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],
      givensSpec: { writ }, yields: null },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: ['draft'],
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: ['implement'],
      givensSpec: { writ, role: 'reviewer', buildCommand: config.buildCommand, testCommand: config.testCommand }, yields: null },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: ['review'],
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: ['revise'],
      givensSpec: {}, yields: null },
  ]
}
```

The `givensSpec` is populated from the Spider's config at rig spawn time. The rig is self-contained after spawning — no runtime config lookups needed. The `writ` is passed as a given to engines that need it (most do; `seal` doesn't). All engines start with `yields: null` — yields are populated when the engine completes (see [Yield Types](#yield-types-and-data-flow)).

The rig is **completed** when the terminal engine (`seal`) has `status === 'completed'`. The rig is **failed** when any engine has `status === 'failed'`.

---

## Yield Types and Data Flow

Each engine produces typed yields that downstream engines consume. The yields are stored on the `EngineInstance.yields` field in the Stacks.

**Serialization constraint:** Because yields are persisted to the Stacks (JSON-backed), all yield values **must be JSON-serializable**. The Spider should validate this at storage time — if an engine returns a non-serializable value (function, circular reference, etc.), the engine fails with a clear error. This is important because engines are a plugin extension point — kit authors need a hard boundary, not a silent corruption.

When the Spider runs an engine, it assembles givens from the givensSpec only — upstream yields are **not** merged into givens. Engines that need upstream data access it via the `context.upstream` escape hatch:

```typescript
function assembleGivensAndContext(rig: Rig, engine: EngineInstance) {
  // Collect all completed engine yields for the context escape hatch.
  // All completed yields are included regardless of graph distance —
  // simpler than chain-walking and equivalent for the static graph.
  const upstream: Record<string, unknown> = {}
  for (const e of rig.engines) {
    if (e.status === 'completed' && e.yields !== undefined) {
      upstream[e.id] = e.yields
    }
  }

  // Givens = givensSpec only. Upstream data stays on context.
  const givens = { ...engine.givensSpec }

  const context: EngineRunContext = {
    engineId: engine.id,
    upstream,
  }

  return { givens, context }
}
```

Givens contain only what the givensSpec declares — static values set at rig spawn time (writ, role, buildCommand, etc.). Engines that need upstream data (worktree path, review findings, etc.) pull it from `context.upstream` by engine id. This keeps the givens contract clean: what you see in the givensSpec is exactly what the engine receives.

### `DraftYields`

```typescript
interface DraftYields {
  draftId: string         // the draft binding's unique id (from DraftRecord.id)
  codexName: string       // which codex this draft is on (from DraftRecord.codexName)
  branch: string          // git branch name for the draft (from DraftRecord.branch)
  path: string            // absolute path to the draft worktree (from DraftRecord.path)
  baseSha: string         // commit SHA at draft open — used to compute diffs later
}
```

**Produced by:** `draft` engine
**Consumed by:** all downstream engines. Establishes the physical workspace.

> **Note:** Field names mirror the Scriptorium's `DraftRecord` type (`codexName`, `branch`, `path`) rather than inventing Walker-specific aliases. `baseSha` is the only field the draft engine adds itself — by reading `HEAD` after opening the draft.

### `ImplementYields`

```typescript
interface ImplementYields {
  sessionId: string
  sessionStatus: 'completed' | 'failed'
}
```

**Produced by:** `implement` engine (set by Walker's collect step when session completes)
**Consumed by:** `review` (needs to know the session completed)

### `ReviewYields`

```typescript
interface ReviewYields {
  sessionId: string
  passed: boolean                      // reviewer's overall assessment
  findings: string                     // structured markdown: what passed, what's missing, what's wrong
  mechanicalChecks: MechanicalCheck[]  // build/test results run before the reviewer session
}

interface MechanicalCheck {
  name: 'build' | 'test'
  passed: boolean
  output: string    // stdout+stderr, truncated to 4KB
  durationMs: number
}
```

**Produced by:** `review` engine
**Consumed by:** `revise` (needs `passed` to decide whether to do work, needs `findings` as context)

The `mechanicalChecks` are run by the engine *before* launching the reviewer session — their results are included in the reviewer's prompt.

### `ReviseYields`

```typescript
interface ReviseYields {
  sessionId: string
  sessionStatus: 'completed' | 'failed'
}
```

**Produced by:** `revise` engine (set by Walker's collect step when session completes)
**Consumed by:** `seal` (no data dependency — seal just needs revise to be done)

### `SealYields`

```typescript
interface SealYields {
  sealedCommit: string                     // the commit SHA at head of target after sealing (from SealResult)
  strategy: 'fast-forward' | 'rebase'      // merge strategy used (from SealResult)
  retries: number                          // rebase retry attempts needed (from SealResult)
  inscriptionsSealed: number               // number of commits incorporated (from SealResult)
}
```

**Produced by:** `seal` engine
**Consumed by:** nothing (terminal). Used by the CDC handler for the writ transition resolution message.

> **Note:** Field names mirror the Scriptorium's `SealResult` type. Push is a separate Scriptorium operation — the seal engine seals but does not push.

---

## Engine Implementations

Each engine is an `EngineDesign` contributed by the Spider's support kit. The engine's `run()` method receives assembled givens and a thin context, and returns an `EngineRunResult`. Engines pull apparatus dependencies via `guild().apparatus(...)`.

### `draft` (clockwork)

Opens a draft binding on the commission's target codex.

```typescript
async run(givens: Record<string, unknown>, _context: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('codexes')
  const writ = givens.writ as Writ
  const draft = await scriptorium.openDraft({ codexName: writ.codex, associatedWith: writ.id })
  const baseSha = await getHeadSha(draft.path)

  return {
    status: 'completed',
    yields: { draftId: draft.id, codexName: draft.codexName, branch: draft.branch, path: draft.path, baseSha } satisfies DraftYields,
  }
}
```

### `implement` (quick)

Summons an anima to do the commissioned work.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields

  const prompt = `${writ.body}\n\nCommit all changes before ending your session.`

  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
    metadata: { engineId: context.engineId, writId: writ.id },
  })

  const sessionId = await getSessionIdFromHandle(handle)
  return { status: 'launched', sessionId }
}
```

The implement engine wraps the writ body with a commit instruction — each engine owns its own prompt contract rather than relying on `dispatch.sh` to append instructions to the writ body.

**Collect step (Walker, not engine):** When the Spider's collect step detects the session has completed, it builds the yields:

```typescript
// In Walker's collect step
const session = await stacks.get('sessions', engine.sessionId)
engine.yields = {
  sessionId: session.id,
  sessionStatus: session.status,
} satisfies ImplementYields
```

### `review` (quick)

Runs mechanical checks, then summons a reviewer anima to assess the implementation.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields

  // 1. Run mechanical checks synchronously
  const checks: MechanicalCheck[] = []
  if (givens.buildCommand) {
    checks.push(await runCheck('build', givens.buildCommand as string, draft.path))
  }
  if (givens.testCommand) {
    checks.push(await runCheck('test', givens.testCommand as string, draft.path))
  }

  // 2. Compute diff since draft opened
  const diff = await gitDiff(draft.path, draft.baseSha)
  const status = await gitStatus(draft.path)

  // 3. Assemble review prompt
  const prompt = assembleReviewPrompt(writ, diff, status, checks)

  // 4. Launch reviewer session
  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    metadata: {
      engineId: context.engineId,
      writId: writ.id,
      mechanicalChecks: checks,  // stash for collect step to include in yields
    },
  })

  const sessionId = await getSessionIdFromHandle(handle)
  return { status: 'launched', sessionId }
}
```

**Review prompt template:**

```markdown
# Code Review

You are reviewing work on a commission. Your job is to assess whether the
implementation satisfies the spec, identify any gaps or problems, and produce
a structured findings document.

## The Commission (Spec)

{writ.body}

## Implementation Diff

Changes since the draft was opened:

```diff
{git diff draft.baseSha..HEAD in worktree}
```

## Current Worktree State

```
{git status --porcelain}
```

## Mechanical Check Results

{for each check}
### {name}: {PASSED | FAILED}
```
{output, truncated to 4KB}
```
{end for}

## Instructions

Assess the implementation against the spec. Produce your findings in this format:

### Overall: PASS or FAIL

### Completeness
- Which spec requirements are addressed?
- Which are missing or partially addressed?

### Correctness
- Are there bugs, logic errors, or regressions?
- Do the tests pass? If not, what fails?

### Quality
- Code style consistent with the codebase?
- Appropriate test coverage for new code?
- Any concerns about the approach?

### Required Changes (if FAIL)
Numbered list of specific changes needed, in priority order.

Produce your findings as your final message in the format above.
```

**Collect step:** The Spider retrieves the reviewer's findings from the session output — the reviewer produces structured markdown as its final message, and the Animator captures this on the session record. No file is written to the worktree (review artifacts don't belong in the codebase).

```typescript
// In Walker's collect step
const session = await stacks.get('sessions', engine.sessionId)
const findings = session.output  // reviewer's structured findings from final message
const passed = /^###\s*Overall:\s*PASS/mi.test(findings)
const checks = session.metadata?.mechanicalChecks ?? []

engine.yields = { sessionId: session.id, passed, findings, mechanicalChecks: checks } satisfies ReviewYields
```

**Dependency:** The Animator's `SessionResult.output` field (the final assistant message text) must be available for this to work. See the Animator spec (`docs/architecture/apparatus/animator.md`) — the `output` field is populated from the session provider's transcript at recording time.

### `revise` (quick)

Summons an anima to address review findings.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields
  const review = context.upstream.review as ReviewYields

  const status = await gitStatus(draft.path)
  const diff = await gitDiffUncommitted(draft.path)
  const prompt = assembleRevisionPrompt(writ, review, status, diff)

  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
    metadata: { engineId: context.engineId, writId: writ.id },
  })

  const sessionId = await getSessionIdFromHandle(handle)
  return { status: 'launched', sessionId }
}
```

**Revision prompt template:**

```markdown
# Revision Pass

You are revising prior work on a commission based on review findings.

## The Commission (Spec)

{writ.body}

## Review Findings

{review.findings}

## Review Result: {PASS | FAIL}

{if review.passed}
The review passed. No changes are required. Confirm the work looks correct
and exit. Do not make unnecessary changes or spend unnecessary time reassessing.
{else}
The review identified issues that need to be addressed. See "Required Changes"
in the findings above. Address each item, then commit your changes.
{end if}

## Current State

```
{git status --porcelain}
```

```diff
{git diff HEAD, if any uncommitted changes}
```

Commit all changes before ending your session.
```

**Collect step:**

```typescript
const session = await stacks.get('sessions', engine.sessionId)
engine.yields = { sessionId: session.id, sessionStatus: session.status } satisfies ReviseYields
```

### `seal` (clockwork)

Seals the draft binding.

```typescript
async run(_givens: Record<string, unknown>, ctx: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('codexes')
  const draft = ctx.upstream.draft as DraftYields

  const result = await scriptorium.seal({
    codexName: draft.codexName,
    sourceBranch: draft.branch,
  })

  return {
    status: 'completed',
    yields: {
      sealedCommit: result.sealedCommit,
      strategy: result.strategy,
      retries: result.retries,
      inscriptionsSealed: result.inscriptionsSealed,
    } satisfies SealYields,
  }
}
```

The seal engine does **not** transition the writ — that's handled by the CDC handler on the rigs book.

---

## CDC Handler

The Spider registers one CDC handler at startup:

### Rig terminal state → writ transition

**Book:** `rigs`
**Phase:** Phase 1 (cascade) — the writ transition joins the same transaction as the rig update
**Trigger:** rig status transitions to `completed` or `failed`

```typescript
stacks.watch('rigs', async (event) => {
  if (event.type !== 'update') return
  const rig = event.doc
  const prev = event.prev

  // Only fire on terminal transitions
  if (prev.status === rig.status) return
  if (rig.status !== 'completed' && rig.status !== 'failed') return

  if (rig.status === 'completed') {
    const sealYields = rig.engines.find(e => e.id === 'seal')?.yields as SealYields
    await clerk.transition(rig.writId, 'completed', {
      resolution: `Sealed at ${sealYields.sealedCommit} (${sealYields.strategy}, ${sealYields.inscriptionsSealed} inscriptions).`,
    })
  } else {
    const failedEngine = rig.engines.find(e => e.status === 'failed')
    await clerk.transition(rig.writId, 'failed', {
      resolution: `Engine '${failedEngine?.id}' failed: ${failedEngine?.error ?? 'unknown error'}`,
    })
  }
})
```

Because this is Phase 1 (cascade), the writ transition joins the same transaction as the rig status update. If the Clerk call throws, the rig update rolls back too.

---

## Engine Failure

When any engine fails (throws, or a quick engine's session has `status: 'failed'`):

1. The engine is marked `status: 'failed'` with the error (detected during "collect completed engines" for quick engines, or directly during execution for clockwork engines)
2. The rig is marked `status: 'failed'` (same transaction)
3. CDC fires on the rig status change → handler calls Clerk API to transition the writ to `failed`
4. The draft is **not** abandoned — preserved for patron inspection

No retry. No recovery. The patron inspects and decides what to do. This is appropriate for the static rig — see [Future Evolution](#future-evolution) for the retry/recovery direction.

Quick engine "failure" definition: if the Animator session completes with `status: 'failed'`, the engine fails. If the session completes with `status: 'completed'`, the engine succeeds — even if the anima's work is incomplete (that's the review engine's job to catch, not the Spider's).

---

## Dependency Map

```
Walker
  ├── Fabricator  (resolve engine designs by designId)
  ├── Clerk       (query ready writs, transition writ state via CDC)
  ├── Stacks      (persist rigs book, read sessions book, CDC handler on rigs book)
  │
  Engines (via guild() singleton, not Walker dependencies)
  ├── Scriptorium (draft, seal engines — open drafts, seal)
  ├── Animator    (implement, review, revise engines — summon animas)
  └── Loom        (via Animator's summon — context composition)
```

---

## Future Evolution

These are known directions the Spider and its data model will grow. None are in scope for the static rig MVP.

- **givensSpec templates.** The givensSpec currently holds literal values set at rig spawn time. It will grow to support template expressions (e.g. `${draft.worktreePath}`) that resolve specific values from upstream yields into typed givens, replacing the current reliance on the `context.upstream` escape hatch.
- **Engine needs declarations.** Engine designs will declare a `needs` specification that controls which upstream yields are included and how they're mapped — making the data flow between engines explicit and type-safe.
- **Typed engine contracts.** The `Record<string, unknown>` givens map with type assertions is scaffolding. The needs/planning system will introduce typed contracts between engines — defining what each engine requires and provides. This scaffolding gets replaced, not extended.
- **Dynamic rig extension.** Capability resolution (via the Fabricator) and rig growth at runtime. Engines can declare needs that the Fabricator resolves to additional engine chains, grafted onto the rig mid-execution.
- **Retry and recovery.** The static rig has no retry. Recovery logic arrives with dynamic extension — a failed engine can trigger a recovery chain rather than failing the whole rig.
- **Engine timeouts.** The `startedAt` field on engine instances is included in the data model for future use. During the collect step, the Spider checks `startedAt` against a configurable timeout. If an engine has been running longer than the threshold, the Spider marks it failed (and optionally terminates the session).
- **Unified capability catalog.** The Fabricator may absorb tool designs from the Instrumentarium, becoming the single answer to "what can this guild do?" regardless of whether the answer is an engine or a tool.

---

## What This Spec Does NOT Cover

- **Origination.** Commission → rig mapping is hardcoded (static graph).
- **The Executor as a separate apparatus.** The Spider runs engines directly — clockwork engines inline, quick engines via the Animator. The Executor earns its independence when substrate switching (Docker, remote VM) is needed.
- **Concurrent rigs.** The priority system supports multiple rigs in principle, but the polling loop + single-guild model means we process one commission at a time in practice. Concurrency comes naturally when the Spider processes multiple ready engines across rigs.
- **Reviewer role curriculum/temperament.** The `reviewer` role exists with a blank identity. The review engine assembles the prompt. Loom content for the reviewer is a separate concern.

---

## Configuration

```json
{
  "walker": {
    "role": "artificer",
    "pollIntervalMs": 5000,
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test"
  }
}
```

All fields optional. `role` defaults to `"artificer"`. `pollIntervalMs` defaults to `5000`. `buildCommand` and `testCommand` are run by the review engine before launching the reviewer; omitted means those mechanical checks are skipped (reviewer anima still does spec-vs-diff assessment).

=== FILE: docs/architecture/index.md ===
# Nexus Architecture

**Nexus** is a framework for running an autonomous workforce of *animas* — AI agents who produce work in service of a guild, which ultimately delivers those works to a human patron. This is a technical document which describes the system itself — the structures, concepts, and machinery that any guild requires. It is meant to assist Nexus developers in their work, or provide users deeper insight into the workings of their guild. It is not intended as a general user guide for people who just want to run a guild.

For the conceptual vocabulary — what guilds, animas, commissions, writs, and apparatus *are* in the abstract — read [The Guild Metaphor](../guild-metaphor.md) first. This document describes how those concepts are implemented.

---

## System at a Glance

> This section describes the **standard guild** — the configuration `nsg init` produces. The framework itself is a plugin loader; every apparatus named below is part of the default plugin set, not a hard requirement. §4 ([Plugin Architecture](#plugin-architecture)) explains the underlying model; the [Standard Guild](#the-standard-guild) section catalogues what the default set includes.

A Nexus guild is a git repository with a `guild.json` at its root and a `.nexus/` directory holding runtime state. When the system starts, **Arbor** — the guild runtime — reads `guild.json`, loads the declared plugins, validates their dependencies, and starts each apparatus in order. From that point, the guild operates: the patron commissions work; **The Clerk** receives it and issues writs; **The Spider** assembles rigs and drives their engines to completion; **The Clockworks** turns events into action, activating relays in response to standing orders; and **anima sessions** — AI processes launched by **The Animator** — do the work that requires judgment. Results land in codexes and documents; the patron consumes what the guild delivers.

```
  PATRON
    │  commission                                        ▲  works
    ▼                                                    │
  ┌──────────────────────────────────────────────────────┴──────┐
  │  Guild  (guild.json + .nexus/)                               │
  │                                                              │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │  Arbor  —  runtime · plugin loader · lifecycle        │  │
  │  ├───────────────────────────────────────────────────────┤  │
  │  │  Stacks (persistence)                                 │  │
  │  ├───────────────────────────────────────────────────────┤  │
  │  │  Clockworks · Surveyor · Clerk                        │  │
  │  ├───────────────────────────────────────────────────────┤  │
  │  │  Spider · Fabricator · Executor                        │  │
  │  │  Loom · Animator                                      │  │
  │  └─────────────────────────┬─────────────────────────────┘  │
  │                            │                                 │
  │  Anima Sessions  ◄─────────┘                                │
  │  AI process · MCP server · permission-gated tools                 │
  │                   │                                          │
  │  Works  ◄─────────┘                                         │
  │  codexes · documents · yields                               │
  └──────────────────────────────────────────────────────────────┘
```

### Patron

The patron is the human outside the system. They commission work and consume what the guild delivers — and that is the full extent of their participation. The patron does not assign animas, orchestrate apparatus, or direct how labor is organized. The interface is intentionally narrow: commission in, works out. What happens in the guild to convert one to the other is the guild's concern.

### The Guild

Physically, a guild is a directory. Its configuration root is `guild.json` — a single file that declares the guild's name, the plugins it has installed, its anima roles, and the standing orders that govern its reactive behavior. Everything the guild *is* lives in that file and the versioned content alongside it. Runtime activity — the persistence database, daemon state, active worktrees — accumulates in `.nexus/`, which is gitignored. The guild's identity is versioned; its running state is not.

### Arbor

Arbor is the guild runtime. Its single entry point, `createGuild()`, reads `guild.json`, imports every declared plugin, validates the dependency graph, starts each apparatus in dependency order, and wires the `guild()` singleton. It is not a persistent server or a central process — it is a library that each entry point (the CLI, the MCP server, the Clockworks daemon) calls once at startup. There is no Arbor "service" to connect to; the `Guild` object it returns is alive for as long as the process that created it is running.

Arbor's scope is deliberately narrow: plugin loading, dependency validation, and apparatus lifecycle. It does not own tool discovery (that belongs to The Instrumentarium), persistence (that belongs to The Stacks), or any CLI commands.

### The CLI

The `nsg` command is the patron's and operator's entry point into the guild. It has two layers of commands:

**Framework commands** are defined in the CLI package itself — guild lifecycle (`init`, `status`, `version`, `upgrade`) and plugin management (`plugin list/install/remove`). These are always available, even without a guild.

**Plugin tools** are discovered dynamically from **The Instrumentarium** (the `tools` apparatus). At startup, the CLI calls `createGuild()` to boot the runtime, then queries the Instrumentarium for all installed tools that are CLI-callable. Each tool's Zod param schema is auto-converted to Commander flags. This means the plugin tool surface grows automatically as plugins are installed — `nsg --help` always reflects exactly what's available.

Tool names are auto-grouped by hyphen prefix — `session-list` and `session-show` become `nsg session list` and `nsg session show`.

Two additional commands bypass the tool registry: `nsg consult` and `nsg convene` (interactive sessions with streaming output — not simple tool invocations). These are built into the v1 CLI and will migrate when the Animator and Parlour expose the necessary APIs.

### The Apparatus

The guild's operational fabric is provided by apparatus — plugins with a start/stop lifecycle that Arbor starts in dependency order. **The Stacks** is the persistence substrate everything else reads from and writes to. **The Scriptorium** manages codexes — bare clones, draft bindings (worktrees), and the seal-and-push lifecycle. **The Clockworks** is the event-driven nervous system: standing orders bind events to relays, and the summon relay dispatches anima sessions in response. **The Surveyor** tracks what work applies to each registered codex. **The Clerk** handles commission intake, converting patron requests into writs and signaling when work is ready to execute. The Fabricator, Spider, Executor, Loom, and Animator then take it from there — covered in the next section.

Each of these is a plugin from the default set, not a built-in. The [Standard Guild](#the-standard-guild) section lists them; the sections that follow document each in detail.

### Execution, Sessions, and Works

When The Clerk signals a writ is ready, **The Spider** spawns a rig and begins driving it: traversing active engines, dispatching those whose upstream work is complete, and extending the rig by querying **The Fabricator** for engine chains that satisfy declared needs. **The Executor** runs each engine — clockwork engines run their code directly; quick engines launch an anima session.

An anima session is an AI process running against an MCP server loaded with the role's tools. Before launch, **The Loom** weaves the session context: system prompt, tool instructions, writ context. **The Animator** then starts the process, monitors it, and records the result. The session exits; the output persists. The Clockworks can also trigger sessions directly via the summon relay, bypassing the rig machinery entirely — The Animator handles both paths the same way.

Session output is concrete: modified files committed to a git branch, new documents written to disk, structured data passed as engine yields to downstream steps. When a rig completes, any pending git work is merged, and the result is whatever the patron commissioned — a working feature, a fixed bug, a written report. The patron's codexes are updated; the patron can pull, deploy, and use them.

---

## The Guild Root

A guild is a directory — a regular git repository with a `guild.json` at its root. The framework discovers the guild root the same way git discovers `.git/`: by walking up from the current working directory until it finds `guild.json`. The `--guild-root` flag overrides this for explicit invocation.

### Directory Structure

```
GUILD_ROOT/
  guild.json                    ← central configuration (versioned)
  package.json                  ← npm package; plugins are npm dependencies
  package-lock.json
  node_modules/                 ← gitignored; plugin code lives here
  <guild content>/              ← versioned guild files (roles/, training/,
                                   tools/, engines/, etc.) — structure is
                                   guild-specific, not framework-prescribed
  .nexus/                       ← runtime state, gitignored
    nexus.db                    ← persistence database (SQLite)
    clock.pid                   ← Clockworks daemon PID
    clock.log                   ← Clockworks daemon log
    sessions/                   ← per-session working files
    codexes/                    ← bare git clones of registered codexes
    worktrees/                  ← git worktrees for active draft bindings
```

The versioned files — `guild.json`, `package.json`, and the guild's own content — are the guild's identity. `.nexus/` is operational territory: it can be deleted and rebuilt without losing configuration. Nothing in `.nexus/` is committed; everything that matters is in the versioned files.

### `guild.json`

`guild.json` is the guild's central configuration file. Arbor reads it at startup; nothing in the guild system runs without it. It has a small number of framework-level keys that Arbor reads directly, plus any number of **plugin configuration sections** — top-level keys owned by individual plugins, keyed by their derived plugin id.

```json
{
  "name": "my-guild",
  "nexus": "0.1.x",
  "plugins": ["books", "clockworks", "sessions", "..."],
  "settings": {
    "model": "claude-opus-4-5"
  },

  "clockworks": {
    "events": {
      "craft.question": { "description": "An artificer hit a decision outside commission scope." }
    },
    "standingOrders": [
      { "on": "writ.ready",            "run": "draft-prepare" },
      { "on": "writ.workspace-ready",  "summon": "artificer", "prompt": "..." },
      { "on": "writ.completed",        "run": "draft-seal" }
    ]
  }
}
```

#### Framework keys

**`name`** — the guild's identifier, used as the npm package name for the guild's own content package.

**`nexus`** — the installed framework version. Written by `nsg init` and `nsg upgrade`; not edited by hand.

**`plugins`** — ordered list of installed plugin ids. Arbor loads them in this order, respecting the dependency graph. `nsg install` and `nsg remove` manage this list. Starts empty on `nsg init`; the standard guild adds the default set.

**`settings`** — operational configuration. Currently holds `model` (the default LLM model for anima sessions) and `autoMigrate` (whether to apply database migrations automatically on startup).

#### Plugin configuration

All remaining top-level keys are plugin configuration sections, keyed by derived plugin id (see [Plugin IDs](#plugin-ids)). Each plugin reads its own section via `guild().config(pluginId)` at startup or handler invocation time.

In the standard guild, `clockworks` contains events and standing orders; `codexes` tracks registered repositories and draft settings; `loom` holds role definitions and permission grants. These are all plugin config — not framework-owned fields — they get natural short keys because of the `@shardworks/` naming convention and `-(plugin|apparatus|kit)` suffix stripping (e.g. `@shardworks/tools-apparatus` → `tools`). See [Configuration](plugins.md#configuration) for the full model.

### Runtime State (`.nexus/`)

`.nexus/` is entirely gitignored. It is created on first run and can be deleted safely — the guild will rebuild it from `guild.json` and the versioned content files.

**`nexus.db`** — the SQLite database owned by The Stacks. All guild state that needs to survive process restarts lives here: anima records, writ history, session records, event and dispatch logs.

**`clock.pid` / `clock.log`** — daemon bookkeeping for The Clockworks. `clock.pid` holds the PID of the running daemon process; `clock.log` is its output. Both are absent when the daemon is not running.

**`sessions/`** — working files for active and recently-completed sessions. Each session gets a JSON record here at launch; The Animator writes the result back when the session exits.

**`codexes/`** — bare git clones of every registered codex, named `<codex-name>.git`. Managed by The Scriptorium. Draft worktrees are checked out from these clones rather than from the remotes directly, keeping network operations to `fetch` calls rather than repeated clones.

**`worktrees/`** — git worktrees for active draft bindings. Each draft gets a dedicated worktree here, isolated from other concurrent work. Drafts are opened when work begins and sealed or abandoned when the work completes. See [The Scriptorium](apparatus/scriptorium.md).

---

## Plugin Architecture

The apparatus described in §2 — The Stacks, The Clockworks, The Clerk, The Spider, and the rest — are all plugins. There is no privileged built-in layer. Arbor, the guild runtime, is only a plugin loader, a dependency graph, and the startup/shutdown lifecycle for what gets loaded. Every piece of operational infrastructure is contributed by a plugin package; the standard guild is simply a particular set of those packages.

Plugins come in two kinds: **kits** and **apparatus**. This section introduces them; [Plugin Architecture](plugins.md) is the full specification.

### Kit

A **kit** is a passive package contributing capabilities to the guild. Kits have no lifecycle — they are read at load time and their contributions are forwarded to consuming apparatus. Nothing about a kit participates in `start`/`stop` or requires a running system.

```typescript
// @shardworks/nexus-git — a kit contributing git-related tools, engines, and relays
export default {
  kit: {
    requires:   ["books"],
    recommends: ["clockworks", "spider"],
    engines: [createBranchEngine, mergeBranchEngine],
    relays:  [onMergeRelay],
    tools:   [statusTool, diffTool],
  },
} satisfies Plugin
```

A kit is an **open record**: the contribution fields (`engines`, `relays`, `tools`, etc.) are defined by the apparatus packages that consume them, not by the framework. The framework only reads `requires` (hard dependency on an apparatus — validated at startup) and `recommends` (advisory — generates a startup warning if absent). Everything else is forwarded opaquely to consuming apparatus via the `plugin:initialized` lifecycle event.

Type safety for contribution fields is opt-in — each apparatus publishes a kit interface (`ClockworksKit`, `SpiderKit`, etc.) that kit authors can import and `satisfies` against.

### Apparatus

An **apparatus** is a package contributing persistent running infrastructure. It has a `start`/`stop` lifecycle, may declare dependencies on other apparatus, and may expose a runtime API.

```typescript
// @shardworks/clockworks — the guild's event-driven nervous system
const clockworksApi: ClockworksApi = { ... }

export default {
  apparatus: {
    requires: ["books"],
    provides: clockworksApi,

    start: (ctx) => {
      const books = guild().apparatus<BooksApi>("books")
      clockworksApi.init(books)
    },
    stop: () => clockworksApi.shutdown(),

    supportKit: {
      relays: [signalRelay, drainRelay],
      tools:  [signalTool, clockStatusTool],
    },

    consumes: ["relays"],
  },
} satisfies Plugin
```

**`requires`** declares apparatus that must be started first — validated at startup, determines start ordering. **`provides`** is the runtime API other plugins retrieve via `guild().apparatus<T>(name)`. **`supportKit`** is the apparatus's own kit contributions (tools, relays, etc.) — treated identically to standalone kit contributions by consumers. **`consumes`** declares which kit contribution types this apparatus scans for, enabling startup warnings when kits contribute types no apparatus consumes.

### Plugin IDs

Plugin names are never declared in the manifest — they are derived from the npm package name at load time:

1. Strip the `@shardworks/` scope (the official Nexus namespace)
2. Retain other scopes as a prefix without `@` (`@acme/foo` → `acme/foo`)
3. Strip a trailing `-(plugin|apparatus|kit)` suffix

So `@shardworks/clockworks` → `clockworks`, `@shardworks/books-apparatus` → `books`, `@acme/cache-kit` → `acme/cache`. Plugin ids are used in `requires` arrays, `guild().apparatus()` calls, and as the key for plugin-specific configuration in `guild.json`. See [Plugin IDs](plugins.md#plugin-ids) for the full derivation table.

### Arbor and Contexts

**Arbor** is the runtime object. It reads `guild.json`, imports all declared plugins, validates the dependency graph, and starts each apparatus in dependency-resolved order. The CLI, MCP server, and Clockworks daemon each create one Arbor instance at startup; it lives for the process's lifetime.

All plugin code — apparatus `start()`, tool handlers, CDC handlers — accesses guild infrastructure through the **`guild()` singleton** from `@shardworks/nexus-core`. It provides access to apparatus APIs, plugin config, the guild root path, and the loaded plugin graph. Apparatus `start(ctx)` additionally receives a **`StartupContext`** for subscribing to lifecycle events via `ctx.on()`.

Startup validation is strict: missing dependencies and circular dependency graphs fail loudly before any apparatus starts. Kit contributions are forwarded to consuming apparatus reactively via the `plugin:initialized` lifecycle event. See [Plugin Architecture](plugins.md) for the full specification, including the [guild() singleton](plugins.md#the-guild-accessor), [StartupContext](plugins.md#startupcontext), and [Configuration](plugins.md#configuration).

### Installation

Plugins are listed in `guild.json` by their plugin id. The framework determines whether each is a kit or apparatus at load time from the package manifest — no user-side declaration needed.

```json
{
  "plugins": ["books", "clockworks", "spider", "sessions", "nexus-git"]
}
```

```sh
nsg install nexus-git     # add a plugin
nsg remove  nexus-git     # remove a plugin
nsg status                # show apparatus health + kit inventory
```

`nsg init` populates the default plugin set for a new guild.

---

## The Standard Guild

The plugin architecture described above is general-purpose: any guild can install any combination of kits and apparatus. In practice, nearly every guild uses the same foundational set — the apparatus and kits that `nsg init` installs by default. The sections that follow document this standard configuration.

Each section introduces one or more apparatus or kits from the default set. Understanding that they are plugins — replaceable, independently testable, authored against the same contracts as any community extension — is the main thing §4 provides. The remaining sections don't repeat it.

### Default Apparatus

| Apparatus | Plugin id | Function |
|-----------|-----------|----------|
| **The Stacks** | `books` | Persistence substrate — SQLite-backed document store and change-data-capture events |
| **The Scriptorium** | `codexes` | Codex management — repository registry, bare clones, draft binding lifecycle, sealing and push |
| **The Clockworks** | `clockworks` | Event-driven nervous system — standing orders, event queue, the summon relay |
| **The Surveyor** | `surveyor` | Codex knowledge — surveys registered codexes so the guild knows what work applies to each |
| **The Clerk** | `clerk` | Commission intake and writ lifecycle — receives commissions, creates writs, signals when work is ready |
| **The Loom** | `loom` | Session context composition — weaves role instructions, tool instructions, curricula, and temperaments into a session context |
| **The Instrumentarium** | `tools` | Tool registry — resolves installed tools, permission-gated tool sets |
| **The Animator** | `animator` | Session lifecycle — launches, monitors, and records anima sessions |
| **The Fabricator** | `fabricator` | Engine design registry — answers "what engine chain satisfies this need?" from installed kits |
| **The Spider** | `spider` | Rig lifecycle — spawns, traverses, extends, and strikes rigs as work progresses |
| **The Executor** | `executor` | Engine runner — executes clockwork and quick engines against a configured substrate |

### Default Kits

| Kit | Contributes |
|-----|-------------|
| **nexus-stdlib** | Base tools (commission-create, tool-install, anima-create, signal, writ/session CRUD, etc.) and the summon relay |
| **clockworks** (supportKit) | Clockworks tools (clock-start, clock-stop, clock-status, event-list, signal) |
| **sessions** (supportKit) | Session tools (session-list, session-show, conversation-list) |

> **Note:** The list above is provisional. The standard guild configuration is still being finalized as individual apparatus are built out. Some entries listed as apparatus are not yet implemented as separate packages — see [What's Implemented vs. Aspirational](_agent-context.md#whats-implemented-vs-aspirational) for the current state. Treat this as a working inventory, not a commitment.

---

## The Books

**The Stacks** (plugin id: `books`) is the guild's persistence layer — a document store backed by SQLite at `.nexus/nexus.db`, with change data capture (CDC) as its primary integration mechanism.

### Document Model

The Stacks stores JSON documents in named collections called **books**. Every document must include an `id: string` field; the framework adds nothing else — no envelopes, timestamps, or revision tracking. Domain types own their own fields.

Plugins declare the books they need via a `books` contribution field in their kit export:

```typescript
export default {
  kit: {
    requires: ['stacks'],
    books: {
      writs:    { indexes: ['status', 'createdAt', 'parent.id'] },
      sessions: { indexes: ['writId', 'startedAt', 'animaId'] },
    },
  },
} satisfies Plugin
```

The Stacks reads these declarations at startup and creates or reconciles the backing tables. Schema changes are additive only — new books and indexes are safe; nothing is dropped automatically.

### API Surface

Plugins access persistence through `guild().apparatus<StacksApi>('stacks')`, which exposes four methods:

- **`book<T>(ownerId, name)`** — returns a writable handle for the named book. Supports `put()` (upsert), `patch()` (top-level field merge), `delete()`, and the full read API (`get`, `find`, `list`, `count`). Queries support equality, range, pattern matching (`LIKE`), set membership (`IN`), null checks, multi-field sorting, and offset/limit pagination.

- **`readBook<T>(ownerId, name)`** — returns a read-only handle for another plugin's book. Cross-plugin writes are not supported; they go through the owning plugin's tools.

- **`watch(ownerId, bookName, handler, options?)`** — registers a CDC handler that fires on every write to the named book. CDC events carry the document's previous state (`prev`) for updates and deletes, enabling diff-based logic.

- **`transaction(fn)`** — executes a function within an atomic transaction. All writes inside `fn` commit or roll back together. Reads inside the transaction see uncommitted writes (read-your-writes).

### Change Data Capture

All writes go through The Stacks API — there is no raw SQL escape hatch. This is what makes CDC reliable: if the API is the only write path, the event stream is complete.

CDC handlers execute in two phases:

**Phase 1 (cascade)** — runs inside the transaction, before commit. The handler's writes join the same atomic unit. If the handler throws, everything rolls back — the triggering write, the handler's writes, and all nested cascades. This is the correct phase for maintaining referential integrity (e.g. cancelling child writs when a parent is cancelled).

**Phase 2 (notification)** — runs after the transaction commits. Data is already persisted. Handler failures are logged as warnings but cannot affect committed data. This is the correct phase for external notifications like Clockworks event emission.

Within a transaction, multiple writes to the same document are coalesced into a single CDC event reflecting the net change. External observers never see intermediate states.

### Backend

The Stacks depends on a `StacksBackend` interface, not SQLite directly. The default implementation uses SQLite via `better-sqlite3`; alternative backends (in-memory for tests, libSQL for edge) implement the same interface. No SQLite types leak into the public API.

See [The Stacks — API Contract](apparatus/stacks.md) for the full specification: complete type signatures, query language, transaction semantics, coalescing rules, use case coverage matrix, and backend interface.

---

## Animas

<!-- TODO: Identity and composition. An anima = name + curriculum + temperament + role assignments. Composition model: curriculum (what you know), temperament (who you are) — both versioned, immutable per version. The Loom weaves them at session time. Anima states: active / retired. MVP: no identity layer; The Loom returns a fixed composition per role. Link to forthcoming anima-composition.md. -->

---

## Work Model

<!-- TODO: The obligation pipeline. Commission (patron's request) → Mandate writ (guild's formal record, created by Clerk) → child writs as the guild decomposes the work → Rigs as the execution scaffolding for a writ. Writ lifecycle (ready → active → pending → completed/failed/cancelled). Writ hierarchy and completion rollup. Brief intro to rigs (assembled by Spider from engine designs contributed by kits via Fabricator). Link to rigging.md for rig execution detail. -->

---

## Kit Components: Tools, Engines & Relays

Kits contribute three kinds of installable artifacts. All three follow the same packaging pattern — a descriptor file, an entry point, and a registration entry — but they serve different roles in the guild.

### Tools

**Tools** are instruments animas wield during work. A tool is a handler with a defined contract (inputs in, structured result out), accessible through three paths:

- **MCP** — animas invoke tools as typed MCP calls during sessions. The framework launches a single MCP engine per session loaded with the anima's permitted tools.
- **CLI** — humans invoke tools via `nsg` subcommands.
- **Import** — engines, relays, and other tools can import handlers programmatically.

All three paths execute the same logic. Tool authors write the handler once using the `tool()` SDK factory from `@shardworks/tools-apparatus`, which wraps a Zod schema and handler function into a `ToolDefinition`:

```typescript
export default tool({
  description: "Look up an anima by name",
  params: { name: z.string() },
  handler: async ({ name }, ctx) => { ... },
})
```

Tools can be TypeScript modules or plain scripts (bash, Python, any executable). Script tools need no SDK — a one-line descriptor and an executable is enough. The framework infers the kind from the file extension.

**Permission gating:** Tools may declare a `permission` level (e.g. `'read'`, `'write'`, `'admin'`). Roles grant permission strings in `plugin:level` format (with wildcard support). The Loom resolves an anima's roles into a flat permissions array; the Instrumentarium matches those grants against each tool's declared permission to resolve the available set. Tools without a `permission` field are permissionless — included by default, or gated in strict mode.

**Instructions:** A tool can optionally ship with an `instructions.md` — a teaching document delivered to the anima as part of its system prompt. Instructions provide craft guidance (when to use the tool, when not to, workflow context) that MCP's schema metadata cannot convey.

### Engines

**Engines** are the workhorse components of rigs — bounded units of work the Spider mounts and sets in motion. An engine runs when its upstream dependencies (givens) are satisfied and produces yields when done. Two kinds:

- **Clockwork** — deterministic, no AI. Runs its code directly against the configured substrate.
- **Quick** — inhabited by an anima for work requiring judgment. The engine defines the work context; the anima brings the skill.

Kits contribute engine designs; the Spider draws on them (via The Fabricator) to extend rigs as work progresses. Engines are not role-gated — they are not wielded by animas directly; they are the work context an anima staffs.

### Relays

**Relays** are Clockworks handlers — purpose-built to respond to events via standing orders. A relay exports a standard `relay()` contract that the Clockworks runner calls when a matching event fires. All relays are clockwork (no anima involvement). The built-in **summon relay** is the mechanism that dispatches anima sessions in response to standing orders.

### Comparison

| | Tools | Engines | Relays |
|---|---|---|---|
| **Purpose** | Instruments animas wield | Rig workhorses | Clockworks event handlers |
| **Invoked by** | Animas (MCP), humans (CLI), code | Spider (within a rig) | Clockworks runner (standing order) |
| **Role gating?** | Yes | No | No |
| **Instructions?** | Optional | No | No |
| **Clockwork or quick?** | Neither (runs on demand) | Either | Always clockwork |

See [Kit Components](kit-components.md) for the full specification: descriptor schemas, on-disk layout, installation mechanics, the MCP engine, and local development workflow.

---

## Sessions

A **session** is a single AI process doing work. It is the fundamental unit of labor in the guild — every anima interaction, whether launched by a standing order or started interactively from the CLI, is a session. Three apparatus collaborate to make a session happen: **The Loom** composes the context, **The Animator** launches the process and records the result, and (when available) **The Instrumentarium** resolves the tools the anima can wield.

### The Session Funnel

Every session passes through the same funnel regardless of how it was triggered:

```
  Trigger (summon relay / nsg consult / nsg convene)
    │
    ├─ 1. Weave context  (The Loom)
    │     system prompt + initial prompt
    │     future: + role instructions + tool instructions
    │             + curriculum + temperament + charter
    │
    ├─ 2. Launch process  (The Animator → Session Provider)
    │     AI process starts in a working directory
    │     MCP tool server attached (future: when Instrumentarium ships)
    │
    ├─ 3. Session runs
    │     anima reads context, uses tools, produces output
    │
    └─ 4. Record result  (The Animator → The Stacks)
          status, duration, token usage, cost, exit code
          ALWAYS recorded — even on crash (try/finally guarantee)
```

The trigger determines *what* work is done (the prompt, the workspace, the metadata), but the funnel is identical. The Animator doesn't know or care whether it was called from a standing order or an interactive session.

### Context Composition (The Loom)

The Loom weaves anima identity into session contexts. Given a role name, it produces an `AnimaWeave` — the composed identity context (system prompt) that The Animator uses to launch a session. The work prompt (what the anima should do) bypasses The Loom and goes directly from the caller to the session provider. At MVP, the Loom accepts the role but does not yet compose a system prompt — the value is in the seam. The Animator never assembles prompts, so when The Loom gains real composition logic, nothing downstream changes.

The target design composes the system prompt from layers, in order: **guild charter** (institutional policy) → **curriculum** (what the anima knows) → **temperament** (who the anima is) → **role instructions** → **tool instructions** → **writ context**. Each layer is versioned and immutable per version, making sessions reproducible — given the same inputs, The Loom produces the same context.

The distinction between **system prompt** and **work prompt** matters: the system prompt is the anima's identity and operating instructions (persistent across turns in a conversation, composed by The Loom); the work prompt is the specific work request for this session (changes each turn, bypasses The Loom). The Animator sends both to the provider.

### Session Launch (The Animator)

The Animator brings animas to life. It takes an `AnimaWeave`, a working directory, and optional metadata, then delegates to a **session provider** — a pluggable backend that knows how to launch and communicate with a specific AI system. Both `summon()` and `animate()` return an `AnimateHandle` synchronously — a `{ chunks, result }` pair where `result` is a promise for the final `SessionResult` and `chunks` is an async iterable of output (empty unless `streaming: true` is set on the request). The MVP provider is `claude-code-apparatus`, which launches a `claude` CLI process in **bare mode** (no CLAUDE.md, no persistent project context — the session context is entirely what The Loom wove).

The Animator's error handling contract is strict: session results are **always** recorded to The Stacks, even when the provider crashes or times out. The launch is wrapped in try/finally — if the provider throws, the session record still gets written with `status: 'failed'` and whatever telemetry was available. If the Stacks write itself fails, that error is logged but doesn't mask the provider error. Session data loss is preferable to swallowing the original failure.

Every session record captures structured telemetry: wall-clock duration, exit code, token usage (input, output, cache read, cache write), and cost in USD. Callers attach opaque **metadata** — the Animator stores it without interpreting it. The summon relay attaches dispatch context (writ id, anima name, codex); `nsg consult` attaches interactive session context. Downstream queries against metadata use The Stacks' JSON path queries.

### Session Providers

Session providers are the pluggable backend behind The Animator. A provider implements `launch()` (blocking) and optionally `launchStreaming()` (yields output chunks as they arrive). When `streaming: true` is set on the request, The Animator uses `launchStreaming()` and pipes chunks through the returned `AnimateHandle`; if the provider doesn't support streaming, the chunks iterable completes immediately with no items.

Providers handle the mechanics of a specific AI system — process spawning, stdio communication, result parsing — but not session lifecycle. The Animator owns lifecycle (id generation, timing, recording); the provider owns the process. This split means adding a new AI backend (GPT, Gemini, local models) requires only a new provider package, not changes to The Animator.

MVP: one hardcoded provider (`claude-code`). Future: provider discovery via kit contributions or guild config.

### Tool-Equipped Sessions (Future)

At MVP, sessions run without tools — the anima can only read and respond. When **The Instrumentarium** ships, The Animator gains the ability to launch an MCP tool server alongside the AI process. The Loom resolves the anima's roles into permission grants; The Instrumentarium resolves the permission-gated tool set; The Animator starts an MCP server loaded with those tools; the provider connects to it via stdio JSON-RPC. One MCP server per session, torn down when the session exits.

Tools are the mechanism through which animas act on the guild — creating writs, reading documents, signaling events, modifying files. Without tools, a session is advisory; with tools, it is operational.

### Conversations (The Parlour)

A **conversation** groups multiple sessions into a coherent multi-turn interaction. Two kinds exist: **consult** (a human talks to an anima — the `nsg consult` command) and **convene** (multiple animas hold a structured dialogue — `nsg convene`). The Parlour manages both.

The Parlour orchestrates, it doesn't execute. For each turn, it determines whose turn it is, assembles the inter-turn context (what happened since this participant last spoke), and delegates the actual session to The Animator. Each anima participant maintains **provider session continuity** via the `--resume` mechanism — the provider's conversation id is stored on the participant record and passed back on the next turn, allowing the AI process to maintain its full context window across turns.

For convene conversations, The Parlour assembles inter-turn messages: when it's Participant A's turn, it collects the responses from all participants who spoke since A's last turn and formats them as the input message. Each participant sees a coherent dialogue without The Parlour re-sending the full history (the provider's `--resume` handles that).

Conversations have an optional **turn limit** — when reached, the conversation auto-concludes. The Parlour tracks all state in The Stacks (no in-memory state between turns), making it safe for concurrent callers and process restarts.

**Workspace constraint:** Provider session continuity depends on local filesystem state (e.g. Claude Code's `.claude/` directory). All turns in a conversation must run in the same working directory, or the session data needed for `--resume` won't be present. The Parlour enforces this by passing a consistent `cwd` to The Animator for every turn.

### Invocation Paths

Sessions enter the system through three paths:

1. **Clockworks summon relay** — a standing order fires, the summon relay calls The Loom and The Animator. This is the autonomous path — no human involved.
2. **`nsg consult`** — the patron starts an interactive session. The CLI calls The Loom and The Animator directly, with streaming output to the terminal. For multi-turn conversations, The Parlour manages the session sequence.
3. **`nsg convene`** — the patron convenes a multi-anima dialogue. The CLI creates a Parlour conversation and drives the turn loop, with each turn delegating to The Animator.

All three paths converge on the same `AnimatorApi.animate()` call. The Animator is the single chokepoint for session telemetry — every session, regardless of trigger, gets the same structured recording.

See [The Animator — API Contract](apparatus/animator.md), [The Loom — API Contract](apparatus/loom.md), and [The Parlour — API Contract](apparatus/parlour.md) for the full specifications.

---

## The Clockworks

<!-- TODO: Event-driven nervous system. Events as immutable persisted facts (not intents). Standing orders as guild policy in guild.json — bind event patterns to relays. The summon verb as sugar for the summon relay. Framework events (automatic, from nexus-core operations) vs. custom guild events (declared in guild.json, signaled by animas via signal tool). The runner: manual (nsg clock tick/run) vs. daemon (nsg clock start). Error handling: standing-order.failed, loop guard. Link to clockworks.md. -->

---

## Core Apparatus Reference

<!-- TODO: Quick-reference table of all standard apparatus — name, package, layer, what it provides, links to detailed docs where they exist. Covers the same set as the table in "The Standard Guild" section but with package names, API surface hints, and links. -->

---

## Future State

Known gaps in the framework infrastructure that will be addressed as apparatus are built out.

### Config write path on `Guild` interface

The `Guild` interface (`guild()` singleton) exposes `config<T>(pluginId)` for reading plugin configuration from `guild.json`, but has no corresponding write method. Currently, plugins that need to modify their config section must use the standalone `writeGuildConfig()` function from `@shardworks/nexus-core`, which reads the full file, modifies it, and writes it back. This works but has no atomicity guarantees and no event emission.

A `guild().writeConfig(pluginId, config)` method (or equivalent) would provide:
- Scoped writes (a plugin modifies only its own section)
- Atomic file updates (read-modify-write under a lock)
- Config change events (for downstream reactivity)

**First consumer:** [The Scriptorium](apparatus/scriptorium.md) — `codex-add` and `codex-remove` need to modify the `codexes` config section programmatically. Update the Scriptorium's implementation when this API ships.

### `workshops` → `codexes` migration in nexus-core

The `GuildConfig` interface in `@shardworks/nexus-core` (`guild-config.ts`) still carries a framework-level `workshops` field with an associated `WorkshopEntry` type. This is legacy — codex registration is plugin config owned by The Scriptorium (read via `guild().config<CodexesConfig>('codexes')`), not a framework-level concern.

Cleanup required:
- Remove `workshops` from `GuildConfig` and `WorkshopEntry` from `guild-config.ts`
- Remove `workshopsPath()` and `workshopBarePath()` from `nexus-home.ts`
- Remove corresponding exports from `index.ts`
- Update `createInitialGuildConfig()` to drop the empty `workshops: {}` default
- Update test helpers in arbor and CLI that set `workshops: {}`
- Update `README.md` in core and CLI packages

The Scriptorium defines its own config types and path helpers internally. Nothing in the framework needs workshop/codex awareness.

=== FILE: docs/architecture/kit-components.md ===
# Kit Components: Tools, Engines & Relays

This document describes the artifact model for the guild's installable capabilities — how tools, engines, and relays are structured, packaged, installed, and resolved. All three follow the same packaging pattern: a descriptor file, an entry point, and a registration entry in `guild.json`. For the broader system architecture, see [overview.md](overview.md). For how relays work within the Clockworks, see [clockworks.md](clockworks.md). For anima composition artifacts (curricula and temperaments), see [anima-composition.md](anima-composition.md).

---

## What they are

**Tools** are instruments wielded by animas during work — operations that animas invoke to interact with guild systems, query information, record notes, and perform operations. A tool can optionally ship with an instruction document (`instructions.md`) that is delivered to the anima when manifested for a session.

Tools are accessible through multiple paths: animas invoke them as MCP tools during sessions; humans invoke them via the `nexus` CLI; relays and other tools can import them programmatically. All paths execute the same logic with the same inputs and outputs — the tool author writes the logic once.

**Engines** are the workhorse components of rigs — the units of work the Spider mounts and sets in motion. An engine does one bounded piece of work, runs when its upstream dependencies are satisfied, and produces a yield when done. Kits contribute engine designs; the Spider draws on them to extend rigs as needed. An engine may be clockwork (deterministic, no anima required) or quick (inhabited by an anima for work requiring judgment). Engines are described by a `nexus-engine.json` descriptor.

**Relays** are Clockworks handlers — purpose-built to respond to events via standing orders. A relay exports a standard `relay()` contract that the Clockworks runner calls. All relays are clockwork. See [clockworks.md](clockworks.md) for the relay contract and standing order mechanics. Relays are described by a `nexus-relay.json` descriptor.

---

## Tool architecture

### The handler model

Every tool is, at its core, a **handler with a defined contract** — inputs, outputs, and the logic between them. The framework provides access paths:

```
┌─────────────────────────────────────┐
│  TOOL (what the author writes)      │
│                                     │
│  handler — a script or module       │
│  instructions.md — anima guidance   │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
  MCP        CLI       import
  (animas)  (humans)  (engines/relays)
    │          │          │
  same input → same code → same output
```

- **MCP** — The manifest engine configures an MCP server that exposes tools as typed, callable tools. The anima sees them as native tools alongside built-in tools like Read, Write, and Bash.
- **CLI** — The `nsg` CLI exposes tools as noun-verb subcommands (`nsg commission create`, `nsg tool install`, etc.).
- **Import** — Engines, relays, and other tools can import module-based handlers directly.

### Two kinds of tools

Tools come in two kinds, determined by the `kind` field in the descriptor (or inferred from the entry point):

#### `module` — a JavaScript/TypeScript module

The entry point exports a handler with a typed schema using the Nexus SDK:

```typescript
import { tool } from "@shardworks/nexus-core";
import { z } from "zod";

export default tool({
  description: "Look up an anima by name",
  params: {
    name: z.string().describe("Anima name"),
  },
  handler: async ({ name }, { home }) => {
    // look up anima using home to find the guild...
    return { found: true, status: "active" };
  },
});
```

The `tool()` factory wraps the params into a Zod object schema and returns a `ToolDefinition` — a typed object that the framework can introspect. The handler receives two arguments: validated params (typed from the Zod schemas) and a framework-injected context (`{ home }` — the guild root path).

For MCP, the Nexus MCP engine dynamically imports the module, reads `.params.shape` for the tool's input schema, and wraps `.handler` as the tool callback. For CLI, Commander options can be auto-generated from the Zod schema. For direct import, other code calls `.handler` as a function.

#### `script` — an executable script

The entry point is any executable — shell script, Python, compiled binary:

```bash
#!/usr/bin/env bash
# get-anima — look up an anima by name
GUILD_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo "$(sqlite3 "$GUILD_ROOT/.nexus/nexus.db" "SELECT * FROM animas WHERE name = '$1'" -json)"
```

Scripts receive arguments as CLI args and return results on stdout (plain text or JSON). The framework wraps them for MCP by shelling out to the script when the tool is called. For CLI, the `nexus` command delegates to the script directly.

This is the lowest-ceremony path — a tool can be a bash script with a one-line descriptor. No SDK, no TypeScript, no build step.

#### Kind inference

If `kind` is not specified in the descriptor, the framework infers it from the entry point:

| Entry point | Inferred kind |
|-------------|---------------|
| `.js`, `.mjs`, `.ts`, `.mts` | `module` |
| `.sh`, `.bash`, `.py`, or executable without extension | `script` |

An explicit `kind` always wins. Inference is a convenience, not magic — if the file extension is ambiguous, specify the kind.

### The MCP engine

Animas don't connect to individual MCP servers per tool. Instead, Nexus provides a single framework engine — the **MCP engine** — that runs as one stdio process per anima session. At session start, the manifest engine determines which tools the anima has access to (based on all of the anima's roles — see [role gating](#role-gating)), then launches the MCP engine configured with that set. The MCP engine loads each tool's handler (importing modules directly, wrapping scripts as shell-out calls) and registers them all as tools.

One process. All the anima's tools. Claude's runtime spawns it at session start and kills it at session end — no daemon management, no manual start/stop.

```
Session starts
  → manifest engine resolves tools for anima's roles
  → launches MCP engine with that tool set
  → Claude connects to MCP engine over stdio

Anima calls dispatch(...)
  → JSON-RPC over stdin to MCP engine
  → MCP engine calls dispatch handler
  → result back over stdout

Anima calls get_anima(...)
  → same process, same pipe

Session ends
  → Claude kills MCP engine process
```

Third-party MCP servers (GitHub, databases, external services) can be connected alongside the guild's MCP engine if needed. The manifest engine configures all of them as part of session setup.

### MCP as a standard protocol

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) is a standard for connecting AI agents to tools. An MCP server exposes typed, callable tools over a standardized protocol (JSON-RPC over stdio). The agent's runtime connects to the server, discovers its tools, and makes them available as native tool calls — typed parameters in, structured results out. No CLI argument parsing or stdout scraping by the agent.

Nexus uses MCP as the transport layer between animas and tools. The tool author doesn't need to know MCP exists — the framework handles the protocol. But because it's a standard, it also means:

- Third-party MCP servers work alongside guild tools with no wrapping
- Guild tools could be used by non-Nexus MCP clients if needed
- Schema validation happens at the protocol level — bad calls fail fast with clear errors

### Instructions: what MCP doesn't provide

MCP exposes three pieces of metadata about a tool: its **name**, a brief **description**, and the **parameter schema** (types, defaults, constraints). This is a reference card — enough to call the tool correctly. It is not enough to call the tool **wisely**.

A tool's `instructions.md` is an optional teaching document that is delivered to the anima as part of its composed identity (system prompt), not as MCP metadata. It provides what a reference card cannot:

- **When to use the tool** — "Always consult the Master Sage before dispatching to artificers"
- **When NOT to use it** — "Don't dispatch if the commission spec lacks acceptance criteria"
- **Workflow context** — "After dispatching, record the commission ID in your notes for the handoff"
- **Judgment guidance** — "Use priority:urgent sparingly — it preempts other work. Include justification in the spec"
- **Institutional conventions** — "Specs should follow the guild's spec format: problem statement, acceptance criteria, constraints"
- **Interaction with other tools** — "If dispatch returns a conflict, use get-anima to check the anima's current commission before retrying"

The MCP schema tells the anima what buttons a tool has. The instructions teach the **craft of using it** — when to reach for it, what judgment to apply, how it fits into the guild's workflows.

Not every tool needs instructions. A simple query tool (`anima-show`) may be fully described by its MCP schema and parameter descriptions. Instructions matter most for tools that require judgment: `commission-create`, `signal`, `anima-create` — tools where knowing the API isn't enough.

Instructions are also **institutional, not intrinsic**. The MCP schema is the tool's own contract — the same everywhere. Instructions reflect the guild's teaching about how to use the tool, and they compose with the rest of the anima's identity (codex, curriculum, temperament). The same tool installed in two different guilds could have different instructions reflecting different policies and workflows.

---

## The descriptor file

Every artifact has a descriptor at its root:

- **`nexus-tool.json`** for tools
- **`nexus-engine.json`** for engines and relays

### Schema

Required fields marked with `*`:

```json
{
  "entry": "index.js",                    // * entry point
  "kind": "module",                       // "module" or "script" (inferred from entry if omitted)
  "instructions": "instructions.md",      // tools only — delivered to animas (optional)
  "version": "1.11.3",                    // upstream version (semver)
  "description": "Post commissions and trigger the manifest engine",
  "repository": "https://github.com/nexus/dispatch",
  "license": "MIT",
  "nexusVersion": ">=0.1.0"              // compatible Nexus version range
}
```

Only `entry` is required. All other fields are optional.

There is no `name` field — the **directory name is the tool's identity**. After installation, the directory name (`dispatch/`, `my-relay/`) is the canonical name. During installation from npm, the directory name is derived from the package name (strip scope: `@shardworks/dispatch` → `dispatch`) or specified with `--name`.

### Kind

The `kind` field tells the framework what shape the entry point is:

| Kind | Entry point | MCP engine behavior | CLI behavior |
|------|-------------|--------------------|-|
| `module` | JS/TS module exporting a Nexus tool | Imports handler, registers as typed tool | Auto-generates Commander options from Zod schema |
| `script` | Any executable | Wraps as shell-out call | Delegates directly |

If `kind` is omitted, it is inferred from the entry point's file extension (see [kind inference](#kind-inference)). An explicit `kind` always takes precedence.

### `package.json` fallback

If a `package.json` also exists in the package, the descriptor fields take precedence. Fields present only in `package.json` (e.g. `version`, `description`, `repository`) are used as fallbacks. This means:

- An npm package can omit duplicated fields from the descriptor and let `package.json` provide them
- A hand-built tool with no `package.json` puts everything in the descriptor
- Either way, the installer resolves from the same merged view

For `entry` specifically: if absent from the descriptor, the installer falls back to `package.json`'s `main` / `exports` / `bin`.

---

## On-disk layout

Each artifact occupies a single directory named after the artifact:

```
GUILD_ROOT/
  tools/
    commission-create/
      nexus-tool.json           →  { "entry": "handler.js", ... }
      instructions.md
    tool-install/
    tool-remove/
    anima-create/
    my-tool/
      nexus-tool.json
      instructions.md
  engines/
    sealing/
      nexus-engine.json         →  { "entry": "index.js", ... }
    open-draft-binding/
      nexus-engine.json
    ci-check/
      nexus-engine.json
  relays/
    summon/
      nexus-relay.json          →  exports relay() default
    notify-patron/
    cleanup-worktree/
  nexus/
    migrations/
      001-initial-schema.sql
```

All artifacts share the same directory structure regardless of origin. Each directory contains a descriptor, and optionally an entry point, instructions, and other files depending on the artifact type and how it was installed.

For **registry** and **git-url** installs, only metadata (descriptor + instructions) is copied to the artifact directory — the runtime code lives in `node_modules/`, managed by npm. For **workshop** and **tarball** installs, the full package source is copied for durability. For **link** installs, only metadata is in the directory — the runtime code is symlinked from the developer's local directory.

All provenance and routing metadata lives in `guild.json`.

---

## Role gating

Tools are gated by role — an anima only has access to tools permitted by its roles. An anima may hold **multiple roles** (e.g. both artificer and sage), and its available tools are the **union** of all tools permitted across all of its roles.

Tools are registered in `guild.json` and assigned to roles:

```json
{
  "baseTools": ["nexus-version"],
  "roles": {
    "steward": {
      "seats": 1,
      "tools": ["commission-create", "commission-list", "anima-create", "tool-install", "signal"],
      "instructions": "roles/steward.md"
    },
    "artificer": {
      "seats": null,
      "tools": ["commission-show", "complete-session", "fail-writ", "create-writ", "list-writs", "show-writ", "signal"],
      "instructions": "roles/artificer.md"
    }
  },
  "tools": {
    "commission-create": {
      "upstream": "@shardworks/nexus-stdlib",
      "package": "@shardworks/nexus-stdlib",
      "installedAt": "2026-03-25T12:00:00Z",
      "bundle": "@shardworks/guild-starter-kit@0.1.0"
    }
  }
}
```

At manifest time, the manifest engine computes the tool set:

```
Anima "Valdris" has roles: [artificer, steward]

  nexus-version    — baseTools              → all animas     ✓
  commission-show  — roles: [artificer]     → artificer      ✓
  signal           — roles: [artificer, steward] → both match ✓
  commission-create — roles: [steward]      → steward matches ✓
  tool-install     — roles: [steward]       → steward matches ✓
  create-writ      — roles: [sage]          → no match       ✗

  Valdris gets: [nexus-version, commission-show, signal, commission-create, tool-install]
```

The MCP engine is launched with this resolved set. The anima sees exactly the tools its combined roles permit — no more, no less.

Engines and relays do not have role gating — they are not wielded by animas directly. Their `guild.json` entries have no role assignments:

```json
{
  "engines": {
    "sealing": {
      "upstream": "@acme/sealing-engine@1.0.0",
      "package": "@acme/sealing-engine",
      "installedAt": "2026-03-23T12:00:00Z"
    },
    "open-draft-binding": {
      "upstream": "@acme/open-draft-engine@1.0.0",
      "package": "@acme/open-draft-engine",
      "installedAt": "2026-03-23T12:00:00Z"
    }
  },
  "relays": {
    "summon": {
      "upstream": "@shardworks/relay-summon@0.1.11",
      "package": "@shardworks/relay-summon",
      "installedAt": "2026-03-23T12:00:00Z"
    },
    "cleanup-worktree": {
      "upstream": "@shardworks/relay-cleanup@0.1.11",
      "package": "@shardworks/relay-cleanup",
      "installedAt": "2026-03-23T12:00:00Z"
    }
  }
}
```

---

## Installation

### The `tool-install` tool

`tool-install` is a stdlib tool for installing new tools, engines, relays, and bundles. It accepts a polymorphic **tool source** argument and classifies it into one of five install types:

| Source pattern | Type | Example |
|----------------|------|---------|
| `--link` flag + local dir | link | `nsg tool install ~/projects/my-tool --link` |
| `workshop:<name>#<ref>` | workshop | `nsg tool install workshop:forge#tool/fetch-jira@1.0` |
| Starts with `git+` | git-url | `nsg tool install git+https://github.com/someone/tool.git#v1.0` |
| Ends with `.tgz` or `.tar.gz` | tarball | `nsg tool install ./my-tool-1.0.0.tgz` |
| Everything else | registry | `nsg tool install some-tool@1.0`, `nsg tool install @scope/tool` |

The install process:

1. Classify the source and install via npm (or symlink for link mode)
2. Find and validate the descriptor (`nexus-tool.json` or `nexus-engine.json`)
3. Determine the artifact name (from `--name`, or derived from package name)
4. Copy metadata or full source to the artifact directory (depending on install type)
5. Register in `guild.json` under `tools`, `engines`, or `relays` as appropriate (determined by descriptor type and module shape)
6. Commit to the guild

Both the CLI (`nsg tool install`) and the MCP tool (wielded by animas) share the same core logic.

### Framework artifacts: workspace packages

Base tools, engines, and relays are separate packages in the Nexus monorepo — each one a complete artifact with its own descriptor, handler module, and (for tools) instructions document. They follow the same artifact shape as any guild-authored component; they just happen to be maintained alongside the framework.

The monorepo is structured as a pnpm workspace:

```
packages/
  core/                          ← @shardworks/nexus-core — shared library (Books, config, paths, install logic)
  cli/                           ← @shardworks/nexus — the CLI operators run
  stdlib/                        ← @shardworks/nexus-stdlib — all standard tools, engines, and relays
  guild-starter-kit/             ← @shardworks/guild-starter-kit — bundle manifest
```

`nsg init` installs base tools, engines, and relays via the guild starter kit bundle, registering them in `guild.json` with bundle provenance.

---

## Local development

During development, use `--link` to symlink a local tool directory into the guild:

```
nsg tool install ~/projects/my-tool --link --roles artificer
```

Changes to the handler are reflected immediately — no reinstall needed. When done iterating, reinstall via a durable method (registry, tarball, workshop).

The simplest possible guild tool is a shell script and a one-line descriptor:

```
my-tool/
  package.json            →  { "name": "my-tool", "version": "0.1.0" }
  nexus-tool.json         →  { "entry": "run.sh" }
  run.sh                  →  #!/usr/bin/env bash ...
```

No SDK, no TypeScript, no build step. The framework infers `kind: "script"` from the `.sh` extension, wraps it for MCP automatically, and the anima can call it as a typed tool.

### Animas building kit components

An anima commissioned to build a new tool or relay works in a workshop worktree like any other commission. When the commission completes:

1. Leadership reviews the output
2. `nsg tool install workshop:forge#tool/my-tool@0.1.0` installs it into the guild from the workshop repo
3. The artifact is now operational — registered in `guild.json`, full source stored in the artifact directory, resolved by the manifest engine

The guildhall is never a workspace — artifacts flow in through deliberate install operations. Since `tool-install` is itself a tool, animas with appropriate access (stewards) can install artifacts directly — enabling the guild to extend its own toolkit autonomously.

---

## Comparison

| | Tools | Engines | Relays |
|---|---|---|---|
| Purpose | Instruments animas wield | Rig workhorses (Spider mounts them) | Clockworks handlers |
| Invoked by | Animas (MCP), humans (CLI), code (import) | Spider (event-driven within a rig) | Clockworks runner (standing order) |
| Descriptor | `nexus-tool.json` | `nexus-engine.json` | `nexus-relay.json` |
| SDK factory | `tool()` | none required (engine logic is the rig work) | `relay()` |
| Instructions doc? | Optional (anima guidance) | No | No |
| Role gating? | Yes | No | No |
| Standard contract? | Yes (MCP) | via rig yield/needs interface | Yes (`relay()`) |
| Triggerable by standing orders? | No | No | Yes (`run:`) |

=== FILE: docs/architecture/plugins.md ===
# Plugin Architecture

This document describes the plugin system — how the guild's capabilities are packaged, installed, and composed. For the broader system context, see [overview.md](overview.md).

---

## Overview

The guild framework ships with no running infrastructure of its own. The Clockworks, the Spider, the Surveyor — everything that makes a guild operational is contributed by plugins. `nsg init` installs a default plugin set; a guild's installed plugins determine what it can do.

This is a deliberate design choice. Keeping the framework core to a plugin loader and a set of type contracts means each piece of infrastructure is independently testable, replaceable, and comprehensible. There is no privileged built-in layer; a core apparatus and a community kit are the same kind of thing.

Plugins come in two kinds:

- **Kits** — passive packages contributing capabilities to consuming apparatuses. No lifecycle, no running state. Read at load time and forwarded to consuming apparatuses.
- **Apparatuses** — packages contributing persistent running infrastructure. Have a `start`/`stop` lifecycle. May include a `supportKit` that exposes their capabilities to the rest of the guild.

**Plugin** is retained as a framework-internal and technical term for "either of the above." It appears in error messages, internal types, and npm package conventions, but is not the primary vocabulary users encounter. The guild vocabulary is Kit and Apparatus.

---

## Kit

A kit is a passive package contributing capabilities to the guild. Kits have no lifecycle — they are read at load time and their contributions are forwarded to consuming apparatuses. Nothing about a kit participates in `start`/`stop` or requires a running system.

```typescript
type Kit = {
  requires?:   string[]
  recommends?: string[]
  [key: string]:  unknown
}
```

A kit is an open record. The contribution fields (`relays`, `engines`, `tools`, or anything else) are defined by the apparatus packages that consume them, not by the framework. `requires` and `recommends` are the only framework-level fields.

**`requires`** is an array of apparatus names whose runtime APIs this kit's contributions depend on at handler invocation time. If a tool contributed by this kit calls `guild().apparatus("books")`, the kit must declare `requires: ["books"]`. Validated at startup — if a declared apparatus is not installed, the guild refuses to start with a specific error. Hard failure, not advisory.

**`recommends`** is an advisory list of apparatus names the kit's contributions are most useful with, used to generate startup warnings when expected apparatuses are absent. Not enforced.

A kit package exports its manifest as the default export:

```typescript
import type { ClockworksKit } from "nexus-clockworks"
import type { SpiderKit }     from "nexus-spider"
import type { AnimaKit }      from "nexus-sessions"

export default {
  kit: {
    requires:   ["nexus-books"],
    recommends: ["nexus-clockworks", "nexus-spider"],
    engines: [createBranchEngine, deleteBranchEngine, mergeBranchEngine],
    relays:  [onMergeRelay],
    tools:   [statusTool, diffTool, logTool],
  } satisfies ClockworksKit & SpiderKit & AnimaKit,
} satisfies Plugin
```

Type safety for contribution fields is provided by the apparatus that consumes them — not by the framework. Each apparatus package publishes a kit interface that kit authors can import and `satisfies` against:

- `ClockworksKit` — defines `relays`. See [ClockworksKit](clockworks.md#clockworkskit).
- `SpiderKit` — defines `engines`. See [Engine Designs](engine-designs.md).
- `AnimaKit` — defines `tools`. See [Tools](anima-lifecycle.md#tools).

Kit authors who don't want or need static type checking simply write a plain object — both approaches are valid.

The framework never inspects contribution field contents. It sees kit records as opaque objects, forwards them to consuming apparatuses via `plugin:initialized`, and cross-references field keys against `consumes` tokens for startup warnings. See [Kit Contribution Consumption](#kit-contribution-consumption).

---

## Apparatus

An apparatus is a package contributing persistent running infrastructure to the guild. It implements a lifecycle in `start` and `stop`. The Clockworks, Spider, and Surveyor are all apparatuses.

```typescript
type Apparatus = {
  requires?:   string[]
  provides?:   unknown
  start:       (ctx: StartupContext) => void
  stop?:       () => void
  supportKit?: Kit
  consumes?:   string[]
}
```

**`requires`** is an array of apparatus names that must be started before this apparatus's `start()` runs. Validated at startup before any `start` is called. Determines start ordering — by the time an apparatus's `start` runs, all its declared dependencies are already started with their `provides` objects populated. Circular dependencies are rejected at load time.

**`provides`** is the runtime API object this apparatus exposes to other plugins. Retrieved via `guild().apparatus<T>(name)`. The reference is created at manifest-definition time and populated during `start`. See [Providing an API](#providing-an-api).

`start(ctx)` is where the apparatus initialises its internal state, registers lifecycle hooks, and wires up its dependencies. `stop()` tears it down. Both may be async — the framework awaits them in dependency-resolved order.

`stop` is optional for apparatuses that have no shutdown logic beyond garbage collection.

A `supportKit` is a Kit that an apparatus composes to expose its capabilities to the rest of the guild — the same open record as any other kit, populated with whatever contribution fields the apparatus's own consuming peers understand. Consuming apparatuses treat `supportKit` contributions identically to standalone kit contributions; the source is an implementation detail callers never see.

An apparatus without a `supportKit` is meaningful — infrastructure that exposes its capabilities only through `provides` (the inter-apparatus API) rather than through the tool/relay/engine surface.

**`consumes`** is an optional array of string tokens declaring which Kit contribution types this apparatus scans for and registers. The tokens correspond to Kit field names (`"engines"`, `"relays"`, `"tools"`, or custom extension types). This declaration enables the framework to generate startup warnings when kits contribute to a type that no installed apparatus consumes. See [Kit Contribution Consumption](#kit-contribution-consumption).

```typescript
const clockworksApi: ClockworksApi = {
  on:    (event, handler) => { ... },
  emit:  (event, payload) => { ... },
  drain: ()               => { ... },
}

export default {
  apparatus: {
    requires: ["nexus-stacks"],
    provides: clockworksApi,

    supportKit: {
      relays: [signalRelay, drainRelay],
      tools:  [signalTool, clockStatusTool],
    },

    start: (ctx) => {
      const stacks = guild().apparatus<StacksApi>("nexus-stacks")
      clockworksApi.init(stacks)
    },

    stop: () => {
      clockworksApi.shutdown()
    },
  },
} satisfies Plugin
```

### Providing an API (`provides`)

An apparatus that exposes a typed API to other plugins declares it via `provides` on the apparatus. This is the object returned when another plugin calls `guild().apparatus(name)`.

```typescript
const clockworksApi: ClockworksApi = {
  on:    (event, handler) => { ... },
  emit:  (event, payload) => { ... },
  drain: ()               => { ... },
}

export default {
  apparatus: {
    requires: ["nexus-stacks"],
    provides: clockworksApi,
    start: (ctx) => { ... },
  },
} satisfies Plugin
```

A stable object reference is created at manifest-definition time and populated during `start`. The reference is stable; the object gains its runtime contents when the apparatus starts.

Plugin authors ship their API type alongside their package so consumers can import and cast safely:

```typescript
import type { ClockworksApi } from "nexus-clockworks"
const clockworks = guild().apparatus<ClockworksApi>("nexus-clockworks")
```

---

## Plugin IDs

Every plugin has a derived **plugin id** — the name used in `guild.json`, `requires` arrays, `guild().apparatus()` calls, and configuration keys. The id is derived from the npm package name at load time and never declared in the manifest.

Derivation rules, applied in order:

1. **Strip the `@shardworks/` scope** — the official Nexus namespace. `@shardworks/clockworks` → `clockworks`. Plugins in this scope are referenced by bare name everywhere.
2. **Retain other scopes as a prefix** — `@acme/my-relay` → `acme/my-relay`. Preserves uniqueness across third-party publishers without special registry entries.
3. **Strip a trailing `-(plugin|apparatus|kit)` suffix** — allows package authors to use descriptive npm names without polluting the plugin id. `my-relay-kit` → `my-relay`. `@acme/cache-apparatus` → `acme/cache`.

Examples:

| npm package name              | Plugin id         |
|-------------------------------|-------------------|
| `@shardworks/clockworks`      | `clockworks`      |
| `@shardworks/books-apparatus` | `books`           |
| `@shardworks/nexus-git`       | `nexus-git`       |
| `@acme/cache-apparatus`       | `acme/cache`      |
| `my-relay-kit`                | `my-relay`        |
| `my-plugin`                   | `my-plugin`       |

Plugin ids are also the keys under which plugin-specific configuration lives in `guild.json` — see [Configuration](#configuration).

---

## The Plugin Type

```typescript
type Plugin =
  | { kit:       Kit }
  | { apparatus: Apparatus }
```

A plugin is either a kit or an apparatus — the discriminating field (`kit` or `apparatus`) is required. All plugin-level concerns (`requires`, `provides`) live inside the respective type where their semantics are defined. The plugin name is always inferred from the npm package name at load time — it is never declared in the manifest.

---

## Dependencies

Both kits and apparatuses may declare `requires`, but the semantics differ:

**Apparatus `requires`** — two effects: validates that declared dependencies are installed, and determines start ordering. By the time the apparatus's `start()` runs, all declared dependencies are already started.

```typescript
export default {
  apparatus: {
    requires: ["nexus-clockworks", "nexus-stacks"],
    start: (ctx) => {
      const clockworks = guild().apparatus<ClockworksApi>("nexus-clockworks")
      const stacks     = guild().apparatus<StacksApi>("nexus-stacks")
      // ...
    },
  },
} satisfies Plugin
```

**Kit `requires`** — one effect: validates that declared apparatuses are installed and will be started. No ordering concern (kits have no `start`). Ensures that tools contributed by the kit can safely call `guild().apparatus(name)` at handler invocation time without a runtime failure.

```typescript
export default {
  kit: {
    requires: ["nexus-books"],
    tools:    [writeNoteTool, readNoteTool],
  },
} satisfies Plugin
```

Both produce the same operator-facing failure: a loud, early, specific error at guild startup before any agent does any work.

The framework validates all `requires` declarations at startup — before any `start` is called. If a declared dependency is not installed, the guild refuses to start with a specific error naming the missing plugin. Circular dependencies are rejected at load time.

### `recommends`

Both kits and apparatuses may declare `recommends` — advisory dependencies that generate startup warnings but do not prevent startup. Use `recommends` for soft dependencies needed by optional capabilities:

```typescript
export default {
  apparatus: {
    requires:   ["stacks"],
    recommends: ["loom"],     // summon() needs it, animate() doesn't
    // ...
  },
} satisfies Plugin
```

If a recommended plugin is not installed, Arbor logs a warning at startup but proceeds normally. The apparatus is responsible for producing a clear runtime error if the missing dependency is actually needed (e.g. "summon() requires The Loom apparatus to be installed").

---

## Internal Model

The framework maintains two separate internal lists — `LoadedKit[]` and `LoadedApparatus[]` — because they have genuinely different lifecycles:

```typescript
type GuildManifest = {
  kits:        LoadedKit[]
  apparatuses: LoadedApparatus[]
}
```

Lifecycle management (start ordering, shutdown) operates on the apparatus list. Kit records are loaded and cached; their contributions are surfaced via `guild().kits()` and `guild().apparatuses()` for consuming apparatus to pull from.

Each consuming apparatus maintains its own registry of the contribution types it understands. A Clockworks apparatus maintains a relay registry populated from both standalone kit packages and apparatus `supportKit`s; callers of the Clockworks API see a single relay list regardless of source. The framework does not maintain cross-apparatus registries — contribution type semantics belong to the apparatus that defined them.

---

## Kit Contribution Consumption

A kit is passive — it declares contributions but has no awareness of whether any apparatus is present to consume them. The Clockworks doesn't know which relays are installed until it scans at startup; a relay kit doesn't know whether Clockworks is installed. This loose coupling is intentional: kits and apparatuses can be authored and published independently.

But loose coupling creates a practical problem. An operator installs a relay-heavy kit expecting event handling to work, forgets to install the Clockworks, and gets silent inertness with no indication anything is wrong. The framework addresses this without compromising kit purity or imposing hard couplings.

### Reactive Consumption

Consuming apparatuses register kit contributions reactively using the `plugin:initialized` lifecycle event. The Clockworks, for example, handles both kits already loaded and kits that arrive later in the load sequence:

```typescript
// inside Clockworks apparatus start()
start: (ctx) => {
  for (const p of [...guild().kits(), ...guild().apparatuses()]) { registerRelays(p) }
  ctx.on("plugin:initialized", (p) => registerRelays(p))
}
```

`guild().kits()` and `guild().apparatuses()` return snapshots of everything loaded so far. `ctx.on("plugin:initialized")` fires for each subsequent plugin as it completes loading. Together they cover the full sequence without requiring load-order guarantees between the Clockworks and any particular relay kit.

Kits declare; apparatuses consume. Neither needs to know about the other at authoring time.

### Startup Warnings

The Arbor cross-references Kit contributions against installed apparatus `consumes` declarations at startup and emits advisory warnings for mismatches. These are coherence checks, not hard errors — a guild without a Clockworks may be a perfectly valid configuration.

Warning conditions:
- A kit contributes a type (`relays`, `engines`, `tools`, or a custom token) and no installed apparatus declares `consumes` for that token.
- A kit declares `recommends: ["nexus-clockworks"]` and that apparatus is not installed.

```
warn: nexus-signals contributes relays but no installed apparatus consumes "relays"
      consider installing nexus-clockworks (recommended by nexus-signals)

warn: nexus-git contributes engines but no installed apparatus consumes "engines"
```

Warnings surface at startup where an operator can act on them — not silently at runtime when a commission fails because no Spider is present.

### Design Notes

Several alternatives were considered before arriving at this approach:

**Kits declare hard dependencies on consuming apparatuses** — rejected. Too strong. Prevents speculative installation, blurs the Kit/Apparatus distinction by giving kits lifecycle concerns, and makes kit authoring more complex for a case that is often not an error.

**Consuming apparatuses silently scan without declaring `consumes`** — rejected. Leaves the framework unable to generate useful warnings. An operator has no way to know whether inert contributions are intentional or a configuration mistake.

**Framework-owned contribution type registry** — rejected. Requires the framework to know about contribution types like `relays` or `engines`, coupling Arbor to apparatus semantics it doesn't need to understand. Type safety for contribution fields belongs to the apparatus packages that define them; kit authors opt into that safety by importing the relevant interfaces. Arbor's concern is loading and warning, not interpreting.

The chosen approach — open `Kit` record with apparatus-published interfaces for type safety, reactive apparatus consumption via `plugin:initialized`, optional `recommends` on kits, `consumes` on apparatuses, advisory startup warnings — keeps each concern where it belongs and surfaces configuration mistakes without imposing constraints that would make valid configurations impossible.

---

## StartupContext

The context passed to an apparatus's `start(ctx)`. Provides lifecycle event subscription — the only capability that is meaningful only during startup. All other guild access goes through `guild()`.

```typescript
interface StartupContext {
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void
}
```

`ctx.on('plugin:initialized', handler)` fires after each plugin completes loading. Used by consuming apparatus to register kit contributions reactively — see [Reactive Consumption](#reactive-consumption).

---

## The Guild Accessor

Tool, engine, and relay handlers access guild infrastructure through the **guild accessor** — a process-level singleton set by Arbor at startup:

```typescript
import { guild } from '@shardworks/nexus-core'

// Inside a handler:
const { home } = guild()                          // guild root path
const stacks = guild().apparatus<StacksApi>('stacks')  // apparatus API
const cfg = guild().config<MyConfig>('my-plugin')       // plugin config
const full = guild().guildConfig()                       // full guild.json
```

```typescript
interface Guild {
  readonly home: string
  apparatus<T>(name: string): T
  config<T = Record<string, unknown>>(pluginId: string): T
  guildConfig(): GuildConfig
  kits():        LoadedKit[]
  apparatuses(): LoadedApparatus[]
}
```

The guild instance is created by Arbor before apparatus start and is available throughout startup and at runtime. Calling `guild()` at module scope (before Arbor runs) throws with a clear error message. Always call it inside a handler or `start()`, never at import time.

For testing, `setGuild()` and `clearGuild()` are exported from `@shardworks/nexus-core` to wire a mock instance.

---

## Configuration

Plugin-specific configuration lives in `guild.json` under the plugin's derived id — the same id used in `requires` arrays and `guild().apparatus()` calls.

### Config in `guild.json`

Plugin config sections sit alongside the framework-level keys at the top level of `guild.json`. Because plugin ids are derived from package names, the standard apparatus get natural short keys — no special handling required:

```json
{
  "name":     "my-guild",
  "nexus":    "0.1.x",
  "plugins":  ["clockworks", "stacks", "animator", "..."],
  "settings": { "model": "claude-opus-4-5" },

  "codexes": {
    "settings": { "maxMergeRetries": 3 },
    "registered": { "my-app": { "remoteUrl": "git@github.com:patron/my-app.git" } }
  },
  "clockworks": {
    "events":        { ... },
    "standingOrders": [...]
  },
  "animator": {
    "sessionProvider": "claude-code"
  }
}
```

Third-party apparatus follow the same pattern under their derived id:

```json
{
  "acme/cache": {
    "ttl": 3600
  }
}
```

### Typed config via module augmentation (recommended)

`GuildConfig` types only the framework-level keys (`name`, `nexus`, `plugins`, `settings`, etc.). Plugin config sections are additional top-level keys that the base type doesn't model. The recommended approach is **module augmentation**: each plugin declares its config interface and augments `GuildConfig` so the section is typed.

```typescript
// In your plugin's types file:

export interface ClockworksConfig {
  maxConcurrent?: number;
  events?: Record<string, EventDeclaration>;
  standingOrders?: StandingOrder[];
}

declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    clockworks?: ClockworksConfig;
  }
}
```

Once augmented, code that imports your plugin's types gets typed access through `guildConfig()` with no manual cast:

```typescript
// Inside apparatus start():
const config = guild().guildConfig().clockworks ?? {};
const maxConcurrent = config.maxConcurrent ?? 2;
```

The augmentation is visible wherever your plugin's types are imported — which is exactly where it matters: inside the plugin itself, and in any consuming plugin that imports your types.

**Guidelines:**
- Define the config interface in your plugin's public types file, alongside the API types.
- Export the config interface from your package barrel so consumers can import it.
- Make the augmented property optional (`clockworks?: ClockworksConfig`) — the section may not be present in guild.json.
- Ship the augmentation in the same file as the config interface. It takes effect when any type from that file is imported.

### `config<T>(pluginId)` (untyped fallback)

For cases where module augmentation is not practical (dynamic plugin ids, third-party plugins whose types you don't import), `guild().config<T>(pluginId)` provides untyped access:

```typescript
const cfg = guild().config<{ maxConcurrent?: number }>('clockworks');
```

Returns `guild.json[pluginId]` cast to `T`, or `{}` if no section exists. The generic type parameter is an unchecked assertion — the framework does not validate config shape.

Prefer module augmentation over `config<T>()` for any plugin you control. The augmented path gives you type safety without a cast at every call site.

### `guildConfig()`

Returns the full parsed `GuildConfig` — includes both framework-level fields (`name`, `nexus`, `plugins`, `settings`) and any plugin config sections added via module augmentation:

```typescript
const { settings } = guild().guildConfig()
```

---

## Lifecycle Hooks

Apparatus plugins subscribe to guild lifecycle events inside `start` via `ctx.on()`:

```typescript
apparatus: {
  start: (ctx) => {
    ctx.on("plugin:initialized",  (p)    => { ... })  // a kit or apparatus has finished loading
    ctx.on("guild:shutdown",      ()     => { ... })
  },
}
```

Handlers may be async. The framework awaits each handler in turn before invoking the next — handlers for the same event run sequentially, not concurrently. This gives each handler predictable execution order without requiring them to be synchronous.

The interface is open-ended — new lifecycle events do not require interface changes. Apparatuses subscribe to what they need.

**`plugin:initialized`** fires after each plugin (kit or apparatus) completes loading, with the loaded plugin record as its argument. Used by consuming apparatuses to register kit contributions reactively — see [Reactive Consumption](#reactive-consumption).

---

## Static vs. Dynamic Contributions

**Static contributions** — anything knowable at manifest-definition time — belong in the manifest. The framework reads manifests before any `start` is called.

Examples: kit contents, the `provides` object reference.

**Dynamic contributions** — things that require a running apparatus — are registered in `start`.

The Kit/Apparatus split makes this concrete: everything contributed by a kit is inherently static (kits have no `start`). Dynamic wiring can only happen inside an apparatus's `start()`. Prefer declaring contributions in a kit or `supportKit` over wiring them dynamically in `start` wherever possible — every contribution moved from a runtime hook into a kit declaration eliminates a lifecycle ordering concern.

---

## Failure Modes

**Missing dependency** — a plugin declares `requires: ["nexus-clockworks"]` and that plugin is not installed. Loud startup failure before any apparatus starts: *"nexus-spider requires nexus-clockworks, which is not installed."*

**Plugin provides nothing** — `guild().apparatus("nexus-git")` where the apparatus has no `provides`. Returns a sentinel; throws with a useful message on access.

**Bad cast** — `guild().apparatus<WrongType>("nexus-clockworks")`. Runtime error when the wrong method is called. Accepted tradeoff: the coupling is explicit in `requires` and visible in the type import; the developer takes responsibility for getting the type right.

---

## Installation

Installed plugins are declared in `guild.json`:

```json
{
  "plugins": [
    "nexus-clockworks",
    "nexus-spider",
    "nexus-surveyor",
    "nexus-stacks",
    "nexus-git"
  ]
}
```

The `"plugins"` key uses the internal term — users simply list package names. The framework determines whether each is a kit or apparatus at load time by inspecting the package manifest. No user-side declaration of the type is needed.

The framework loads plugins in declaration order, resolves the dependency graph, validates all `requires` declarations, and calls `start` on each apparatus in dependency-resolved order. All kits are loaded and cached before any apparatus starts, ensuring that kit contributions are available when apparatus `start()` handlers run. `nsg init` populates a default plugin set; additional plugins are added via `nsg install`.

### CLI Surface

```sh
nsg install nexus-clockworks
nsg install nexus-git
nsg remove  nexus-git
```

The `nsg install` command does not require specifying kit or apparatus — the package declares what it is. The distinction surfaces in `nsg status`, where apparatuses and kits appear in separate sections: apparatuses as running infrastructure, kits as passive capability inventory.

---

## Future Enhancements

### Apparatus Health Checks

A `health()` method on `Apparatus` is a natural addition once operational tooling matures:

```typescript
health?: () => "ok" | "degraded" | "down"
```

This would enable `nsg status` to report live apparatus health, and give operators a fast signal when infrastructure is degraded without needing to inspect logs. Deferred until there is a concrete operational need to drive the contract design.

### Dynamic Kit Discovery in Handlers

The current model supports tool-to-tool calls via direct import — if a handler needs the logic from another tool in a known kit, it imports that handler function directly. No framework involvement is required for this case.

A second pattern — dynamic discovery of kit contributions at handler invocation time — is not yet supported. This would allow a handler to discover all installed contributions of a given type without knowing which kits are present at author time (e.g., "run all installed pre-commit hooks"). A `guild().fromKit(type, name?)` or similar API is the likely shape. Deferred until a concrete use case motivates the contract.

=== FILE: docs/architecture/rigging.md ===
# The Rigging System

The rigging system is the guild's execution pipeline — the apparatus that convert a ready writ into completed work. When the Clerk signals that an obligation is ready, the rigging system takes over: assembling the rig, running its engines, and reporting back when the work is done.

The rigging system is not a single apparatus. It is four apparatus working in concert, each owning a distinct concern, plus two foundational apparatus (Summoner and Clerk) that it depends on.

---

## Apparatus

### Spider

The Spider is the spine of the rigging system. It owns the rig's structural lifecycle from spawn to completion — and nothing else. The Spider does not know how to resolve capabilities, run engines, or manage AI sessions; it delegates all of those to other apparatus. What it does:

- Spawn a rig when the Clerk signals a writ is ready
- Traverse all active rigs, identifying engines whose upstream is complete
- Request capability chains from the Fabricator and graft them onto the rig
- Dispatch ready engines to the Executor
- Strike completed rigs and signal the Clerk

The Spider runs continuously — not bound to any single rig or commission.

### Fabricator

The Fabricator is the guild's capability catalog — the authoritative collection of engine design specifications. Every installed kit contributes its engine designs to the Fabricator at startup. When an engine in a rig declares a need it cannot yet satisfy, the Spider queries the Fabricator:

```
fabricator.resolve(need, installedKits) → EngineChain
```

The Fabricator returns the chain of engine designs that satisfies the need; the Spider grafts that chain onto the rig. The Fabricator does not touch the rig — it is a pure query service.

The Fabricator is also consulted directly by planning animas (Sages) when decomposing a commission: before planning work, a Sage can introspect what the guild is actually capable of building.

### Executor

The Executor runs engine instances. It is the substrate abstraction layer — the Spider calls `executor.run(engine, inputs)` for any ready engine, without knowing or caring whether the engine runs locally, in a Docker container, on a remote VM, or otherwise.

The Executor handles two engine kinds:

- **Clockwork engines** — deterministic, no AI. The Executor runs the engine code directly against its configured substrate.
- **Quick engines** — AI-backed. The Executor calls the Manifester to compose the anima's session context, then the Summoner to launch and manage the AI session. The yields are the session's output.

From the Spider's perspective, both kinds look identical: givens in, yields out.

### Manifester *(dependency)*

The Manifester is a foundational apparatus, not rig-specific, but the Executor depends on it for quick engine execution. Given an anima identity and writ context, the Manifester assembles the complete session context: curriculum, temperament, charter, tool instructions. It is a deterministic composition step — no AI involved. The Executor calls the Manifester before calling the Summoner.

### Summoner *(dependency)*

The Summoner is a foundational apparatus used by more than the rigging system — the Clockworks Summon Relay also calls it directly for standing-order-triggered dispatches. Within the rigging system, the Executor calls the Summoner to launch AI sessions for quick engines. The Summoner manages the session lifecycle and records results in the Daybook.

### Clerk *(dependency)*

The Clerk owns the obligation layer. It signals the Spider when a writ is ready for a rig, and receives completion signals when a rig is struck. The rigging system reports back to the Clerk but does not manage writs itself.

---

## Execution Flow

| # | Step | Apparatus |
|---|------|-----------|
| 1 | Writ becomes ready; spawn initial rig | **Spider** *(triggered by Clerk)* |
| 2 | Engine declares a need; scan installed kits; determine satisfying engine chain | **Fabricator** |
| 3 | Graft resolved engine chain onto rig structure | **Spider** *(using Fabricator output)* |
| 4 | Traverse active rigs; identify engines whose upstream is complete | **Spider** |
| 5 | Execute ready engine — clockwork or quick, any substrate | **Executor** *(routes to substrate or Manifester → Summoner)* |
| 6 | Record engine yields; propagate completion state to downstream engines | **Executor** *(yields)* → **Spider** *(state propagation)* |
| 7 | Detect rig fully complete; signal Clerk; strike rig | **Spider** → **Clerk** |

Steps 2–3 repeat as needed throughout a rig's life — engines declare needs at runtime, and the rig grows as it runs. Steps 4–6 also repeat in a continuous traversal loop. Steps 1 and 7 are the lifecycle bookends.

---

## Design Rationale

### Why Fabricator is separate from Spider

The natural first instinct is to put capability resolution inside the Spider — it's the Spider that needs the answer, after all. The Fabricator earns its independence from two directions:

1. **The Sage case.** Planning animas need to know what the guild can build before they decompose a commission into writs. If capability resolution is internal to the Spider, the Sage has no clean way to query it. A standalone Fabricator is a shared service both the Spider and the Sage can call.

2. **Separation of concerns.** The Spider's job is motion — advancing what's already planned. Capability reasoning ("what engines can satisfy this need, given the installed kits?") is a different cognitive mode. Keeping them separate keeps both apparatus well-scoped and independently testable.

### Why Executor handles both engine kinds

From the Spider's perspective, clockwork and quick engines are the same shape: givens in, yields out. Unifying execution in the Executor means the Spider has one dispatch call for any engine type, and the distinction between "run some code" and "run an AI session" lives entirely within the Executor. The substrate-switching logic (local vs Docker vs remote VM) and the AI session management logic are both Executor concerns — neither bleeds into the Spider.

### Why Summoner is not rig-specific

The Summoner manages agentic AI sessions wherever they're needed — not just in rigs. The Clockworks Summon Relay dispatches animas in response to standing orders without going through the rigging system at all. Making the Summoner a foundational apparatus (not a Spider dependency) reflects this: the Executor uses the Summoner, but the Summoner doesn't know it's inside a rig.

### Clerk / Spider boundary

The Clerk and the Spider are in contact at two points — writ-ready signals in, completion signals out — but own entirely different domains:

- The **Clerk** tracks obligations: what has been commissioned, what is owed, what state each writ is in.
- The **Spider** tracks execution: what rigs are active, what engines are running, what has been completed.

Writs can exist without rigs (awaiting planning or dependencies). Rigs always trace back to a writ. The boundary keeps the obligation record clean from execution machinery.

---

## Dependencies

```
             Clerk
               │ (writ:ready / rig:complete)
               ▼
            Spider ──────────────── Fabricator
               │
               ▼
            Executor
           /        \
    (clockwork)   (quick)
        │              │
    substrate      Manifester
   (local/          │
  docker/vm)      Summoner
                    │
                  Stacks (Daybook)
```

The Spider is the only rigging apparatus that touches the Clerk. The Executor is the only rigging apparatus that touches the Summoner. The Fabricator is a stateless query service with no downstream dependencies of its own — it reads from the kit registry provided by installed plugins at startup.

=== FILE: docs/guild-metaphor.md ===
# The Guild Metaphor

> **Tone guidance for authors:** This document describes the guild as a *guild* — from the perspective of its members, its patron, and its traditions. Write as though explaining how a craftsman's guild operates, not how a software system is architected. Technical details (database schemas, API contracts, status enums) belong in the reference docs under `docs/reference/`. If you find yourself writing implementation specifics, you're in the wrong register.
>
> **On pluralization:** Where terms derive from Latin or other classical roots, this document uses English plurals throughout — *animas* not *animae*, *codexes* not *codices*. Accessibility over pedantry.

The guild metaphor is the organizing model for Nexus Mk 2.1. It maps the structure and operations of a craftsman's guild onto a multi-agent AI system — not as decoration, but as a conceptual framework that makes the system's architecture legible to both humans and agents.

## The Guild and Its Patron

### Guild

The whole system. The guild is the top-level container for all agents, resources, and activity. There is one guild.

### Patron

The human. The patron commissions work from the guild and consumes what it delivers. The patron interacts through the guild's interfaces — CLI, status reports, delivered works — and judges those works by using them. The patron may assign codexes as targets for commissions ("build the next thing in this codex"), but does not direct how the guild organizes its labor.

## Members

### Anima

The fundamental unit of identity in the system. An anima is an ephemeral presence (akin to a spirit) animated by an AI agent. They have a persistent identity that is manifested when called upon, composed from the anima's own nature (training, temperament, etc.) and the guild's institutional records each time they are needed. The word comes from Latin, meaning "animating principle" — the thing that makes something alive rather than mechanical. Between manifestations, an anima exists in the register as identity and history; the guild maintains their continuity, not the individual.

This is the core distinction in the system: **animas are animated** (backed by AI, capable of judgment, spirited), **engines are inanimate** (no AI, purely mechanical).

#### States

Every anima exists in one of two states:

| State | Meaning |
|-------|---------|
| **Active** | On the roster, available for dispatch or currently working. This is a working anima. |
| **Retired** | No longer active. The anima's record persists in the register forever, but they are no longer dispatchable. |

### Roles

A function in the guild, filled by zero or more members. Roles define *what kind of work* a member performs and *when they are invoked*. Roles are not a fixed set — a guild defines its own roles to match how it organizes its work. New roles can emerge as the guild evolves; old ones can be retired.

A guild might have planners and builders, or architects and developers, or a single generalist role that does everything. The organizational structure is the guild's choice. As a concrete example:

| Role | Function |
|------|----------|
| **Artificer** | Executes tasks. Receives planned work and builds the thing. |
| **Sage** | Plans work. Decomposes commissions, refines vague instructions into concrete writs with acceptance criteria. |
| **Master Sage** | Senior sage. Reviews incoming commissions, determines scope, and may convene a Council of Sages for complex cases. |

Other roles (Guildmaster, Coinmaster, Oracle, Instructor, and others) are anticipated but not yet defined.

### Tool

A tool an anima actively wields during work. Tools are the guild's toolkit — instruments that animas use to interact with guild systems, query information, record notes, and perform operations. Each tool ships with instructions that are delivered to the anima when manifested for a session, so the anima knows how to use its tools.

Distinct from engines: tools are instruments the anima wields during work; an engine is the work context the anima staffs — or that runs without one. An anima uses a tool to act; an anima staffs an engine to fulfill a commission.

### Relic

An artifact the guild depends on but does not maintain or fully understand. Load-bearing and sacred, not deprecated — a relic is respected for what it carries. Relics are a natural lifecycle stage for tools built fast during periods of rapid growth.

## Work

### Commission

The patron's act of requesting work. The patron commissions work; the guild determines how to fulfill it. A commission might call for something large — "build me a notification system" — or something small — "fix this bug." The guild receives the commission and decides how the labor should be organized.

A commission describes **origin** — it is the patron's request, the act that sets the guild to work. It does not imply a particular size or shape of labor. That's for the guild to determine.

### Writ

When the guild receives a commission, it issues a **writ** — the guild's formal record of what has been asked for. A writ captures the obligation: what must be done, how it stands, and how it relates to other work. Writs persist in the guild's books regardless of how the work is ultimately carried out.

Writs are how the guild gives shape to labor at every scale. A writ might describe a broad undertaking or a narrow task. The guild chooses its own vocabulary for the kinds of writs it issues — *feature*, *task*, *step*, *bug*, or whatever fits the craft. The vocabulary is the guild's; the framework imposes no fixed hierarchy.

When a writ is concrete enough to act on, it spawns a **rig** to carry the obligation through. The writ names what is owed; the rig does the work. A writ may exist without a rig — still being weighed or planned — but every active rig traces back to a writ.

### Rig

The working structure assembled to fulfill a commission. A rig is seeded at commission time — a minimal starting point representing what must be achieved. From there the Spider builds it out: adding engines and arranging them in sequence, each depending on the work of those before it. Some engines are clockwork; others are quick — inhabited by an anima. A rig is never delivered to the patron; it is the scaffolding that enables delivery. When the work is done, the obligation is fulfilled and the rig is struck.

Rigs are dynamic. Any engine whose work is not yet complete may be replaced with a chain of engines, allowing the rig to grow and adapt as the work unfolds. Engines that have completed their work are fixed — their yield is final.

### Engine

Engines are the workhorse components of a rig — purpose-built machines the guild puts to work. Each engine does one bounded piece of work: runs when its upstream work is ready, produces a yield when done. The same engine design may run in many rigs at once, each working independently. Kits bring engine designs to the guild; the Spider mounts them as each rig demands.

Two kinds:

- **Clockwork** — deterministic, requiring no creative judgment. The press that stamps, the bellows that blow, the mill that grinds. Runs on the yield of upstream work; produces its own yield when done.
- **Quick** — *quick* in the guild's sense: alive, inhabited by an anima. The engine defines the work and holds the anima's context; the anima brings the judgment the work requires. When the anima seals their work, the engine's yield is complete.

The distinction between anima and engine holds even for quick engines: the anima is the intelligence; the engine is the work context. A craftsman at a machine — the craftsman brings the skill; the machine defines the task.

An engine moves through three states: *idle* (upstream work not yet complete), *working* (running, yield not yet ready), and *complete* (yield ready, downstream work may proceed). Completed engines are fixed — their yield is final.

### Works

The guild's output — what is delivered to the patron. Works are intentionally vague: running software, usable tools, deployed services, solved problems. The patron judges works by using them. What counts as a work is defined by what the patron can touch, run, or interact with.

Works vary in kind. Some accumulate across many commissions; some are produced once and delivered; some are the incidental yield of a single engine run. The guild's vocabulary for its works:

#### Binding *(canonical)*

A body of inscriptions that compels a system to behave. The guild's primary and most complex work product. Bindings live in codexes, accumulate across successive commissions, and govern the behavior of running systems.

| Term | Definition |
|------|------------|
| **Binding** | The complete body of inscriptions in a codex governing a system's behavior |
| **Sealed binding** | The authoritative, operative binding — what currently governs the system |
| **Draft binding** | A binding in progress — being shaped by an anima or engine, not yet authoritative |
| **Inscription** | A discrete addition to a draft binding. The anima inscribes; the draft grows |
| **Sealing** | The act of incorporating a draft binding into the sealed binding |
| **Abandoning** | Setting a draft binding aside without sealing. The work persists in the Daybook but never becomes authoritative |
| **Edition** | The sealed binding at a specific significant moment — marked, versioned, and distributed |

A commission arrives; the Spider opens a draft binding from the codex; an anima staffs the engine — inscribing changes, building up the draft. When the anima signals completion, the sealing engine incorporates the draft into the sealed binding. The codex grows. If the draft contradicts the sealed binding, the sealing engine seizes; the draft must be reconciled before sealing can proceed.

A codex may have multiple draft bindings open simultaneously. Each is independent. Each must be sealed or abandoned on its own terms.

> *A note on register:* The binding vocabulary — sealed binding, draft binding, inscription, sealing, edition — keeps the system's language consistent with the broader guild metaphor rather than replacing git terminology with more evocative equivalents. These terms are unlikely to appear in introductory presentations; a speaker would say "the AI opens a branch, does its work, and merges back" and the audience would follow without friction. What the binding vocabulary does is prevent register breaks for those who have internalized the guild metaphor. Use plain git terms (branch, commit, merge) in examples where precision matters; reserve the binding vocabulary for reference documentation and internal system language.

#### Other Works

**Document** — a written work: analysis, specification, research, report. Produced by an anima; has a draft and sealed state but does not accumulate across commissions.

**Model** — a trained artifact: an ML model, fine-tune, or embedding. Each training run produces a discrete iteration rather than accumulating inscriptions.

**Yield** — the incidental output of an engine run: statistics, metrics, data products. No draft/sealed lifecycle; not tracked in the Ledger.

## Codexes

The canonical record of a body of work — assigned to the guild by the patron or maintained for its own operations. The guild works *toward* a codex across successive commissions, each one inscribing more into it.

Some codexes hold works for the patron — applications, services, deployed systems. Others are purely guild infrastructure, maintained for the guild's own operations.

## Knowledge & Training

### Charter

The guild's institutional body of policy, procedure, and operational standards — the governing document all members follow. Maintained by leadership. The charter defines how the guild operates: procedures, standards, policies, and environmental facts. Every anima receives the charter when manifested for a session.

### Curriculum

A named, versioned, immutable body of training content. A curriculum defines what an anima knows and how it approaches work — skills, craft knowledge, methodology. Curricula are never edited after creation; new thinking produces a new version. The Thomson curriculum v2 is a distinct artifact from v1.

### Temperament

A named, versioned, immutable personality template. A temperament governs an anima's disposition, communication style, and character — who they are, as distinct from what they know (curriculum) or what they must do (charter). Same lifecycle as curricula: immutable per version, new thinking produces a new version.

## Infrastructure

### Apparatus

A named, persistent, deterministic system that predates any commission and outlasts any rig is an **apparatus** — the guild's operational fabric. Apparatus are always running; they hold no craft, no spirit, no judgment. Where animas are animated and engines do the work of rigs, apparatus are the guild itself in continuous operation. The Clockworks, the Spider, and the Surveyor are the guild's core apparatus. The set is not fixed — a guild may install additional apparatus as its needs grow.

### Kit

A bundle of engine designs and anima tools contributed to extend what the guild can build. A kit declares what needs it can meet, what prior work it requires, and what chain of engines it will assemble to meet those needs. The Spider draws from installed kits when extending a rig — a guild's installed kits determine what work it can take on.

Kits are the guild's extension points. A guild without kits can accept commissions but cannot fulfill them. Each installed kit extends the range of work the Spider can set in motion.

### The Clockworks

The guild's nervous system — an event-driven layer that connects things that happen to things that should respond. The Clockworks keeps its own records of what it has seen and how it responded — these are its own working memory, not part of the guild's Books. The Clockworks processes events according to the guild's standing orders, turning the guild from a tool the patron operates into a system that operates itself.

#### Relay

An engine purpose-built to respond to Clockworks events. A relay does not judge whether to respond — that judgment lives in the standing order that names it. The relay is the guild's standing commitment to act.

All relays are clockwork. The summon relay is the built-in relay that handles anima session dispatch — when a standing order calls for an anima, the summon relay resolves the role, binds a writ, and launches the session.

#### Standing Order

A registered response to an event, defined in `guild.json`. A standing order says: *whenever this event is signaled, do this*. All standing orders invoke relays via the `run` verb. The `summon` verb is syntactic sugar — it invokes the **summon relay**, which manifests an anima in the named role and delivers the event as their context. Standing orders may carry additional params (like `maxSessions` for the circuit breaker) that configure the relay's behavior. Standing orders are guild policy — they live in configuration, not in relay code.

### The Spider

The apparatus that keeps all active rigs in motion. The Spider moves continuously through every active rig — not bound to any single commission, predating and outlasting them all. When an engine is ready to run, the Spider sets it in motion: starting a clockwork engine or summoning an anima for a quick one. When an engine declares a need the rig cannot yet satisfy, the Spider extends the rig — drawing on installed kits to add the engines needed to meet it.

The rig grows as it runs. The Spider is why.

### The Surveyor

The apparatus that maintains the guild's knowledge of its codexes. When a codex is registered, the Surveyor inspects it — determining what kinds of work are applicable and how each is fulfilled for that specific codex. When a codex changes, the Surveyor updates its records. The guild's ability to seed rigs from commission text depends on the Surveyor's knowledge: without a current survey, the guild cannot reliably turn a patron's words into a working rig.

The Surveyor's records live in the guildhall, not in the codexes themselves — a survey is the guild's understanding of a codex, not part of the codex's own inscriptions.

### The Guildhall

The guild's institutional center — a home, not a codex. The guildhall is where the charter hangs on the wall, where the tools are stored, where the register is kept, where training content lives. Work doesn't happen here; this is where the guild's knowledge, configuration, and equipment are maintained. Always present, always accessible.

Distinct from codexes: codexes are where the guild's inscriptions accumulate. The guildhall is the building they come from — the place that tells them who they are and equips them for the job.

## The Books

The guild keeps its **Books** in the guildhall — the operational records that accumulate as the guild works. The Books record what the guild *has done*; the guildhall's configuration defines what the guild *is*.

### Register

The authoritative record of every anima that has ever existed. The register is the guild's institutional memory of its people — it contains active members and retired animas. Each entry records the anima's name, composition, role assignments, and full state history. Updated when members join or retire; consulted whenever an anima is called to work.

### Roster

The active subset of the register. The roster is a filtered view, not a separate store — it shows all animas currently in `active` state. The roster is the system's source of truth for "who can do what right now," including each anima's role and current assignment.

### Ledger

The book of work. What has been commissioned and how labor is organized. The Ledger records commissions, assignments, and writs — the guild's tracked work items. It is the guild's transaction record: what was asked for, who is doing it, and how far along it has come.

### Daybook

The chronicle. What happened, when, and what it cost. The Daybook records sessions and the audit trail — the raw chronological account of guild activity. Nothing reads the Daybook to decide what to do next; it exists so the guild can look back and understand what occurred.

The name comes from bookkeeping: a daybook is the chronological journal of transactions before they are posted to the ledger. The Daybook is the raw record of activity; the Ledger is the structured record of work.

=== FILE: packages/plugins/animator/src/types.ts ===
/**
 * The Animator — public types.
 *
 * These types form the contract between The Animator apparatus and all
 * callers (summon relay, nsg consult, etc.). No implementation details.
 *
 * See: docs/specification.md (animator)
 */

import type { AnimaWeave } from '@shardworks/loom-apparatus';
import type { ResolvedTool } from '@shardworks/tools-apparatus';

// ── Session chunks (streaming output) ────────────────────────────────

/** A chunk of output from a running session. */
export type SessionChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string };

// ── Request / Result ─────────────────────────────────────────────────

export interface AnimateRequest {
  /** The anima weave from The Loom (composed identity context). */
  context: AnimaWeave;
  /**
   * The work prompt — what the anima should do.
   * Passed directly to the session provider as the initial prompt.
   * This bypasses The Loom — it is not a composition concern.
   */
  prompt?: string;
  /**
   * Working directory for the session.
   * The session provider launches the AI process here.
   */
  cwd: string;
  /**
   * Optional conversation id to resume a multi-turn conversation.
   * If provided, the session provider resumes the existing conversation
   * rather than starting a new one.
   */
  conversationId?: string;
  /**
   * Caller-supplied metadata recorded alongside the session.
   * The Animator stores this as-is — it does not interpret the contents.
   */
  metadata?: Record<string, unknown>;
  /**
   * Enable streaming output. When true, the returned `chunks` iterable
   * yields output as the session produces it. When false (default), the
   * `chunks` iterable completes immediately with no items.
   *
   * Either way, the return shape is the same: `{ chunks, result }`.
   */
  streaming?: boolean;
  /**
   * Task-layer environment variables. Overrides the identity-layer
   * environment from the AnimaWeave when keys collide. Spread into the
   * spawned process environment.
   */
  environment?: Record<string, string>;
}

export interface SessionResult {
  /** Unique session id (generated by The Animator). */
  id: string;
  /** Terminal status. */
  status: 'completed' | 'failed' | 'timeout';
  /** When the session started (ISO-8601). */
  startedAt: string;
  /** When the session ended (ISO-8601). */
  endedAt: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Provider name (e.g. 'claude-code'). */
  provider: string;
  /** Numeric exit code from the provider process. */
  exitCode: number;
  /** Error message if failed. */
  error?: string;
  /** Conversation id (for multi-turn resume). */
  conversationId?: string;
  /** Session id from the provider (e.g. for --resume). */
  providerSessionId?: string;
  /** Token usage from the provider, if available. */
  tokenUsage?: TokenUsage;
  /** Cost in USD from the provider, if available. */
  costUsd?: number;
  /** Caller-supplied metadata, recorded as-is. */
  metadata?: Record<string, unknown>;
  /**
   * The final assistant text from the session.
   * Extracted by the Animator from the provider's transcript.
   * Useful for programmatic consumers that need the session's conclusion
   * without parsing the full transcript (e.g. the Spider's review collect step).
   */
  output?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// ── Summon request ──────────────────────────────────────────────────

export interface SummonRequest {
  /**
   * The work prompt — what the anima should do.
   * Passed directly to the session provider as the initial prompt.
   */
  prompt: string;
  /**
   * The role to summon (e.g. 'artificer', 'scribe').
   * Passed to The Loom for context composition and recorded in session metadata.
   */
  role?: string;
  /**
   * Working directory for the session.
   * The session provider launches the AI process here.
   */
  cwd: string;
  /**
   * Optional conversation id to resume a multi-turn conversation.
   */
  conversationId?: string;
  /**
   * Additional metadata to record alongside the session.
   * Merged with auto-generated metadata (trigger: 'summon', role).
   */
  metadata?: Record<string, unknown>;
  /**
   * Enable streaming output. When true, the returned `chunks` iterable
   * yields output as the session produces it. When false (default), the
   * `chunks` iterable completes immediately with no items.
   */
  streaming?: boolean;
  /**
   * Task-layer environment variables. Overrides the identity-layer
   * environment from the AnimaWeave when keys collide. Spread into the
   * spawned process environment.
   */
  environment?: Record<string, string>;
}

// ── Animator API (the `provides` interface) ──────────────────────────

/** The return value from animate() and summon(). */
export interface AnimateHandle {
  /**
   * Async iterable of output chunks from the session. When streaming is
   * disabled (the default), this iterable completes immediately with no
   * items. When streaming is enabled, it yields chunks as the session
   * produces output.
   */
  chunks: AsyncIterable<SessionChunk>;
  /**
   * Promise that resolves to the final SessionResult after the session
   * completes (or fails/times out) and the result is recorded to The Stacks.
   */
  result: Promise<SessionResult>;
}

export interface AnimatorApi {
  /**
   * Summon an anima — compose context via The Loom and launch a session.
   *
   * This is the high-level "make an anima do a thing" entry point.
   * Internally calls The Loom for context composition (passing the role),
   * then animate() for session launch and recording. The work prompt
   * bypasses the Loom and goes directly to the provider.
   *
   * Requires The Loom apparatus to be installed. Throws if not available.
   *
   * Auto-populates session metadata with `trigger: 'summon'` and `role`.
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   */
  summon(request: SummonRequest): AnimateHandle;

  /**
   * Animate a session — launch an AI process with the given context.
   *
   * This is the low-level entry point for callers that compose their own
   * AnimaWeave (e.g. The Parlour for multi-turn conversations).
   *
   * Records the session result to The Stacks before `result` resolves.
   *
   * Set `streaming: true` on the request to receive output chunks as the
   * session runs. When streaming is disabled (default), the `chunks`
   * iterable completes immediately with no items.
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   */
  animate(request: AnimateRequest): AnimateHandle;
}

// ── Session provider interface ───────────────────────────────────────

/**
 * A session provider — pluggable backend that knows how to launch and
 * communicate with a specific AI system.
 *
 * Implemented as an apparatus plugin whose `provides` object satisfies
 * this interface. The Animator discovers the provider via guild config:
 * `guild.json["animator"]["sessionProvider"]` names the plugin id.
 *
 * The provider always returns `{ chunks, result }` — the same shape as
 * AnimateHandle. When `config.streaming` is true, the provider MAY yield
 * output chunks as the session runs. When false (or when the provider
 * does not support streaming), the chunks iterable completes immediately
 * with no items. The Animator does not branch on streaming capability —
 * it passes the flag through and trusts the provider to do the right thing.
 */
export interface AnimatorSessionProvider {
  /** Human-readable name (e.g. 'claude-code'). */
  name: string;

  /**
   * Launch a session. Returns `{ chunks, result }` synchronously.
   *
   * The `result` promise resolves when the AI process exits.
   * The `chunks` async iterable yields output when `config.streaming`
   * is true and the provider supports streaming; otherwise it completes
   * immediately with no items.
   *
   * Providers that don't support streaming simply ignore the flag and
   * return empty chunks — no separate method needed.
   */
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>;
    result: Promise<SessionProviderResult>;
  };
}

export interface SessionProviderConfig {
  /** System prompt for the AI process. May be undefined if composition is not yet implemented. */
  systemPrompt?: string;
  /** Initial user message (e.g. writ description). */
  initialPrompt?: string;
  /** Model to use (from guild settings). */
  model: string;
  /** Optional conversation id for resume. */
  conversationId?: string;
  /** Working directory for the session. */
  cwd: string;
  /**
   * Enable streaming output. When true, the provider should yield output
   * chunks as the session produces them. When false (default), the chunks
   * iterable should complete immediately with no items.
   *
   * Providers that don't support streaming may ignore this flag.
   */
  streaming?: boolean;
  /**
   * Resolved tools for this session. When present, the provider should
   * configure an MCP server with these tool definitions.
   *
   * The Loom resolves role → permissions → tools via the Instrumentarium.
   * The Animator passes them through from the AnimaWeave.
   */
  tools?: ResolvedTool[];
  /**
   * Merged environment variables to spread into the spawned process.
   * The Animator merges identity-layer (weave) and task-layer (request)
   * variables before passing them here — task layer wins on collision.
   */
  environment?: Record<string, string>;
}

/** A single message from the NDJSON stream. Untyped — shape varies by provider. */
export type TranscriptMessage = Record<string, unknown>;

export interface SessionProviderResult {
  /** Exit status. */
  status: 'completed' | 'failed' | 'timeout';
  /** Numeric exit code from the process. */
  exitCode: number;
  /** Error message if failed. */
  error?: string;
  /** Provider's session id (e.g. for --resume). */
  providerSessionId?: string;
  /** Token usage, if the provider can report it. */
  tokenUsage?: TokenUsage;
  /** Cost in USD, if the provider can report it. */
  costUsd?: number;
  /** The session's full transcript — array of NDJSON message objects. */
  transcript?: TranscriptMessage[];
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message's text content blocks.
   * Undefined if the session produced no assistant output.
   */
  output?: string;
}

// ── Stacks document type ─────────────────────────────────────────────

/**
 * The session document stored in The Stacks' `sessions` book.
 * Includes all SessionResult fields plus the `id` required by BookEntry.
 */
export interface SessionDoc {
  id: string;
  /**
   * Session status. Initially written as `'running'` when the session is
   * launched (Step 2), then updated to a terminal status (`'completed'`,
   * `'failed'`, or `'timeout'`) after the provider exits (Step 5).
   * The `'running'` state is transient — it only exists between Steps 2 and 5.
   * `SessionResult.status` only includes terminal states.
   */
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  provider: string;
  exitCode?: number;
  error?: string;
  conversationId?: string;
  providerSessionId?: string;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  metadata?: Record<string, unknown>;
  /** The final assistant text from the session. */
  output?: string;
  /** Index signature required by BookEntry. */
  [key: string]: unknown;
}

/**
 * The transcript document stored in The Stacks' `transcripts` book.
 * One record per session — 1:1 relationship with SessionDoc.
 */
export interface TranscriptDoc {
  /** Same as the session id. */
  id: string;
  /** Full NDJSON transcript from the session. */
  messages: TranscriptMessage[];
  /** Index signature required by BookEntry. */
  [key: string]: unknown;
}

// ── Animator config ──────────────────────────────────────────────────

/** Plugin configuration stored at guild.json["animator"]. */
export interface AnimatorConfig {
  /**
   * Plugin id of the apparatus that implements AnimatorSessionProvider.
   * The Animator looks this up via guild().apparatus() at animate-time.
   * Defaults to 'claude-code' if not specified.
   */
  sessionProvider?: string;
}

// Augment GuildConfig so `guild().guildConfig().animator` is typed without
// requiring a manual type parameter at the call site.
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    animator?: AnimatorConfig;
  }
}

=== FILE: packages/plugins/dashboard/src/dashboard.ts ===
/**
 * The Dashboard — web-based guild operations dashboard apparatus.
 *
 * Contributes the `dashboard-start` CLI tool which launches a web server
 * serving a live operations UI. The apparatus itself is passive — no
 * background server runs at guild startup. The server only runs when
 * the operator explicitly invokes `nsg dashboard start`.
 *
 * See: docs/architecture/apparatus/dashboard.md
 */

import type { Plugin } from '@shardworks/nexus-core';
import { dashboardStart } from './tool.ts';

export function createDashboard(): Plugin {
  return {
    apparatus: {
      recommends: ['clerk', 'stacks', 'animator', 'spider', 'codexes'],

      supportKit: {
        tools: [dashboardStart],
      },

      start(): void {
        // Nothing to start — the dashboard server is launched on demand
        // via the dashboard-start CLI tool.
      },
    },
  };
}

=== FILE: packages/plugins/dashboard/src/html.ts ===
/**
 * Dashboard web UI — embedded HTML/CSS/JS as a single-file SPA.
 *
 * Returned by the server's root handler. All API calls go to /api/*.
 */

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Guild Dashboard</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f1117;--surface:#1a1d27;--surface2:#242736;--surface3:#2e3248;
  --border:#3a3f5c;--text:#e2e8f0;--muted:#8892a4;--accent:#6366f1;
  --accent2:#818cf8;--green:#22c55e;--yellow:#eab308;--red:#ef4444;
  --blue:#3b82f6;--orange:#f97316;--radius:6px;--font:'Inter',system-ui,sans-serif;
}
body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;min-height:100vh;display:flex;flex-direction:column}
a{color:var(--accent2);text-decoration:none}
button{cursor:pointer;font-family:inherit;font-size:13px;border:none;border-radius:var(--radius);padding:5px 12px;transition:opacity .15s}
button:hover{opacity:.85}
button:disabled{opacity:.4;cursor:default}
input,select,textarea{background:var(--surface3);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:6px 10px;font-family:inherit;font-size:13px;outline:none;transition:border-color .15s}
input:focus,select:focus,textarea:focus{border-color:var(--accent)}
select option{background:var(--surface2)}
label{display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;text-transform:uppercase;letter-spacing:.05em}
.btn-primary{background:var(--accent);color:#fff}
.btn-ghost{background:var(--surface3);color:var(--text);border:1px solid var(--border)}
.btn-danger{background:var(--red);color:#fff}
.btn-success{background:var(--green);color:#000}
.btn-warning{background:var(--yellow);color:#000}
.btn-sm{padding:3px 8px;font-size:12px}

/* Layout */
header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;display:flex;align-items:center;gap:16px;height:52px;flex-shrink:0}
header h1{font-size:16px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:8px}
header h1 .guild-name{color:var(--accent2)}
.header-meta{margin-left:auto;display:flex;align-items:center;gap:12px;color:var(--muted);font-size:12px}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block}

nav{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;display:flex;gap:2px;flex-shrink:0}
.tab{padding:10px 16px;font-size:13px;font-weight:500;color:var(--muted);border-bottom:2px solid transparent;cursor:pointer;transition:color .15s,border-color .15s;user-select:none;display:flex;align-items:center;gap:6px}
.tab:hover{color:var(--text)}
.tab.active{color:var(--accent2);border-bottom-color:var(--accent2)}
.tab-badge{background:var(--surface3);color:var(--muted);font-size:10px;padding:1px 6px;border-radius:10px;font-weight:600}
.tab.active .tab-badge{background:var(--accent);color:#fff}

main{flex:1;overflow:auto;padding:24px}
.tab-panel{display:none}
.tab-panel.active{display:block}

/* Cards */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px}
.card-title{font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.card-title svg{flex-shrink:0}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}

/* Stats */
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px}
.stat-label{font-size:11px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.stat-value{font-size:28px;font-weight:700;color:var(--text);line-height:1}
.stat-sub{font-size:11px;color:var(--muted);margin-top:4px}

/* Badges / status */
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;text-transform:lowercase;letter-spacing:.03em}
.badge-ready{background:#1e3a5f;color:#60a5fa}
.badge-active{background:#1a3a2a;color:#4ade80}
.badge-completed{background:#1a2a1a;color:#86efac}
.badge-failed{background:#3a1a1a;color:#f87171}
.badge-cancelled{background:#2a2a2a;color:#9ca3af}
.badge-running{background:#1a2a3a;color:#38bdf8;animation:pulse 2s infinite}
.badge-pending{background:#2a2a1a;color:#fbbf24}
.badge-ready-codex{background:#1e3a5f;color:#60a5fa}
.badge-cloning{background:#2a2a1a;color:#fbbf24}
.badge-error{background:#3a1a1a;color:#f87171}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}

/* Tables */
.toolbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.toolbar-right{margin-left:auto;display:flex;gap:8px;align-items:center}
.search-input{width:200px}
table{width:100%;border-collapse:collapse}
thead tr{border-bottom:1px solid var(--border)}
th{text-align:left;font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;padding:8px 12px;white-space:nowrap;cursor:pointer;user-select:none}
th:hover{color:var(--text)}
th .sort-icon{display:inline-block;margin-left:4px;opacity:.4}
th.sorted .sort-icon{opacity:1;color:var(--accent2)}
td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:middle;max-width:340px}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,.02)}
.td-id{font-family:monospace;font-size:11px;color:var(--muted);white-space:nowrap}
.td-title{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.td-time{font-size:12px;color:var(--muted);white-space:nowrap}
.td-actions{white-space:nowrap;display:flex;gap:6px;align-items:center}
.empty-state{text-align:center;padding:48px 16px;color:var(--muted)}
.empty-state h3{font-size:15px;margin-bottom:6px;color:var(--text)}
.empty-icon{font-size:32px;margin-bottom:12px}
.pagination{display:flex;align-items:center;gap:8px;margin-top:12px;justify-content:flex-end;font-size:12px;color:var(--muted)}
.page-btn{background:var(--surface3);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:4px 10px;font-size:12px}
.page-btn:disabled{opacity:.35;cursor:default}

/* Expandable rows */
.row-detail{background:var(--surface2);padding:12px 16px;border-bottom:1px solid var(--border)}
.row-detail pre{font-size:11px;color:var(--muted);white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto;background:var(--surface);padding:10px;border-radius:4px;border:1px solid var(--border);margin-top:6px}
.detail-label{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.detail-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:10px}
.detail-item{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:8px 10px}
.detail-item .k{font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}
.detail-item .v{font-size:12px;font-family:monospace;word-break:break-all}

/* Modal */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:100;align-items:center;justify-content:center}
.modal-overlay.open{display:flex}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:24px;width:520px;max-width:95vw;max-height:90vh;overflow:auto}
.modal h2{font-size:16px;font-weight:600;margin-bottom:20px}
.modal-footer{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
.form-group{margin-bottom:14px}
.form-group input,.form-group select,.form-group textarea{width:100%}
.form-group textarea{resize:vertical;min-height:80px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.error-msg{color:var(--red);font-size:12px;margin-top:6px;display:none}
.error-msg.show{display:block}
.success-msg{color:var(--green);font-size:12px;margin-top:6px}

/* Plugin list */
.plugin-list{display:flex;flex-direction:column;gap:6px}
.plugin-item{display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius)}
.plugin-item .pi-name{font-weight:500;flex:1}
.plugin-item .pi-type{font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;text-transform:uppercase}
.pi-type-apparatus{background:#1e2a4a;color:#818cf8}
.pi-type-kit{background:#1a2a2a;color:#34d399}
.plugin-item .pi-ver{font-size:11px;color:var(--muted);font-family:monospace}

/* Config view */
.config-view{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:14px;font-family:monospace;font-size:12px;color:var(--muted);white-space:pre-wrap;max-height:400px;overflow:auto;line-height:1.6}
.config-key{color:var(--accent2)}
.config-str{color:var(--green)}
.config-num{color:var(--orange)}
.config-bool{color:var(--yellow)}
.config-null{color:var(--muted)}

/* Engine pipeline */
.pipeline{display:flex;align-items:center;gap:0;overflow-x:auto;padding:4px 0}
.engine-chip{display:flex;align-items:center;gap:5px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-size:11px;white-space:nowrap}
.engine-arrow{color:var(--border);font-size:14px;margin:0 2px;flex-shrink:0}

/* Loading */
.loading{display:flex;align-items:center;justify-content:center;padding:40px;color:var(--muted);gap:10px}
.spinner{width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--accent2);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.refresh-btn{background:none;border:none;color:var(--muted);padding:4px;line-height:1;font-size:16px}
.refresh-btn:hover{color:var(--text)}
.toast-area{position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:8px;z-index:200}
.toast{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:10px 16px;font-size:13px;animation:slide-in .2s ease;max-width:340px}
.toast.success{border-color:var(--green);color:var(--green)}
.toast.error{border-color:var(--red);color:var(--red)}
@keyframes slide-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
</style>
</head>
<body>
<header>
  <h1>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    <span id="guild-title">Guild Dashboard</span>
  </h1>
  <div class="header-meta">
    <span class="status-dot"></span>
    <span id="header-status">Loading…</span>
    <button class="refresh-btn" onclick="refreshCurrent()" title="Refresh">↻</button>
  </div>
</header>

<nav id="tab-nav">
  <div class="tab active" data-tab="overview">Overview</div>
  <div class="tab" data-tab="clerk">Clerk <span class="tab-badge" id="badge-clerk">—</span></div>
  <div class="tab" data-tab="spider">Spider <span class="tab-badge" id="badge-spider">—</span></div>
  <div class="tab" data-tab="animator">Animator <span class="tab-badge" id="badge-animator">—</span></div>
  <div class="tab" data-tab="codexes">Codexes <span class="tab-badge" id="badge-codexes">—</span></div>
</nav>

<main>
  <!-- OVERVIEW -->
  <div class="tab-panel active" id="panel-overview">
    <div id="overview-loading" class="loading"><div class="spinner"></div>Loading…</div>
    <div id="overview-content" style="display:none">
      <div class="grid-4" id="overview-stats" style="margin-bottom:16px"></div>
      <div class="grid-2">
        <div>
          <div class="card">
            <div class="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Guild Info
            </div>
            <div id="overview-info"></div>
          </div>
          <div class="card">
            <div class="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 0 0 4.93 19.07M4.93 4.93a10 10 0 0 0 14.14 14.14"/></svg>
              Settings
            </div>
            <div id="overview-settings"></div>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              Loaded Plugins
            </div>
            <div id="overview-plugins" class="plugin-list"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- CLERK -->
  <div class="tab-panel" id="panel-clerk">
    <div class="card" style="margin-bottom:0">
      <div class="toolbar">
        <select id="clerk-filter-status" onchange="loadWrits()">
          <option value="">All statuses</option>
          <option value="ready">Ready</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select id="clerk-filter-type" onchange="loadWrits()">
          <option value="">All types</option>
        </select>
        <input class="search-input" type="text" id="clerk-search" placeholder="Search title…" oninput="filterWritsLocal()">
        <div class="toolbar-right">
          <span id="clerk-count-label" style="color:var(--muted);font-size:12px"></span>
          <button class="btn-primary" onclick="openPostModal()">+ Post Commission</button>
        </div>
      </div>
      <div id="clerk-loading" class="loading" style="display:none"><div class="spinner"></div>Loading…</div>
      <div id="clerk-table-wrap">
        <table>
          <thead>
            <tr>
              <th onclick="sortWrits('id')" data-col="id">ID <span class="sort-icon">↕</span></th>
              <th onclick="sortWrits('type')" data-col="type">Type <span class="sort-icon">↕</span></th>
              <th onclick="sortWrits('title')" data-col="title">Title <span class="sort-icon">↕</span></th>
              <th onclick="sortWrits('status')" data-col="status">Status <span class="sort-icon">↕</span></th>
              <th onclick="sortWrits('createdAt')" data-col="createdAt">Created <span class="sort-icon">↕</span></th>
              <th onclick="sortWrits('updatedAt')" data-col="updatedAt">Updated <span class="sort-icon">↕</span></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="clerk-tbody"></tbody>
        </table>
        <div id="clerk-empty" class="empty-state" style="display:none">
          <div class="empty-icon">📋</div>
          <h3>No writs found</h3>
          <p>Post a commission to create your first writ.</p>
        </div>
      </div>
      <div class="pagination">
        <button class="page-btn" id="clerk-prev" onclick="writPage(-1)" disabled>‹ Prev</button>
        <span id="clerk-page-info" style="font-size:12px;color:var(--muted)"></span>
        <button class="page-btn" id="clerk-next" onclick="writPage(1)">Next ›</button>
      </div>
    </div>
  </div>

  <!-- SPIDER -->
  <div class="tab-panel" id="panel-spider">
    <div class="card" style="margin-bottom:0">
      <div class="toolbar">
        <select id="spider-filter-status" onchange="loadRigs()">
          <option value="">All statuses</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        <div class="toolbar-right">
          <span id="spider-count-label" style="color:var(--muted);font-size:12px"></span>
        </div>
      </div>
      <div id="spider-loading" class="loading" style="display:none"><div class="spinner"></div>Loading…</div>
      <table>
        <thead>
          <tr>
            <th onclick="sortRigs('id')" data-col="id">Rig ID <span class="sort-icon">↕</span></th>
            <th onclick="sortRigs('writId')" data-col="writId">Writ <span class="sort-icon">↕</span></th>
            <th onclick="sortRigs('status')" data-col="status">Status <span class="sort-icon">↕</span></th>
            <th>Pipeline</th>
            <th>Progress</th>
          </tr>
        </thead>
        <tbody id="spider-tbody"></tbody>
      </table>
      <div id="spider-empty" class="empty-state" style="display:none">
        <div class="empty-icon">⚙️</div>
        <h3>No rigs found</h3>
        <p>Rigs are created when the Spider processes writs.</p>
      </div>
    </div>
  </div>

  <!-- ANIMATOR -->
  <div class="tab-panel" id="panel-animator">
    <div class="card" style="margin-bottom:0">
      <div class="toolbar">
        <select id="animator-filter-status" onchange="loadSessions()">
          <option value="">All statuses</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="timeout">Timeout</option>
        </select>
        <div class="toolbar-right">
          <span id="animator-count-label" style="color:var(--muted);font-size:12px"></span>
        </div>
      </div>
      <div id="animator-loading" class="loading" style="display:none"><div class="spinner"></div>Loading…</div>
      <table>
        <thead>
          <tr>
            <th onclick="sortSessions('id')" data-col="id">Session ID <span class="sort-icon">↕</span></th>
            <th onclick="sortSessions('status')" data-col="status">Status <span class="sort-icon">↕</span></th>
            <th onclick="sortSessions('provider')" data-col="provider">Provider <span class="sort-icon">↕</span></th>
            <th onclick="sortSessions('startedAt')" data-col="startedAt">Started <span class="sort-icon">↕</span></th>
            <th onclick="sortSessions('durationMs')" data-col="durationMs">Duration <span class="sort-icon">↕</span></th>
            <th>Tokens / Cost</th>
          </tr>
        </thead>
        <tbody id="animator-tbody"></tbody>
      </table>
      <div id="animator-empty" class="empty-state" style="display:none">
        <div class="empty-icon">✨</div>
        <h3>No sessions recorded</h3>
        <p>Sessions appear here when animas are animated.</p>
      </div>
      <div class="pagination">
        <button class="page-btn" id="animator-prev" onclick="sessionPage(-1)" disabled>‹ Prev</button>
        <span id="animator-page-info"></span>
        <button class="page-btn" id="animator-next" onclick="sessionPage(1)">Next ›</button>
      </div>
    </div>
  </div>

  <!-- CODEXES -->
  <div class="tab-panel" id="panel-codexes">
    <div id="codexes-loading" class="loading"><div class="spinner"></div>Loading…</div>
    <div id="codexes-content" style="display:none">
      <div class="toolbar" style="margin-bottom:16px">
        <div class="toolbar-right">
          <span id="codexes-count-label" style="color:var(--muted);font-size:12px"></span>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Remote URL</th>
            <th>Status</th>
            <th>Active Drafts</th>
          </tr>
        </thead>
        <tbody id="codexes-tbody"></tbody>
      </table>
      <div id="codexes-empty" class="empty-state" style="display:none">
        <div class="empty-icon">📚</div>
        <h3>No codexes registered</h3>
        <p>Add a codex with <code>nsg codex add &lt;name&gt; &lt;url&gt;</code>.</p>
      </div>
      <div id="drafts-section" style="margin-top:24px;display:none">
        <div class="card">
          <div class="card-title">Active Drafts</div>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Codex</th>
                <th>Branch</th>
                <th>Associated With</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody id="drafts-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</main>

<!-- POST COMMISSION MODAL -->
<div class="modal-overlay" id="post-modal">
  <div class="modal">
    <h2>Post Commission</h2>
    <div class="form-row">
      <div class="form-group">
        <label for="pm-type">Type</label>
        <select id="pm-type"></select>
      </div>
      <div class="form-group">
        <label for="pm-codex">Codex (optional)</label>
        <select id="pm-codex">
          <option value="">None</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label for="pm-title">Title</label>
      <input type="text" id="pm-title" placeholder="Short description of the work">
    </div>
    <div class="form-group">
      <label for="pm-body">Body</label>
      <textarea id="pm-body" placeholder="Detailed description, requirements, context…" rows="5"></textarea>
    </div>
    <div id="pm-error" class="error-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closePostModal()">Cancel</button>
      <button class="btn-primary" id="pm-submit" onclick="submitPost()">Post Commission</button>
    </div>
  </div>
</div>

<!-- TRANSITION MODAL -->
<div class="modal-overlay" id="trans-modal">
  <div class="modal" style="width:420px">
    <h2 id="trans-title">Transition Writ</h2>
    <p style="color:var(--muted);font-size:13px;margin-bottom:16px" id="trans-desc"></p>
    <div class="form-group" id="trans-resolution-wrap" style="display:none">
      <label for="trans-resolution">Resolution (optional)</label>
      <textarea id="trans-resolution" rows="3" placeholder="Brief summary of how this writ resolved…"></textarea>
    </div>
    <div id="trans-error" class="error-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeTransModal()">Cancel</button>
      <button class="btn-primary" id="trans-submit" onclick="submitTransition()">Confirm</button>
    </div>
  </div>
</div>

<div class="toast-area" id="toast-area"></div>

<script>
// ── State ────────────────────────────────────────────────────────
let activeTab = 'overview';
let overview = null;
let writs = [];
let writsTotal = 0;
let writsPage = 0;
const WRIT_PAGE_SIZE = 20;
let writSort = { col: 'createdAt', dir: 'desc' };
let rigs = [];
let rigSort = { col: 'id', dir: 'desc' };
let sessions = [];
let sessionsTotal = 0;
let sessionsPage = 0;
const SESSION_PAGE_SIZE = 20;
let sessionSort = { col: 'startedAt', dir: 'desc' };
let transData = null;

// ── Tabs ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

function switchTab(id) {
  activeTab = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + id));
  loadTab(id);
}

function loadTab(id) {
  if (id === 'overview') loadOverview();
  else if (id === 'clerk') loadWrits();
  else if (id === 'spider') loadRigs();
  else if (id === 'animator') loadSessions();
  else if (id === 'codexes') loadCodexes();
}

function refreshCurrent() { loadTab(activeTab); }

// ── API helpers ──────────────────────────────────────────────────
async function api(path, opts) {
  const r = await fetch('/api' + path, opts);
  if (!r.ok) {
    const t = await r.text().catch(() => 'Unknown error');
    throw new Error(t || r.statusText);
  }
  return r.json();
}

async function apiPost(path, body) {
  return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

// ── Toast ────────────────────────────────────────────────────────
function toast(msg, type='success') {
  const area = document.getElementById('toast-area');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  area.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── OVERVIEW ─────────────────────────────────────────────────────
async function loadOverview() {
  document.getElementById('overview-loading').style.display = 'flex';
  document.getElementById('overview-content').style.display = 'none';
  try {
    overview = await api('/overview');
    renderOverview(overview);
    document.getElementById('header-status').textContent = overview.guild.name + ' · nexus ' + overview.guild.nexus;
    document.getElementById('guild-title').innerHTML =
      'Guild Dashboard · <span class="guild-name">' + esc(overview.guild.name) + '</span>';
  } catch(e) {
    document.getElementById('overview-loading').innerHTML = '<span style="color:var(--red)">Error: ' + esc(e.message) + '</span>';
    return;
  }
  document.getElementById('overview-loading').style.display = 'none';
  document.getElementById('overview-content').style.display = 'block';
}

function renderOverview(data) {
  // Stats
  const stats = [
    { label: 'Plugins', value: data.plugins.length, sub: data.plugins.filter(p=>p.type==='apparatus').length + ' apparatus' },
    { label: 'Writs', value: data.counts.writs ?? '—', sub: (data.counts.ready ?? 0) + ' ready · ' + (data.counts.active ?? 0) + ' active' },
    { label: 'Sessions', value: data.counts.sessions ?? '—', sub: (data.counts.runningSessions ?? 0) + ' running' },
    { label: 'Rigs', value: data.counts.rigs ?? '—', sub: (data.counts.runningRigs ?? 0) + ' running' },
  ];
  document.getElementById('overview-stats').innerHTML = stats.map(s =>
    '<div class="stat-card"><div class="stat-label">' + esc(s.label) + '</div><div class="stat-value">' + esc(String(s.value)) + '</div><div class="stat-sub">' + esc(s.sub) + '</div></div>'
  ).join('');

  // Info
  const g = data.guild;
  document.getElementById('overview-info').innerHTML = kv([
    ['Name', g.name],
    ['Nexus Version', g.nexus],
    ['Model', g.settings?.model ?? '(default)'],
    ['Auto Migrate', g.settings?.autoMigrate !== false ? 'Yes' : 'No'],
  ]);

  // Settings — show full clockworks if present
  let settingsHtml = '';
  if (g.clockworks?.standingOrders?.length) {
    settingsHtml += '<div class="detail-label" style="margin-bottom:8px">Standing Orders</div>';
    settingsHtml += g.clockworks.standingOrders.map(o => {
      const trigger = 'on: ' + o.on;
      const action = o.run ? 'run: ' + o.run : o.summon ? 'summon: ' + o.summon : 'brief: ' + o.brief;
      return '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);display:flex;gap:8px"><span style="color:var(--muted);font-family:monospace">' + esc(trigger) + '</span><span style="color:var(--accent2);font-family:monospace">' + esc(action) + '</span></div>';
    }).join('');
  }
  if (g.clerk?.writTypes?.length) {
    settingsHtml += '<div class="detail-label" style="margin:12px 0 6px">Writ Types</div>';
    settingsHtml += g.clerk.writTypes.map(t =>
      '<span class="badge badge-ready" style="margin:2px">' + esc(t.name) + '</span>'
    ).join(' ');
  }
  if (!settingsHtml) settingsHtml = '<span style="color:var(--muted);font-size:12px">No additional configuration</span>';
  document.getElementById('overview-settings').innerHTML = settingsHtml;

  // Plugins
  document.getElementById('overview-plugins').innerHTML = data.plugins.map(p =>
    '<div class="plugin-item">' +
    '<span class="pi-type ' + (p.type==='apparatus'?'pi-type-apparatus':'pi-type-kit') + '">' + esc(p.type) + '</span>' +
    '<span class="pi-name">' + esc(p.id) + '</span>' +
    '<span class="pi-ver">' + esc(p.version) + '</span>' +
    '</div>'
  ).join('');

  // Update badges
  if (data.counts.writs !== undefined) setBadge('clerk', data.counts.writs);
  if (data.counts.rigs !== undefined) setBadge('spider', data.counts.rigs);
  if (data.counts.sessions !== undefined) setBadge('animator', data.counts.sessions);
  if (data.counts.codexes !== undefined) setBadge('codexes', data.counts.codexes);
}

function kv(pairs) {
  return pairs.map(([k,v]) =>
    '<div style="display:flex;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">' +
    '<span style="font-size:11px;font-weight:600;color:var(--muted);min-width:110px;text-transform:uppercase;letter-spacing:.05em">' + esc(k) + '</span>' +
    '<span style="font-size:13px">' + esc(String(v ?? '—')) + '</span>' +
    '</div>'
  ).join('');
}

function setBadge(tab, val) {
  const el = document.getElementById('badge-' + tab);
  if (el) el.textContent = String(val);
}

// ── CLERK ─────────────────────────────────────────────────────────
async function loadWrits() {
  const status = document.getElementById('clerk-filter-status').value;
  const type   = document.getElementById('clerk-filter-type').value;
  document.getElementById('clerk-loading').style.display = 'flex';
  document.getElementById('clerk-table-wrap').style.display = 'none';
  try {
    const params = new URLSearchParams({ limit: WRIT_PAGE_SIZE, offset: writsPage * WRIT_PAGE_SIZE });
    if (status) params.set('status', status);
    if (type)   params.set('type', type);
    const data = await api('/writs?' + params);
    writs = data.writs;
    writsTotal = data.total;
    // Populate type filter (once)
    if (data.types?.length && document.getElementById('clerk-filter-type').options.length <= 1) {
      data.types.forEach(t => {
        const o = document.createElement('option');
        o.value = t; o.textContent = t;
        document.getElementById('clerk-filter-type').appendChild(o);
      });
    }
    // Populate type select in modal
    if (data.types?.length) {
      const sel = document.getElementById('pm-type');
      sel.innerHTML = '';
      data.types.forEach(t => {
        const o = document.createElement('option');
        o.value = t; o.textContent = t;
        sel.appendChild(o);
      });
    }
    renderWrits();
    setBadge('clerk', writsTotal);
    document.getElementById('clerk-count-label').textContent = writsTotal + ' writ' + (writsTotal!==1?'s':'');
  } catch(e) {
    document.getElementById('clerk-loading').innerHTML = '<span style="color:var(--red)">Error: ' + esc(e.message) + '</span>';
    return;
  }
  document.getElementById('clerk-loading').style.display = 'none';
  document.getElementById('clerk-table-wrap').style.display = 'block';
}

function renderWrits() {
  const search = (document.getElementById('clerk-search').value || '').toLowerCase();
  let rows = writs.filter(w => !search || w.title.toLowerCase().includes(search));
  rows = stableSort(rows, writSort.col, writSort.dir);
  updateSortHeaders('clerk-tbody', writSort);

  const tbody = document.getElementById('clerk-tbody');
  tbody.innerHTML = rows.map(w =>
    '<tr>' +
    '<td class="td-id">' + esc(w.id) + '</td>' +
    '<td><code style="font-size:11px;color:var(--muted)">' + esc(w.type) + '</code></td>' +
    '<td class="td-title" title="' + esc(w.title) + '">' + esc(w.title) + '</td>' +
    '<td>' + statusBadge(w.status) + '</td>' +
    '<td class="td-time">' + fmtDate(w.createdAt) + '</td>' +
    '<td class="td-time">' + fmtDate(w.updatedAt) + '</td>' +
    '<td class="td-actions">' + writActions(w) + '</td>' +
    '</tr>'
  ).join('');

  document.getElementById('clerk-empty').style.display = rows.length ? 'none' : 'block';

  // Pagination
  const totalPages = Math.ceil(writsTotal / WRIT_PAGE_SIZE);
  document.getElementById('clerk-prev').disabled = writsPage <= 0;
  document.getElementById('clerk-next').disabled = writsPage >= totalPages - 1;
  document.getElementById('clerk-page-info').textContent = totalPages > 1
    ? 'Page ' + (writsPage+1) + ' of ' + totalPages : '';
}

function filterWritsLocal() { renderWrits(); }

function writActions(w) {
  const btns = [];
  if (w.status === 'ready') {
    btns.push('<button class="btn-success btn-sm" onclick="openTrans(\'' + w.id + '\',\'active\')">Accept</button>');
    btns.push('<button class="btn-danger btn-sm" onclick="openTrans(\'' + w.id + '\',\'cancelled\')">Cancel</button>');
  } else if (w.status === 'active') {
    btns.push('<button class="btn-success btn-sm" onclick="openTrans(\'' + w.id + '\',\'completed\')">Complete</button>');
    btns.push('<button class="btn-danger btn-sm" onclick="openTrans(\'' + w.id + '\',\'failed\')">Fail</button>');
    btns.push('<button class="btn-ghost btn-sm" onclick="openTrans(\'' + w.id + '\',\'cancelled\')">Cancel</button>');
  }
  return btns.join('') || '<span style="color:var(--muted);font-size:11px">Terminal</span>';
}

function sortWrits(col) {
  if (writSort.col === col) writSort.dir = writSort.dir === 'asc' ? 'desc' : 'asc';
  else { writSort.col = col; writSort.dir = 'desc'; }
  renderWrits();
}

function writPage(delta) {
  writsPage = Math.max(0, writsPage + delta);
  loadWrits();
}

// ── POST COMMISSION MODAL ─────────────────────────────────────────
function openPostModal() {
  document.getElementById('pm-title').value = '';
  document.getElementById('pm-body').value = '';
  document.getElementById('pm-error').className = 'error-msg';
  // Populate codexes
  const sel = document.getElementById('pm-codex');
  sel.innerHTML = '<option value="">None</option>';
  if (overview?.counts?.codexNames) {
    overview.counts.codexNames.forEach(n => {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
  }
  document.getElementById('post-modal').classList.add('open');
  document.getElementById('pm-title').focus();
}

function closePostModal() {
  document.getElementById('post-modal').classList.remove('open');
}

async function submitPost() {
  const title  = document.getElementById('pm-title').value.trim();
  const body   = document.getElementById('pm-body').value.trim();
  const type   = document.getElementById('pm-type').value;
  const codex  = document.getElementById('pm-codex').value || undefined;
  const errEl  = document.getElementById('pm-error');
  errEl.className = 'error-msg';

  if (!title) { errEl.textContent = 'Title is required.'; errEl.className = 'error-msg show'; return; }
  if (!body)  { errEl.textContent = 'Body is required.'; errEl.className = 'error-msg show'; return; }

  document.getElementById('pm-submit').disabled = true;
  try {
    await apiPost('/writs', { title, body, type, codex });
    closePostModal();
    toast('Commission posted!');
    writsPage = 0;
    loadWrits();
    loadOverview();
  } catch(e) {
    errEl.textContent = e.message;
    errEl.className = 'error-msg show';
  } finally {
    document.getElementById('pm-submit').disabled = false;
  }
}

// ── TRANSITION MODAL ──────────────────────────────────────────────
function openTrans(id, to) {
  transData = { id, to };
  const labels = { active:'Accept', completed:'Complete', failed:'Fail', cancelled:'Cancel' };
  const descs = {
    active:    'Accept this writ and begin working on it.',
    completed: 'Mark this writ as completed.',
    failed:    'Mark this writ as failed.',
    cancelled: 'Cancel this writ.',
  };
  document.getElementById('trans-title').textContent = labels[to] + ' Writ';
  document.getElementById('trans-desc').textContent = descs[to] || '';
  const showRes = to === 'completed' || to === 'failed' || to === 'cancelled';
  document.getElementById('trans-resolution-wrap').style.display = showRes ? 'block' : 'none';
  document.getElementById('trans-resolution').value = '';
  document.getElementById('trans-error').className = 'error-msg';
  const btn = document.getElementById('trans-submit');
  btn.className = 'btn-primary';
  if (to === 'failed' || to === 'cancelled') btn.className = 'btn-danger';
  if (to === 'completed') btn.className = 'btn-success';
  btn.textContent = labels[to];
  document.getElementById('trans-modal').classList.add('open');
}

function closeTransModal() {
  document.getElementById('trans-modal').classList.remove('open');
  transData = null;
}

async function submitTransition() {
  if (!transData) return;
  const { id, to } = transData;
  const resolution = document.getElementById('trans-resolution').value.trim() || undefined;
  const errEl = document.getElementById('trans-error');
  errEl.className = 'error-msg';
  document.getElementById('trans-submit').disabled = true;
  try {
    await apiPost('/writs/' + id + '/transition', { to, ...(resolution ? { resolution } : {}) });
    closeTransModal();
    toast('Writ transitioned to ' + to);
    loadWrits();
    loadOverview();
  } catch(e) {
    errEl.textContent = e.message;
    errEl.className = 'error-msg show';
  } finally {
    document.getElementById('trans-submit').disabled = false;
  }
}

// ── SPIDER ────────────────────────────────────────────────────────
async function loadRigs() {
  const status = document.getElementById('spider-filter-status').value;
  document.getElementById('spider-loading').style.display = 'flex';
  try {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const data = await api('/rigs?' + params);
    rigs = data.rigs;
    renderRigs();
    setBadge('spider', rigs.length);
    document.getElementById('spider-count-label').textContent = rigs.length + ' rig' + (rigs.length!==1?'s':'');
  } catch(e) {
    document.getElementById('spider-loading').innerHTML = '<span style="color:var(--red)">Error: ' + esc(e.message) + '</span>';
    return;
  }
  document.getElementById('spider-loading').style.display = 'none';
}

function renderRigs() {
  const rows = stableSort(rigs, rigSort.col, rigSort.dir);
  const tbody = document.getElementById('spider-tbody');
  tbody.innerHTML = rows.map(r => {
    const engines = r.engines || [];
    const done = engines.filter(e => e.status==='completed' || e.status==='failed').length;
    const total = engines.length;
    const pct = total ? Math.round(done/total*100) : 0;
    return '<tr>' +
      '<td class="td-id">' + esc(r.id) + '</td>' +
      '<td class="td-id">' + esc(r.writId) + '</td>' +
      '<td>' + statusBadge(r.status) + '</td>' +
      '<td><div class="pipeline">' + engines.map((e,i) =>
        (i>0?'<span class="engine-arrow">›</span>':'')+
        '<div class="engine-chip">' + statusDot(e.status) + ' ' + esc(e.id) + '</div>'
      ).join('') + '</div></td>' +
      '<td><div style="font-size:11px;color:var(--muted)">' + done + '/' + total + ' engines</div>' +
        '<div style="height:4px;background:var(--surface3);border-radius:2px;margin-top:4px;width:80px">' +
        '<div style="height:4px;background:' + (r.status==='failed'?'var(--red)':r.status==='completed'?'var(--green)':'var(--accent)') + ';border-radius:2px;width:' + pct + '%"></div>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');
  document.getElementById('spider-empty').style.display = rows.length ? 'none' : 'block';
}

function sortRigs(col) {
  if (rigSort.col === col) rigSort.dir = rigSort.dir === 'asc' ? 'desc' : 'asc';
  else { rigSort.col = col; rigSort.dir = 'desc'; }
  renderRigs();
}

// ── ANIMATOR ─────────────────────────────────────────────────────
async function loadSessions() {
  const status = document.getElementById('animator-filter-status').value;
  document.getElementById('animator-loading').style.display = 'flex';
  try {
    const params = new URLSearchParams({ limit: SESSION_PAGE_SIZE, offset: sessionsPage * SESSION_PAGE_SIZE });
    if (status) params.set('status', status);
    const data = await api('/sessions?' + params);
    sessions = data.sessions;
    sessionsTotal = data.total;
    renderSessions();
    setBadge('animator', sessionsTotal);
    document.getElementById('animator-count-label').textContent = sessionsTotal + ' session' + (sessionsTotal!==1?'s':'');
  } catch(e) {
    document.getElementById('animator-loading').innerHTML = '<span style="color:var(--red)">Error: ' + esc(e.message) + '</span>';
    return;
  }
  document.getElementById('animator-loading').style.display = 'none';
}

function renderSessions() {
  const rows = stableSort(sessions, sessionSort.col, sessionSort.dir);
  const tbody = document.getElementById('animator-tbody');
  tbody.innerHTML = rows.map(s => {
    const tokens = s.tokenUsage
      ? (s.tokenUsage.inputTokens||0) + '↑ ' + (s.tokenUsage.outputTokens||0) + '↓'
      : '—';
    const cost = s.costUsd != null ? '$' + s.costUsd.toFixed(4) : '—';
    return '<tr>' +
      '<td class="td-id">' + esc(s.id) + '</td>' +
      '<td>' + statusBadge(s.status) + '</td>' +
      '<td style="font-size:12px;color:var(--muted)">' + esc(s.provider||'—') + '</td>' +
      '<td class="td-time">' + fmtDate(s.startedAt) + '</td>' +
      '<td class="td-time">' + fmtDuration(s.durationMs) + '</td>' +
      '<td style="font-size:11px;color:var(--muted);font-family:monospace">' + esc(tokens) + ' · ' + esc(cost) + '</td>' +
    '</tr>';
  }).join('');
  document.getElementById('animator-empty').style.display = rows.length ? 'none' : 'block';

  const totalPages = Math.ceil(sessionsTotal / SESSION_PAGE_SIZE);
  document.getElementById('animator-prev').disabled = sessionsPage <= 0;
  document.getElementById('animator-next').disabled = sessionsPage >= totalPages - 1;
  document.getElementById('animator-page-info').textContent = totalPages > 1
    ? 'Page ' + (sessionsPage+1) + ' of ' + totalPages : '';
}

function sortSessions(col) {
  if (sessionSort.col === col) sessionSort.dir = sessionSort.dir === 'asc' ? 'desc' : 'asc';
  else { sessionSort.col = col; sessionSort.dir = 'desc'; }
  renderSessions();
}

function sessionPage(delta) {
  sessionsPage = Math.max(0, sessionsPage + delta);
  loadSessions();
}

// ── CODEXES ───────────────────────────────────────────────────────
async function loadCodexes() {
  document.getElementById('codexes-loading').style.display = 'flex';
  document.getElementById('codexes-content').style.display = 'none';
  try {
    const data = await api('/codexes');
    renderCodexes(data);
    setBadge('codexes', data.codexes.length);
    document.getElementById('codexes-count-label').textContent = data.codexes.length + ' codex' + (data.codexes.length!==1?'es':'');
  } catch(e) {
    document.getElementById('codexes-loading').innerHTML = '<span style="color:var(--red)">Error: ' + esc(e.message) + '</span>';
    return;
  }
  document.getElementById('codexes-loading').style.display = 'none';
  document.getElementById('codexes-content').style.display = 'block';
}

function renderCodexes(data) {
  const tbody = document.getElementById('codexes-tbody');
  tbody.innerHTML = data.codexes.map(c =>
    '<tr>' +
    '<td style="font-weight:500">' + esc(c.name) + '</td>' +
    '<td style="font-size:11px;font-family:monospace;color:var(--muted);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(c.remoteUrl) + '">' + esc(c.remoteUrl) + '</td>' +
    '<td>' + codexStatusBadge(c.cloneStatus) + '</td>' +
    '<td style="text-align:center">' + (c.activeDrafts || 0) + '</td>' +
    '</tr>'
  ).join('');
  document.getElementById('codexes-empty').style.display = data.codexes.length ? 'none' : 'block';

  // Drafts
  const allDrafts = data.drafts || [];
  document.getElementById('drafts-section').style.display = allDrafts.length ? 'block' : 'none';
  if (allDrafts.length) {
    document.getElementById('drafts-tbody').innerHTML = allDrafts.map(d =>
      '<tr>' +
      '<td class="td-id">' + esc(d.id) + '</td>' +
      '<td>' + esc(d.codexName) + '</td>' +
      '<td style="font-family:monospace;font-size:11px">' + esc(d.branch) + '</td>' +
      '<td class="td-id">' + esc(d.associatedWith || '—') + '</td>' +
      '<td class="td-time">' + fmtDate(d.createdAt) + '</td>' +
      '</tr>'
    ).join('');
  }
}

function codexStatusBadge(s) {
  const map = { ready:'badge-ready', cloning:'badge-cloning', error:'badge-error' };
  return '<span class="badge ' + (map[s]||'badge-cancelled') + '">' + esc(s) + '</span>';
}

// ── Utilities ────────────────────────────────────────────────────
function statusBadge(s) {
  return '<span class="badge badge-' + s + '">' + esc(s) + '</span>';
}

function statusDot(s) {
  const colors = { pending:'var(--yellow)', running:'var(--blue)', completed:'var(--green)', failed:'var(--red)' };
  return '<span style="width:7px;height:7px;border-radius:50%;background:' + (colors[s]||'var(--muted)') + ';display:inline-block;flex-shrink:0"></span>';
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

function fmtDuration(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms/1000).toFixed(1) + 's';
  return Math.floor(ms/60000) + 'm ' + Math.round((ms%60000)/1000) + 's';
}

function stableSort(arr, col, dir) {
  return [...arr].sort((a, b) => {
    const av = a[col] ?? '', bv = b[col] ?? '';
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });
}

function updateSortHeaders(tbodyId, sort) {
  const table = document.getElementById(tbodyId)?.closest('table');
  if (!table) return;
  table.querySelectorAll('th').forEach(th => {
    const col = th.dataset?.col;
    th.classList.toggle('sorted', col === sort.col);
    const icon = th.querySelector('.sort-icon');
    if (icon && col === sort.col) icon.textContent = sort.dir === 'asc' ? '↑' : '↓';
    else if (icon) icon.textContent = '↕';
  });
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

// ── Init ─────────────────────────────────────────────────────────
loadOverview();
</script>
</body>
</html>`;
}

=== FILE: packages/plugins/dashboard/src/index.ts ===
/**
 * @shardworks/dashboard-apparatus — The Dashboard.
 *
 * Web-based guild operations dashboard. Exposes the `dashboard-start` CLI
 * tool which launches a local web server with a live operations UI including
 * tabs for Overview, Clerk, Spider, Animator, and Codexes.
 *
 * Usage:
 *   nsg dashboard start
 *   nsg dashboard start --port 8080
 *   nsg dashboard start --no-open
 */

import { createDashboard } from './dashboard.ts';

export { createDashboard } from './dashboard.ts';

// ── Default export: the apparatus plugin ──────────────────────────

export default createDashboard();

=== FILE: packages/plugins/dashboard/src/rig-types.ts ===
/**
 * Local type stubs for Spider rig documents read via Stacks readBook().
 */

export interface EngineInstance {
  id: string;
  designId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  upstream: string[];
  givensSpec: Record<string, unknown>;
  yields?: unknown;
  error?: string;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface RigDoc {
  id: string;
  writId: string;
  status: 'running' | 'completed' | 'failed';
  engines: EngineInstance[];
  [key: string]: unknown;
}

=== FILE: packages/plugins/dashboard/src/server.ts ===
/**
 * Dashboard HTTP server.
 *
 * Serves the web UI at / and REST API endpoints at /api/*.
 * Uses only Node built-ins — no express or other dependencies.
 */

import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { guild } from '@shardworks/nexus-core';
import type { ClerkApi, WritDoc, WritStatus } from '@shardworks/clerk-apparatus';
import type { StacksApi, WhereClause } from '@shardworks/stacks-apparatus';
import type { SessionDoc } from './types.ts';
import type { RigDoc } from './rig-types.ts';
import { getDashboardHtml } from './html.ts';

// ── Types for codexes (optional apparatus) ────────────────────────

interface CodexRecord {
  name: string;
  remoteUrl: string;
  cloneStatus: string;
  activeDrafts: number;
}

interface DraftRecord {
  id: string;
  codexName: string;
  branch: string;
  path: string;
  createdAt: string;
  associatedWith?: string;
}

interface ScriptoriumApi {
  list(): Promise<CodexRecord[]>;
  listDrafts(codexName?: string): Promise<DraftRecord[]>;
}

// ── Helpers ───────────────────────────────────────────────────────

function json(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

function error(res: ServerResponse, msg: string, status = 500): void {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(msg);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function parseQS(url: string): Record<string, string> {
  const qm = url.indexOf('?');
  if (qm < 0) return {};
  return Object.fromEntries(new URLSearchParams(url.slice(qm + 1)));
}

function pathname(url: string): string {
  const qm = url.indexOf('?');
  return qm < 0 ? url : url.slice(0, qm);
}

function tryApparatus<T>(name: string): T | null {
  try { return guild().apparatus<T>(name); }
  catch { return null; }
}

// ── Request router ────────────────────────────────────────────────

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const path   = pathname(req.url ?? '/');
  const qs     = parseQS(req.url ?? '');

  // ── Web UI ──────────────────────────────────────────────────────
  if (path === '/' || path === '/index.html') {
    const html = getDashboardHtml();
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
    });
    res.end(html);
    return;
  }

  // ── API: Overview ───────────────────────────────────────────────
  if (path === '/api/overview' && method === 'GET') {
    try {
      const g = guild();
      const config = g.guildConfig();
      const plugins = [
        ...g.kits().map(k => ({ id: k.id, version: k.version, type: 'kit' as const })),
        ...g.apparatuses().map(a => ({ id: a.id, version: a.version, type: 'apparatus' as const })),
      ].sort((a, b) => a.id.localeCompare(b.id));

      const counts: Record<string, unknown> = {};

      const clerk = tryApparatus<ClerkApi>('clerk');
      if (clerk) {
        counts.writs    = await clerk.count();
        counts.ready    = await clerk.count({ status: 'ready' });
        counts.active   = await clerk.count({ status: 'active' });
      }

      const stacks = tryApparatus<StacksApi>('stacks');
      if (stacks) {
        try {
          const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
          counts.sessions        = await sessions.count();
          counts.runningSessions = await sessions.count([['status', '=', 'running']]);
        } catch { /* animator not installed */ }

        try {
          const rigs = stacks.readBook<RigDoc>('spider', 'rigs');
          counts.rigs        = await rigs.count();
          counts.runningRigs = await rigs.count([['status', '=', 'running']]);
        } catch { /* spider not installed */ }
      }

      const scriptorium = tryApparatus<ScriptoriumApi>('codexes');
      if (scriptorium) {
        const codexList = await scriptorium.list();
        counts.codexes     = codexList.length;
        counts.codexNames  = codexList.map(c => c.name);
      }

      json(res, { guild: config, plugins, counts });
    } catch (e) {
      error(res, (e as Error).message);
    }
    return;
  }

  // ── API: Writs ──────────────────────────────────────────────────
  if (path === '/api/writs' && method === 'GET') {
    const clerk = tryApparatus<ClerkApi>('clerk');
    if (!clerk) { error(res, 'Clerk apparatus not installed', 404); return; }
    try {
      const filters: { status?: WritStatus; type?: string; limit?: number; offset?: number } = {};
      if (qs.status) filters.status = qs.status as WritStatus;
      if (qs.type)   filters.type   = qs.type;
      filters.limit  = qs.limit  ? parseInt(qs.limit,  10) : 20;
      filters.offset = qs.offset ? parseInt(qs.offset, 10) : 0;

      const [writs, total] = await Promise.all([
        clerk.list(filters),
        clerk.count({ status: filters.status, type: filters.type }),
      ]);

      // Derive declared types from guild config
      const clerkConfig = guild().guildConfig().clerk;
      const types = ['mandate', ...(clerkConfig?.writTypes?.map(t => t.name) ?? [])];

      json(res, { writs, total, types });
    } catch (e) {
      error(res, (e as Error).message);
    }
    return;
  }

  if (path === '/api/writs' && method === 'POST') {
    const clerk = tryApparatus<ClerkApi>('clerk');
    if (!clerk) { error(res, 'Clerk apparatus not installed', 404); return; }
    try {
      const body = await readBody(req) as { title: string; body: string; type?: string; codex?: string };
      const writ = await clerk.post({
        title: body.title,
        body:  body.body,
        ...(body.type  ? { type:  body.type  } : {}),
        ...(body.codex ? { codex: body.codex } : {}),
      });
      json(res, writ, 201);
    } catch (e) {
      error(res, (e as Error).message, 400);
    }
    return;
  }

  // ── API: Writ transition ─────────────────────────────────────────
  const transMatch = path.match(/^\/api\/writs\/([^/]+)\/transition$/);
  if (transMatch && method === 'POST') {
    const clerk = tryApparatus<ClerkApi>('clerk');
    if (!clerk) { error(res, 'Clerk apparatus not installed', 404); return; }
    try {
      const id = transMatch[1];
      const body = await readBody(req) as { to: WritStatus; resolution?: string };
      const fields: Partial<WritDoc> = {};
      if (body.resolution) fields.resolution = body.resolution;
      const writ = await clerk.transition(id, body.to, Object.keys(fields).length ? fields : undefined);
      json(res, writ);
    } catch (e) {
      error(res, (e as Error).message, 400);
    }
    return;
  }

  // ── API: Sessions ────────────────────────────────────────────────
  if (path === '/api/sessions' && method === 'GET') {
    const stacks = tryApparatus<StacksApi>('stacks');
    if (!stacks) { json(res, { sessions: [], total: 0 }); return; }
    try {
      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const limit  = qs.limit  ? parseInt(qs.limit,  10) : 20;
      const offset = qs.offset ? parseInt(qs.offset, 10) : 0;
      const where: WhereClause | undefined = qs.status
        ? [['status', '=', qs.status]]
        : undefined;
      const [rows, total] = await Promise.all([
        sessions.find({ where, orderBy: ['startedAt', 'desc'], limit, offset }),
        sessions.count(where),
      ]);
      json(res, { sessions: rows, total });
    } catch (e) {
      json(res, { sessions: [], total: 0 });
    }
    return;
  }

  // ── API: Rigs ────────────────────────────────────────────────────
  if (path === '/api/rigs' && method === 'GET') {
    const stacks = tryApparatus<StacksApi>('stacks');
    if (!stacks) { json(res, { rigs: [] }); return; }
    try {
      const rigs = stacks.readBook<RigDoc>('spider', 'rigs');
      const where: WhereClause | undefined = qs.status
        ? [['status', '=', qs.status]]
        : undefined;
      const rows = await rigs.find({
        where,
        orderBy: ['id', 'desc'],
        limit: 100,
      });
      json(res, { rigs: rows });
    } catch (e) {
      json(res, { rigs: [] });
    }
    return;
  }

  // ── API: Codexes ─────────────────────────────────────────────────
  if (path === '/api/codexes' && method === 'GET') {
    const scriptorium = tryApparatus<ScriptoriumApi>('codexes');
    if (!scriptorium) { json(res, { codexes: [], drafts: [] }); return; }
    try {
      const [codexes, drafts] = await Promise.all([
        scriptorium.list(),
        scriptorium.listDrafts(),
      ]);
      json(res, { codexes, drafts });
    } catch (e) {
      error(res, (e as Error).message);
    }
    return;
  }

  // ── 404 ──────────────────────────────────────────────────────────
  error(res, 'Not found', 404);
}

// ── Server factory ────────────────────────────────────────────────

export interface DashboardServer {
  port: number;
  url: string;
  close(): Promise<void>;
}

export async function startServer(port: number): Promise<DashboardServer> {
  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res);
    } catch (e) {
      if (!res.headersSent) {
        error(res, (e as Error).message ?? 'Internal error');
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, '127.0.0.1', resolve);
    server.once('error', reject);
  });

  const addr = server.address() as { port: number };
  const actualPort = addr.port;

  return {
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(err => err ? reject(err) : resolve());
    }),
  };
}

=== FILE: packages/plugins/dispatch/README.md ===
# `@shardworks/dispatch-apparatus`

> **⚠️ Temporary rigging.** The Dispatch is a stand-in for the full rigging system (Spider, Fabricator, Executor). When that system exists, this apparatus is retired.

The Dispatch is the guild's interim work runner. It bridges the gap between the Clerk (which tracks obligations) and the session machinery (which runs animas). It does one thing: find the oldest ready writ and execute it.

The Dispatch sits downstream of the Clerk and Animator:
`clerk ← dispatch → animator → (codexes)`

---

## Installation

Add to your package's dependencies:

```json
{
  "@shardworks/dispatch-apparatus": "workspace:*"
}
```

The Dispatch requires the Clerk, Scriptorium (codexes), and Animator to be installed in the guild. The Loom is recommended (used indirectly via `Animator.summon()`). The Stacks is used internally by the Clerk but is not a direct dependency of the Dispatch.

---

## API

The Dispatch exposes a `DispatchApi` via its `provides` interface, retrieved at runtime:

```typescript
import type { DispatchApi } from '@shardworks/dispatch-apparatus';

const dispatch = guild().apparatus<DispatchApi>('dispatch');
```

### `next(request?): Promise<DispatchResult | null>`

Find the oldest ready writ and execute it.

```typescript
// Dispatch with defaults (role: 'artificer')
const result = await dispatch.next();

// Dispatch with a specific role
const result = await dispatch.next({ role: 'scribe' });

// Dry run — preview without dispatching
const result = await dispatch.next({ dryRun: true });

if (!result) {
  console.log('No ready writs.');
} else {
  console.log(result.outcome); // 'completed' | 'failed' | undefined (dryRun)
}
```

| Parameter | Type | Description |
|---|---|---|
| `role` | `string` | Role to summon (default: `"artificer"`) |
| `dryRun` | `boolean` | If true, find and report the writ but don't dispatch |

Returns `null` if no ready writs exist.

---

## Dispatch Lifecycle

```
next({ role: 'artificer' })
│
├─ 1. Query Clerk: clerk.list({ status: 'ready' }), take oldest (last in desc list)
│     → if none found, return null
│
├─ 2. Clerk: transition writ ready → active
│
├─ 3. [if writ.codex] Scriptorium: openDraft({ codexName: writ.codex })
│     → draftRecord (worktree path = session cwd)
│     → if no codex on writ, cwd = guild home
│
├─ 4. Animator: summon({
│       role, prompt, cwd,
│       environment: { GIT_*_EMAIL: `${writ.id}@nexus.local` },
│       metadata: { writId, trigger: 'dispatch' }
│     })
│     → { chunks, result }
│
├─ 5. Await result
│
├─ 6a. [success] Session completed normally
│      ├─ [if codex] Scriptorium: seal({ codexName, sourceBranch: draft.branch })
│      ├─ [if codex] Scriptorium: push({ codexName })
│      ├─ Clerk: transition writ active → completed
│      └─ return DispatchResult { outcome: 'completed' }
│
└─ 6b. [failure] Session failed or timed out
       ├─ [if codex] Scriptorium: abandonDraft({ codexName, branch, force: true })
       ├─ Clerk: transition writ active → failed
       └─ return DispatchResult { outcome: 'failed' }
```

### Error Handling

| Failure | Writ transition | Draft |
|---|---|---|
| No ready writs | none | n/a |
| Draft open fails | → `failed` | n/a (never opened) |
| Session fails | → `failed` | abandoned (force) |
| Seal fails | → `failed` | **preserved** (for recovery) |
| Push fails | → `failed` | **preserved** (for recovery) |

The Dispatch owns writ transitions — the anima does **not** call `writ-complete` or `writ-fail`. This keeps writ lifecycle management out of anima instructions.

---

## Support Kit

The Dispatch contributes one tool:

### Tools

| Tool | Permission | Callable by | Description |
|---|---|---|---|
| `dispatch-next` | `dispatch:write` | `cli` | Find and dispatch the oldest ready writ |

---

## Key Types

```typescript
interface DispatchApi {
  next(request?: DispatchRequest): Promise<DispatchResult | null>;
}

interface DispatchRequest {
  role?: string;    // default: 'artificer'
  dryRun?: boolean;
}

interface DispatchResult {
  writId: string;
  sessionId?: string;                    // absent if dryRun
  outcome?: 'completed' | 'failed';     // absent if dryRun
  resolution?: string;                  // absent if dryRun
  dryRun: boolean;
}
```

See `src/types.ts` for the complete type definitions.

---

## Configuration

No configuration. The Dispatch reads writs from the Clerk and uses default behaviors for all apparatus calls. The role is specified per dispatch via the tool parameter.

---

## Exports

The package exports all public types and the `createDispatch()` factory:

```typescript
import dispatchPlugin, { createDispatch, type DispatchApi } from '@shardworks/dispatch-apparatus';
```

The default export is a pre-built plugin instance, ready for guild installation.

=== FILE: packages/plugins/dispatch/src/dispatch.ts ===
/**
 * The Dispatch — interim work runner.
 *
 * Bridges the Clerk (which tracks obligations) and the session machinery
 * (which runs animas). Finds the oldest ready writ and executes it:
 * opens a draft binding, composes context, launches a session, and handles
 * the aftermath (seal the draft, transition the writ).
 *
 * This apparatus is temporary rigging — designed to be retired when the
 * full rigging system (Spider, Fabricator, Executor) is implemented.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */

import type { Plugin } from '@shardworks/nexus-core';
import { guild } from '@shardworks/nexus-core';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';
import type { ScriptoriumApi, DraftRecord } from '@shardworks/codexes-apparatus';
import type { AnimatorApi, SessionResult } from '@shardworks/animator-apparatus';

import type { DispatchApi, DispatchRequest, DispatchResult } from './types.ts';
import { dispatchNext } from './tools/index.ts';

// ── Prompt assembly ──────────────────────────────────────────────────

function assemblePrompt(writ: WritDoc): string {
  const lines = [
    'You have been dispatched to fulfill a commission.',
    '',
    '## Assignment',
    '',
    `**Title:** ${writ.title}`,
    '',
    `**Writ ID:** ${writ.id}`,
  ];

  if (writ.body) {
    lines.push('', writ.body);
  }

  return lines.join('\n');
}

// ── Apparatus factory ────────────────────────────────────────────────

/**
 * Create the Dispatch apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['clerk', 'codexes', 'animator']`
 * - `recommends: ['loom']` — used indirectly via Animator.summon()
 * - `provides: DispatchApi` — the dispatch API
 * - `supportKit` — contributes the `dispatch-next` tool
 */
export function createDispatch(): Plugin {
  const api: DispatchApi = {
    async next(request?: DispatchRequest): Promise<DispatchResult | null> {
      const role = request?.role ?? 'artificer';
      const dryRun = request?.dryRun ?? false;

      const clerk = guild().apparatus<ClerkApi>('clerk');

      // 1. Find oldest ready writ (FIFO — list returns desc by createdAt, take last)
      const readyWrits = await clerk.list({ status: 'ready' });
      const writ = readyWrits[readyWrits.length - 1] ?? null;

      if (!writ) return null;

      if (dryRun) {
        return { writId: writ.id, dryRun: true };
      }

      const scriptorium = guild().apparatus<ScriptoriumApi>('codexes');
      const animator = guild().apparatus<AnimatorApi>('animator');

      // 2. Transition writ ready → active
      await clerk.transition(writ.id, 'active');

      // 3. Open draft if writ has a codex
      const codexName = typeof writ.codex === 'string' ? writ.codex : undefined;
      let draft: DraftRecord | undefined;

      if (codexName) {
        try {
          draft = await scriptorium.openDraft({ codexName, associatedWith: writ.id });
        } catch (err) {
          const reason = `Draft open failed: ${String(err)}`;
          await clerk.transition(writ.id, 'failed', { resolution: reason });
          return { writId: writ.id, outcome: 'failed', resolution: reason, dryRun: false };
        }
      }

      // Session cwd: draft worktree path if codex, otherwise guild home
      const cwd = draft?.path ?? guild().home;

      // 4. Assemble prompt and summon anima
      const prompt = assemblePrompt(writ);
      const handle = animator.summon({
        role,
        prompt,
        cwd,
        environment: {
          GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
        },
        metadata: { writId: writ.id, trigger: 'dispatch' },
      });

      // 5. Await session result
      let session: SessionResult;
      try {
        session = await handle.result;
      } catch (err) {
        // Unexpected rejection (summon normally resolves with a failed status)
        const reason = `Session error: ${String(err)}`;
        if (codexName && draft) {
          await scriptorium.abandonDraft({ codexName, branch: draft.branch, force: true });
        }
        await clerk.transition(writ.id, 'failed', { resolution: reason });
        return { writId: writ.id, outcome: 'failed', resolution: reason, dryRun: false };
      }

      // 6a. Success path
      if (session.status === 'completed') {
        if (codexName && draft) {
          // Seal the draft — fail writ if seal fails but preserve draft for recovery
          try {
            await scriptorium.seal({ codexName, sourceBranch: draft.branch });
          } catch (err) {
            const reason = `Seal failed: ${String(err)}`;
            await clerk.transition(writ.id, 'failed', { resolution: reason });
            return { writId: writ.id, sessionId: session.id, outcome: 'failed', resolution: reason, dryRun: false };
          }

          // Push — same treatment as seal failure
          try {
            await scriptorium.push({ codexName });
          } catch (err) {
            const reason = `Push failed: ${String(err)}`;
            await clerk.transition(writ.id, 'failed', { resolution: reason });
            return { writId: writ.id, sessionId: session.id, outcome: 'failed', resolution: reason, dryRun: false };
          }
        }

        const resolution = `Session ${session.id} completed`;
        await clerk.transition(writ.id, 'completed', { resolution });
        return { writId: writ.id, sessionId: session.id, outcome: 'completed', resolution, dryRun: false };
      }

      // 6b. Failure path (status: 'failed' | 'timeout')
      if (codexName && draft) {
        await scriptorium.abandonDraft({ codexName, branch: draft.branch, force: true });
      }
      const reason = session.error ?? `Session ${session.status}`;
      await clerk.transition(writ.id, 'failed', { resolution: reason });
      return { writId: writ.id, sessionId: session.id, outcome: 'failed', resolution: reason, dryRun: false };
    },
  };

  return {
    apparatus: {
      requires: ['clerk', 'codexes', 'animator'],
      recommends: ['loom'],

      supportKit: {
        tools: [dispatchNext],
      },

      provides: api,

      start(): void {
        // No initialization needed — clerk is resolved at call time in next().
      },
    },
  };
}

=== FILE: packages/plugins/dispatch/src/index.ts ===
/**
 * @shardworks/dispatch-apparatus — The Dispatch.
 *
 * Interim work runner: finds the oldest ready writ and executes it through
 * the guild's session machinery. Opens a draft binding on the target codex,
 * summons an anima via The Animator, and handles the aftermath (seal the
 * draft, transition the writ). Disposable — retired when the full rigging
 * system (Spider, Fabricator, Executor) is implemented.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */

import { createDispatch } from './dispatch.ts';

// ── Dispatch API ──────────────────────────────────────────────────────

export {
  type DispatchApi,
  type DispatchRequest,
  type DispatchResult,
} from './types.ts';

export { createDispatch } from './dispatch.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createDispatch();

=== FILE: packages/plugins/fabricator/src/fabricator.ts ===
/**
 * The Fabricator — guild engine design registry apparatus.
 *
 * Scans installed engine designs from kit contributions and apparatus supportKits,
 * and serves them to the Spider on demand.
 *
 * The Fabricator does not execute engines. It is a pure query service:
 * designs in, designs out.
 */

import type {
  StartupContext,
  LoadedPlugin,
  LoadedApparatus,
  Plugin,
} from '@shardworks/nexus-core';
import {
  guild,
  isLoadedKit,
  isLoadedApparatus,
} from '@shardworks/nexus-core';

// ── Public types ──────────────────────────────────────────────────────

/** Minimal execution context passed to an engine's run() method. */
export interface EngineRunContext {
  /** Simple string identity for this engine instance (e.g. 'draft', 'implement'). */
  engineId: string;
  /** All upstream yields, keyed by engine id. Escape hatch for engines that need to inspect the full upstream chain. */
  upstream: Record<string, unknown>;
}

/**
 * The result of an engine run.
 *
 * 'completed' — synchronous work done inline, yields are available immediately.
 * 'launched'  — async work launched in a session; the Spider polls for completion.
 */
export type EngineRunResult =
  | { status: 'completed'; yields: unknown }
  | { status: 'launched'; sessionId: string };

/**
 * An engine design — the unit of work the Fabricator catalogues and the
 * Spider executes. Kit authors import this type from @shardworks/fabricator-apparatus.
 */
export interface EngineDesign {
  /** Unique identifier for this engine design (e.g. 'draft', 'implement', 'review'). */
  id: string;

  /**
   * Execute this engine.
   *
   * @param givens   — the engine's declared inputs, assembled by the Spider.
   * @param context  — minimal execution context: engine id and upstream yields.
   */
  run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;
}

/** The Fabricator's public API, exposed via `provides`. */
export interface FabricatorApi {
  /**
   * Look up an engine design by ID.
   * Returns the design if registered, undefined otherwise.
   */
  getEngineDesign(id: string): EngineDesign | undefined;
}

// ── Type guard ────────────────────────────────────────────────────────

/** Narrow an unknown value to EngineDesign. */
function isEngineDesign(value: unknown): value is EngineDesign {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).run === 'function'
  );
}

// ── Implementation ────────────────────────────────────────────────────

/** The engine design registry — populated at startup, queried at runtime. */
class EngineRegistry {
  private readonly designs = new Map<string, EngineDesign>();

  /** Register all engine designs from a loaded plugin. */
  register(plugin: LoadedPlugin): void {
    if (isLoadedKit(plugin)) {
      this.registerFromKit(plugin.kit);
    } else if (isLoadedApparatus(plugin)) {
      if (plugin.apparatus.supportKit) {
        this.registerFromKit(plugin.apparatus.supportKit);
      }
    }
  }

  /** Extract and register engine designs from a kit (or supportKit) contribution. */
  private registerFromKit(kit: Record<string, unknown>): void {
    const rawEngines = kit.engines;
    if (typeof rawEngines !== 'object' || rawEngines === null) return;

    for (const value of Object.values(rawEngines as Record<string, unknown>)) {
      if (isEngineDesign(value)) {
        this.designs.set(value.id, value);
      }
    }
  }

  /** Look up an engine design by ID. */
  get(id: string): EngineDesign | undefined {
    return this.designs.get(id);
  }
}

// ── Apparatus factory ─────────────────────────────────────────────────

/**
 * Create the Fabricator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['engines']` — scans kit/supportKit contributions
 * - `provides: FabricatorApi` — the engine design registry API
 */
export function createFabricator(): Plugin {
  const registry = new EngineRegistry();

  const api: FabricatorApi = {
    getEngineDesign(id: string): EngineDesign | undefined {
      return registry.get(id);
    },
  };

  return {
    apparatus: {
      requires: [],
      consumes: ['engines'],
      provides: api,

      start(ctx: StartupContext): void {
        const g = guild();

        // Scan all already-loaded kits. These fired plugin:initialized before
        // any apparatus started, so we can't catch them via events.
        for (const kit of g.kits()) {
          registry.register(kit);
        }

        // Subscribe to plugin:initialized for apparatus supportKits that
        // fire after us in the startup sequence.
        ctx.on('plugin:initialized', (plugin: unknown) => {
          const loaded = plugin as LoadedPlugin;
          // Skip kits — we already scanned them above.
          if (isLoadedApparatus(loaded)) {
            registry.register(loaded);
          }
        });
      },
    },
  };
}

=== FILE: packages/plugins/spider/package.json ===
{
  "name": "@shardworks/spider-apparatus",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus",
    "directory": "packages/plugins/spider"
  },
  "description": "The Spider — rig execution engine apparatus",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/fabricator-apparatus": "workspace:*",
    "@shardworks/stacks-apparatus": "workspace:*",
    "@shardworks/clerk-apparatus": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "@shardworks/animator-apparatus": "workspace:*",
    "@shardworks/codexes-apparatus": "workspace:*",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@types/node": "25.5.0"
  },
  "files": [
    "dist"
  ],
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
}

=== FILE: packages/plugins/spider/src/engines/draft.ts ===
/**
 * Draft engine — clockwork.
 *
 * Opens a draft binding via the Scriptorium. Returns DraftYields
 * containing the worktree path and branch name for downstream engines.
 */

import { execSync } from 'node:child_process';
import { guild } from '@shardworks/nexus-core';
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import type { ScriptoriumApi } from '@shardworks/codexes-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';
import type { DraftYields } from '../types.ts';

const draftEngine: EngineDesign = {
  id: 'draft',

  async run(givens, _context) {
    const scriptorium = guild().apparatus<ScriptoriumApi>('codexes');
    const writ = givens.writ as WritDoc;

    if (!writ.codex) {
      throw new Error(
        `Writ "${writ.id}" has no codex — cannot open a draft binding.`,
      );
    }

    const draft = await scriptorium.openDraft({
      codexName: writ.codex,
      associatedWith: writ.id,
    });

    const baseSha = execSync('git rev-parse HEAD', { cwd: draft.path, encoding: 'utf-8' }).trim();

    const yields: DraftYields = {
      draftId: draft.id,
      codexName: draft.codexName,
      branch: draft.branch,
      path: draft.path,
      baseSha,
    };

    return { status: 'completed', yields };
  },
};

export default draftEngine;

=== FILE: packages/plugins/spider/src/engines/implement.ts ===
/**
 * Implement engine — quick (Animator-backed).
 *
 * Summons an anima to do the commissioned work. Wraps the writ body with
 * a commit instruction, then calls animator.summon() with the draft
 * worktree as the working directory. Returns `{ status: 'launched', sessionId }`
 * so the Spider's collect step can poll for completion on subsequent walks.
 */

import { guild } from '@shardworks/nexus-core';
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import type { AnimatorApi } from '@shardworks/animator-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';
import type { DraftYields } from '../types.ts';

const implementEngine: EngineDesign = {
  id: 'implement',

  async run(givens, context) {
    const animator = guild().apparatus<AnimatorApi>('animator');
    const writ = givens.writ as WritDoc;
    const draft = context.upstream['draft'] as DraftYields;

    const prompt = `${writ.body}\n\nCommit all changes before ending your session.`;

    const handle = animator.summon({
      role: givens.role as string,
      prompt,
      cwd: draft.path,
      environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
      metadata: { engineId: context.engineId, writId: writ.id },
    });

    const sessionResult = await handle.result;
    return { status: 'launched', sessionId: sessionResult.id };
  },
};

export default implementEngine;

=== FILE: packages/plugins/spider/src/engines/index.ts ===
export { default as draftEngine } from './draft.ts';
export { default as implementEngine } from './implement.ts';
export { default as reviewEngine } from './review.ts';
export { default as reviseEngine } from './revise.ts';
export { default as sealEngine } from './seal.ts';

=== FILE: packages/plugins/spider/src/engines/review.ts ===
/**
 * Review engine — quick (Animator-backed).
 *
 * Runs mechanical checks (build/test) synchronously in the draft worktree,
 * then summons a reviewer anima to assess the implementation against the spec.
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can parse the reviewer's findings from session.output on subsequent walks.
 *
 * Collect step (Spider):
 *   - Reads session.output as the reviewer's structured markdown findings
 *   - Parses `passed` from /^###\s*Overall:\s*PASS/mi
 *   - Retrieves mechanicalChecks from session.metadata
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { guild } from '@shardworks/nexus-core';
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import type { AnimatorApi } from '@shardworks/animator-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';
import type { DraftYields, MechanicalCheck } from '../types.ts';

const execFileAsync = promisify(execFile);

async function runCheck(name: 'build' | 'test', command: string, cwd: string): Promise<MechanicalCheck> {
  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync('sh', ['-c', command], { cwd });
    const output = (stdout + stderr).slice(0, 4096);
    return { name, passed: true, output, durationMs: Date.now() - start };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string };
    const output = ((execErr.stdout ?? '') + (execErr.stderr ?? '')).slice(0, 4096);
    return { name, passed: false, output, durationMs: Date.now() - start };
  }
}

async function gitDiff(cwd: string, baseSha: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', `${baseSha}..HEAD`], { cwd });
    return stdout;
  } catch {
    return '';
  }
}

async function gitStatus(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
    return stdout;
  } catch {
    return '';
  }
}

function assembleReviewPrompt(writ: WritDoc, diff: string, status: string, checks: MechanicalCheck[]): string {
  const checksSection = checks.length === 0
    ? '(No mechanical checks configured.)'
    : checks.map((c) => `### ${c.name}: ${c.passed ? 'PASSED' : 'FAILED'}\n\`\`\`\n${c.output}\n\`\`\``).join('\n\n');

  return `# Code Review

You are reviewing work on a commission. Your job is to assess whether the
implementation satisfies the spec, identify any gaps or problems, and produce
a structured findings document.

## The Commission (Spec)

${writ.body}

## Implementation Diff

Changes since the draft was opened:

\`\`\`diff
${diff}
\`\`\`

## Current Worktree State

\`\`\`
${status}
\`\`\`

## Mechanical Check Results

${checksSection}

## Instructions

Assess the implementation against the spec. Produce your findings in this format:

### Overall: PASS or FAIL

### Completeness
- Which spec requirements are addressed?
- Which are missing or partially addressed?

### Correctness
- Are there bugs, logic errors, or regressions?
- Do the tests pass? If not, what fails?

### Quality
- Code style consistent with the codebase?
- Appropriate test coverage for new code?
- Any concerns about the approach?

### Required Changes (if FAIL)
Numbered list of specific changes needed, in priority order.

Produce your findings as your final message in the format above.`;
}

const reviewEngine: EngineDesign = {
  id: 'review',

  async run(givens, context) {
    const animator = guild().apparatus<AnimatorApi>('animator');
    const writ = givens.writ as WritDoc;
    const draft = context.upstream['draft'] as DraftYields;

    // 1. Run mechanical checks synchronously before the reviewer session
    const checks: MechanicalCheck[] = [];
    if (givens.buildCommand) {
      checks.push(await runCheck('build', givens.buildCommand as string, draft.path));
    }
    if (givens.testCommand) {
      checks.push(await runCheck('test', givens.testCommand as string, draft.path));
    }

    // 2. Compute diff since draft opened and current worktree state
    const diff = await gitDiff(draft.path, draft.baseSha);
    const status = await gitStatus(draft.path);

    // 3. Assemble review prompt
    const prompt = assembleReviewPrompt(writ, diff, status, checks);

    // 4. Launch reviewer session — stash mechanicalChecks in metadata for collect step
    const handle = animator.summon({
      role: givens.role as string,
      prompt,
      cwd: draft.path,
      metadata: {
        engineId: context.engineId,
        writId: writ.id,
        mechanicalChecks: checks,
      },
    });

    const sessionResult = await handle.result;
    return { status: 'launched', sessionId: sessionResult.id };
  },
};

export default reviewEngine;

=== FILE: packages/plugins/spider/src/engines/revise.ts ===
/**
 * Revise engine — quick (Animator-backed).
 *
 * Summons an anima to address review findings. If the review passed, the
 * prompt instructs the anima to confirm and exit without unnecessary changes.
 * If the review failed, the prompt directs the anima to address each item
 * in the findings and commit the result.
 *
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can store ReviseYields on completion.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { guild } from '@shardworks/nexus-core';
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import type { AnimatorApi } from '@shardworks/animator-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';
import type { DraftYields, ReviewYields } from '../types.ts';

const execFileAsync = promisify(execFile);

async function gitStatus(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
    return stdout;
  } catch {
    return '';
  }
}

async function gitDiffUncommitted(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', 'HEAD'], { cwd });
    return stdout;
  } catch {
    return '';
  }
}

function assembleRevisionPrompt(writ: WritDoc, review: ReviewYields, status: string, diff: string): string {
  const reviewResult = review.passed ? 'PASS' : 'FAIL';
  const instructions = review.passed
    ? `The review passed. No changes are required. Confirm the work looks correct\nand exit. Do not make unnecessary changes or spend unnecessary time reassessing.`
    : `The review identified issues that need to be addressed. See "Required Changes"\nin the findings above. Address each item, then commit your changes.`;

  const diffSection = diff.trim()
    ? `\`\`\`diff\n${diff}\n\`\`\``
    : '(No uncommitted changes.)';

  return `# Revision Pass

You are revising prior work on a commission based on review findings.

## The Commission (Spec)

${writ.body}

## Review Findings

${review.findings}

## Review Result: ${reviewResult}

${instructions}

## Current State

\`\`\`
${status}
\`\`\`

${diffSection}

Commit all changes before ending your session.`;
}

const reviseEngine: EngineDesign = {
  id: 'revise',

  async run(givens, context) {
    const animator = guild().apparatus<AnimatorApi>('animator');
    const writ = givens.writ as WritDoc;
    const draft = context.upstream['draft'] as DraftYields;
    const review = context.upstream['review'] as ReviewYields;

    const status = await gitStatus(draft.path);
    const diff = await gitDiffUncommitted(draft.path);
    const prompt = assembleRevisionPrompt(writ, review, status, diff);

    const handle = animator.summon({
      role: givens.role as string,
      prompt,
      cwd: draft.path,
      environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
      metadata: { engineId: context.engineId, writId: writ.id },
    });

    const sessionResult = await handle.result;
    return { status: 'launched', sessionId: sessionResult.id };
  },
};

export default reviseEngine;

=== FILE: packages/plugins/spider/src/engines/seal.ts ===
/**
 * Seal engine — clockwork.
 *
 * Seals the draft binding via the Scriptorium. Reads the draft branch
 * from context.upstream['draft'] (the DraftYields from the draft engine).
 * Returns SealYields with the sealed commit info.
 */

import { guild } from '@shardworks/nexus-core';
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import type { ScriptoriumApi } from '@shardworks/codexes-apparatus';
import type { DraftYields, SealYields } from '../types.ts';

const sealEngine: EngineDesign = {
  id: 'seal',

  async run(_givens, context) {
    const scriptorium = guild().apparatus<ScriptoriumApi>('codexes');
    const draftYields = context.upstream['draft'] as DraftYields | undefined;

    if (!draftYields) {
      throw new Error('Seal engine requires draft yields in context.upstream but none found.');
    }

    const result = await scriptorium.seal({
      codexName: draftYields.codexName,
      sourceBranch: draftYields.branch,
    });

    const yields: SealYields = {
      sealedCommit: result.sealedCommit,
      strategy: result.strategy,
      retries: result.retries,
      inscriptionsSealed: result.inscriptionsSealed,
    };

    return { status: 'completed', yields };
  },
};

export default sealEngine;

=== FILE: packages/plugins/spider/src/index.ts ===
/**
 * @shardworks/spider-apparatus — The Spider.
 *
 * Rig execution engine: spawns rigs for ready writs, drives engine pipelines
 * to completion, and transitions writs via the Clerk on rig completion/failure.
 *
 * Public types (RigDoc, EngineInstance, CrawlResult, SpiderApi, etc.) are
 * re-exported for consumers that inspect walk results or rig state.
 */

import { createSpider } from './spider.ts';

// ── Public types ──────────────────────────────────────────────────────

export type {
  EngineStatus,
  EngineInstance,
  RigStatus,
  RigDoc,
  CrawlResult,
  SpiderApi,
  SpiderConfig,
  DraftYields,
  SealYields,
} from './types.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createSpider();

=== FILE: packages/plugins/spider/src/spider.test.ts ===
/**
 * Spider — unit tests.
 *
 * Tests rig lifecycle, walk priority ordering, engine execution (clockwork
 * and quick), failure propagation, and CDC-driven writ transitions.
 *
 * Uses in-memory Stacks backend and mock Guild singleton.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild, generateId } from '@shardworks/nexus-core';
import type { Guild, GuildConfig, LoadedKit, LoadedApparatus, StartupContext } from '@shardworks/nexus-core';

import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
import type { StacksApi } from '@shardworks/stacks-apparatus';

import { createClerk } from '@shardworks/clerk-apparatus';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';

import { createFabricator } from '@shardworks/fabricator-apparatus';
import type { FabricatorApi, EngineDesign } from '@shardworks/fabricator-apparatus';

import type { AnimatorApi, SummonRequest, AnimateHandle, SessionChunk, SessionResult, SessionDoc } from '@shardworks/animator-apparatus';

import { createSpider } from './spider.ts';
import type { SpiderApi, RigDoc, EngineInstance, ReviewYields, MechanicalCheck } from './types.ts';

// ── Test bootstrap ────────────────────────────────────────────────────

/**
 * Build a minimal StartupContext that captures and fires events.
 */
function buildCtx(): {
  ctx: StartupContext;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => void | Promise<void>>>();
  const ctx: StartupContext = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };
  async function fire(event: string, ...args: unknown[]): Promise<void> {
    for (const h of handlers.get(event) ?? []) {
      await h(...args);
    }
  }
  return { ctx, fire };
}

/**
 * Full integration fixture: starts Stacks (memory), Clerk, Fabricator,
 * and Spider. Returns handles to each API plus mock animator controls.
 */
function buildFixture(
  guildConfig: Partial<GuildConfig> = {},
  initialSessionOutcome: { status: 'completed' | 'failed'; error?: string; output?: string } = { status: 'completed' },
): {
  stacks: StacksApi;
  clerk: ClerkApi;
  fabricator: FabricatorApi;
  spider: SpiderApi;
  memBackend: InstanceType<typeof MemoryBackend>;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
  summonCalls: SummonRequest[];
  setSessionOutcome: (outcome: { status: 'completed' | 'failed'; error?: string; output?: string }) => void;
} {
  const memBackend = new MemoryBackend();
  const stacksPlugin = createStacksApparatus(memBackend);
  const clerkPlugin = createClerk();
  const fabricatorPlugin = createFabricator();
  const spiderPlugin = createSpider();

  if (!('apparatus' in stacksPlugin)) throw new Error('stacks must be apparatus');
  if (!('apparatus' in clerkPlugin)) throw new Error('clerk must be apparatus');
  if (!('apparatus' in fabricatorPlugin)) throw new Error('fabricator must be apparatus');
  if (!('apparatus' in spiderPlugin)) throw new Error('spider must be apparatus');

  const stacksApparatus = stacksPlugin.apparatus;
  const clerkApparatus = clerkPlugin.apparatus;
  const fabricatorApparatus = fabricatorPlugin.apparatus;
  const spiderApparatus = spiderPlugin.apparatus;

  const apparatusMap = new Map<string, unknown>();

  const fakeGuildConfig: GuildConfig = {
    name: 'test-guild',
    nexus: '0.0.0',
    plugins: [],
    ...guildConfig,
  };

  const fakeGuild: Guild = {
    home: '/tmp/test-guild',
    apparatus<T>(name: string): T {
      const api = apparatusMap.get(name);
      if (!api) throw new Error(`Apparatus "${name}" not found`);
      return api as T;
    },
    config<T>(_pluginId: string): T { return {} as T; },
    writeConfig() {},
    guildConfig() { return fakeGuildConfig; },
    kits(): LoadedKit[] { return []; },
    apparatuses(): LoadedApparatus[] { return []; },
  };

  setGuild(fakeGuild);

  // Start stacks with memory backend
  const noopCtx = { on: () => {} };
  stacksApparatus.start(noopCtx);
  const stacks = stacksApparatus.provides as StacksApi;
  apparatusMap.set('stacks', stacks);

  // Manually ensure all books the Spider and Clerk need
  memBackend.ensureBook({ ownerId: 'clerk', book: 'writs' }, {
    indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
  });
  memBackend.ensureBook({ ownerId: 'spider', book: 'rigs' }, {
    indexes: ['status', 'writId', ['status', 'writId']],
  });
  memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
    indexes: ['startedAt', 'status'],
  });

  // Mock animator — captures summon() calls and writes session docs to Stacks.
  // The implement engine awaits handle.result to get the session id; the mock
  // writes a terminal session record before resolving so the Spider's collect
  // step finds it on the next walk() call.
  let currentSessionOutcome = initialSessionOutcome;
  const summonCalls: SummonRequest[] = [];
  const mockAnimatorApi: AnimatorApi = {
    summon(request: SummonRequest): AnimateHandle {
      summonCalls.push(request);
      const sessionId = generateId('ses', 4);
      const startedAt = new Date().toISOString();
      const outcome = currentSessionOutcome;

      const result = (async (): Promise<SessionResult> => {
        const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
        const endedAt = new Date().toISOString();
        const doc: SessionDoc = {
          id: sessionId,
          status: outcome.status,
          startedAt,
          endedAt,
          durationMs: 0,
          provider: 'mock',
          exitCode: outcome.status === 'completed' ? 0 : 1,
          ...(outcome.error ? { error: outcome.error } : {}),
          ...(outcome.output !== undefined ? { output: outcome.output } : {}),
          metadata: request.metadata,
        };
        await sessBook.put(doc);
        return {
          id: sessionId,
          status: outcome.status,
          startedAt,
          endedAt,
          durationMs: 0,
          provider: 'mock',
          exitCode: outcome.status === 'completed' ? 0 : 1,
          ...(outcome.error ? { error: outcome.error } : {}),
          ...(outcome.output !== undefined ? { output: outcome.output } : {}),
          metadata: request.metadata,
        } as SessionResult;
      })();

      async function* emptyChunks(): AsyncIterable<SessionChunk> {}
      return { chunks: emptyChunks(), result };
    },
    animate(): AnimateHandle {
      throw new Error('animate() not used in Spider tests');
    },
  };
  apparatusMap.set('animator', mockAnimatorApi);

  // Start clerk
  clerkApparatus.start(noopCtx);
  const clerk = clerkApparatus.provides as ClerkApi;
  apparatusMap.set('clerk', clerk);

  // Start fabricator with its own ctx so we can fire events
  const { ctx: fabricatorCtx, fire } = buildCtx();
  fabricatorApparatus.start(fabricatorCtx);
  const fabricator = fabricatorApparatus.provides as FabricatorApi;
  apparatusMap.set('fabricator', fabricator);

  // Start spider
  spiderApparatus.start(noopCtx);
  const spider = spiderApparatus.provides as SpiderApi;
  apparatusMap.set('spider', spider);

  // Simulate plugin:initialized for the Spider so the Fabricator scans
  // its supportKit and picks up the five engine designs.
  const spiderLoaded: LoadedApparatus = {
    packageName: '@shardworks/spider-apparatus',
    id: 'spider',
    version: '0.0.0',
    apparatus: spiderApparatus,
  };
  // Fire synchronously — fabricator's handler is sync
  void fire('plugin:initialized', spiderLoaded);

  return {
    stacks, clerk, fabricator, spider, memBackend, fire,
    summonCalls,
    setSessionOutcome(outcome: { status: 'completed' | 'failed'; error?: string; output?: string }) {
      currentSessionOutcome = outcome;
    },
  };
}

/** Get the rigs book. */
function rigsBook(stacks: StacksApi) {
  return stacks.book<RigDoc>('spider', 'rigs');
}

/** Post a writ. */
async function postWrit(clerk: ClerkApi, title = 'Test writ', codex?: string): Promise<WritDoc> {
  return clerk.post({ title, body: 'Test body', codex });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Spider', () => {
  let fix: ReturnType<typeof buildFixture>;

  beforeEach(() => {
    fix = buildFixture();
  });

  afterEach(() => {
    clearGuild();
  });

  // ── Fabricator integration ─────────────────────────────────────────

  describe('Fabricator — Spider engine registration', () => {
    it('registers all five engine designs in the Fabricator', () => {
      const { fabricator } = fix;
      assert.ok(fabricator.getEngineDesign('draft'), 'draft engine registered');
      assert.ok(fabricator.getEngineDesign('implement'), 'implement engine registered');
      assert.ok(fabricator.getEngineDesign('review'), 'review engine registered');
      assert.ok(fabricator.getEngineDesign('revise'), 'revise engine registered');
      assert.ok(fabricator.getEngineDesign('seal'), 'seal engine registered');
    });

    it('returns undefined for an unknown engine ID', () => {
      assert.equal(fix.fabricator.getEngineDesign('nonexistent'), undefined);
    });
  });

  // ── walk() idle ────────────────────────────────────────────────────

  describe('walk() — idle', () => {
    it('returns null when there is no work', async () => {
      const result = await fix.spider.crawl();
      assert.equal(result, null);
    });
  });

  // ── Spawn ──────────────────────────────────────────────────────────

  describe('walk() — spawn', () => {
    it('spawns a rig for a ready writ and transitions writ to active', async () => {
      const { clerk, spider, stacks } = fix;
      const writ = await postWrit(clerk);
      assert.equal(writ.status, 'ready');

      const result = await spider.crawl();
      assert.ok(result !== null, 'expected a walk result');
      assert.equal(result.action, 'rig-spawned');
      assert.equal((result as { writId: string }).writId, writ.id);

      const rigs = await rigsBook(stacks).list();
      assert.equal(rigs.length, 1);
      assert.equal(rigs[0].writId, writ.id);
      assert.equal(rigs[0].status, 'running');
      assert.equal(rigs[0].engines.length, 5);

      // Writ should now be active
      const updatedWrit = await clerk.show(writ.id);
      assert.equal(updatedWrit.status, 'active');
    });

    it('does not spawn a second rig for a writ that already has one', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);

      await spider.crawl(); // spawns rig

      const rigs = await rigsBook(stacks).list();
      assert.equal(rigs.length, 1, 'only one rig should exist');
    });

    it('spawns rigs for the oldest ready writ first (FIFO)', async () => {
      const { clerk, spider } = fix;

      // Small delay to ensure different createdAt timestamps
      const w1 = await postWrit(clerk, 'First writ');
      await new Promise((r) => setTimeout(r, 2));
      const w2 = await postWrit(clerk, 'Second writ');

      const r1 = await spider.crawl();
      assert.equal(r1?.action, 'rig-spawned');
      assert.equal((r1 as { writId: string }).writId, w1.id);

      // Mark rig1 as failed so w2 can spawn
      const rigs = await rigsBook(fix.stacks).list();
      await rigsBook(fix.stacks).patch(rigs[0].id, { status: 'failed' });

      const r2 = await spider.crawl();
      assert.equal(r2?.action, 'rig-spawned');
      assert.equal((r2 as { writId: string }).writId, w2.id);
    });
  });

  // ── Priority ordering ──────────────────────────────────────────────

  describe('walk() — priority ordering: collect > run > spawn', () => {
    it('runs before spawning when a rig already exists', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);

      // Spawn the rig
      const r1 = await spider.crawl();
      assert.equal(r1?.action, 'rig-spawned');

      // Second walk should run (not spawn another rig)
      // The draft engine will fail (no codexes), resulting in 'rig-completed'
      const r2 = await spider.crawl();
      assert.notEqual(r2?.action, 'rig-spawned');
      // Only one rig created
      const rigs = await rigsBook(stacks).list();
      assert.equal(rigs.length, 1);
    });

    it('collects before running when a running engine has a terminal session', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      // Set draft to running with a session
      const enginesWithSession = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft'
          ? { ...e, status: 'running' as const, sessionId: fakeSessionId }
          : e,
      );
      await book.patch(rig.id, { engines: enginesWithSession });

      // Insert terminal session
      const sessBook = stacks.book<{ id: string; status: string; startedAt: string; provider: string; [key: string]: unknown }>('animator', 'sessions');
      await sessBook.put({ id: fakeSessionId, status: 'completed', startedAt: new Date().toISOString(), provider: 'test' });

      // Walk should collect (not run implement which has no completed upstream)
      const r = await spider.crawl();
      assert.equal(r?.action, 'engine-completed');
      assert.equal((r as { engineId: string }).engineId, 'draft');
    });
  });

  // ── Engine readiness ───────────────────────────────────────────────

  describe('engine readiness — upstream must complete first', () => {
    it('only the first engine (no upstream) is runnable initially', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const [rig] = await rigsBook(stacks).list();

      // All engines except draft should have upstream
      const draft = rig.engines.find((e: EngineInstance) => e.id === 'draft');
      const implement = rig.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.deepEqual(draft?.upstream, []);
      assert.deepEqual(implement?.upstream, ['draft']);
    });

    it('implement only launches after draft is completed', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Mark draft as completed
      const updatedEngines = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft'
          ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p' } }
          : e,
      );
      await book.patch(rig.id, { engines: updatedEngines });

      // Now walk should launch implement (quick engine → 'engine-started', not 'engine-completed')
      const result = await spider.crawl();
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'implement');
    });
  });

  // ── Quick engine execution (implement) ────────────────────────────

  describe('implement engine execution', () => {
    it('launches session on first walk, then collects yields on second walk', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft so implement can run
      const updatedEngines = rig0.engines.map((e: EngineInstance) =>
        e.id === 'draft'
          ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p' } }
          : e,
      );
      await book.patch(rig0.id, { engines: updatedEngines });

      // Walk: implement launches an Animator session (quick engine → 'engine-started')
      const result = await spider.crawl();
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'implement');

      const [rig1] = await book.list();
      const impl1 = rig1.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl1?.status, 'running', 'engine should be running after launch');
      assert.ok(impl1?.sessionId !== undefined, 'sessionId should be stored');

      // Walk: collect step finds the terminal session and stores yields
      const result2 = await spider.crawl();
      assert.equal(result2?.action, 'engine-completed');
      assert.equal((result2 as { engineId: string }).engineId, 'implement');

      const [rig2] = await book.list();
      const impl2 = rig2.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl2?.status, 'completed');
      assert.ok(impl2?.yields !== undefined, 'yields should be stored');
      assert.doesNotThrow(() => JSON.stringify(impl2?.yields));
    });

    it('marks engine and rig failed when engine design is not found', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Inject a bad designId for draft
      const brokenEngines = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft' ? { ...e, designId: 'nonexistent-engine' } : e,
      );
      await book.patch(rig.id, { engines: brokenEngines });

      const result = await spider.crawl();
      assert.equal(result?.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const draft = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draft?.status, 'failed');
      assert.ok(draft?.error?.includes('nonexistent-engine'));
    });
  });

  // ── Yield serialization failure ────────────────────────────────────

  describe('yield serialization failure', () => {
    it('non-serializable engine yields cause engine and rig failure', async () => {
      const { clerk, spider, stacks, fire } = fix;

      // Register an engine design that returns non-JSON-serializable yields
      const badEngine: EngineDesign = {
        id: 'bad-engine',
        async run() {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return { status: 'completed' as const, yields: { fn: (() => {}) as any } };
        },
      };
      const fakePlugin: LoadedApparatus = {
        packageName: '@test/bad-engine',
        id: 'test-bad',
        version: '0.0.0',
        apparatus: {
          requires: [],
          supportKit: { engines: { 'bad-engine': badEngine } },
          provides: {},
          start() {},
        },
      };
      void fire('plugin:initialized', fakePlugin);

      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Patch draft to use the bad engine design
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, designId: 'bad-engine' } : e,
        ),
      });

      const result = await spider.crawl();
      assert.ok(result !== null);
      assert.equal(result.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const draft = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draft?.status, 'failed');
      assert.ok(draft?.error !== undefined && draft.error.length > 0, `expected engine to have an error, got: ${draft?.error}`);
    });
  });

  // ── Implement engine — summon args and prompt wrapping ────────────

  describe('implement engine — Animator integration', () => {
    it('calls animator.summon() with role, prompt, cwd, environment, and metadata', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      const writ = await postWrit(clerk, 'My commission', 'my-codex');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/the/worktree' } }
            : e,
        ),
      });

      const launchResult = await spider.crawl(); // launch implement
      assert.equal(launchResult?.action, 'engine-started');

      assert.equal(summonCalls.length, 1, 'summon should be called once');
      const call = summonCalls[0];
      assert.equal(call.role, 'artificer', 'role defaults to artificer');
      assert.equal(call.cwd, '/the/worktree', 'cwd is draft worktree path');
      assert.deepEqual(call.environment, { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` });
      assert.deepEqual(call.metadata, { engineId: 'implement', writId: writ.id });
    });

    it('wraps the writ body with a commit instruction', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      await clerk.post({ title: 'My writ', body: 'Build the feature.' });
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
            : e,
        ),
      });

      const launchResult2 = await spider.crawl(); // launch implement
      assert.equal(launchResult2?.action, 'engine-started');

      assert.equal(summonCalls.length, 1);
      const expectedPrompt = 'Build the feature.\n\nCommit all changes before ending your session.';
      assert.equal(summonCalls[0].prompt, expectedPrompt);
    });

    it('session failure propagates: engine fails → rig fails → writ transitions to failed', async () => {
      const { clerk, spider, stacks, setSessionOutcome } = fix;
      setSessionOutcome({ status: 'failed', error: 'Process exited with code 1' });

      const writ = await postWrit(clerk, 'Failing writ');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
            : e,
        ),
      });

      await spider.crawl(); // launch implement (session already terminal in Stacks)
      await spider.crawl(); // collect: session failed → engine fails → rig fails

      const [updatedRig] = await book.list();
      assert.equal(updatedRig.status, 'failed', 'rig should be failed');
      const impl = updatedRig.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'failed', 'implement engine should be failed');

      const failedWrit = await clerk.show(writ.id);
      assert.equal(failedWrit.status, 'failed', 'writ should transition to failed via CDC');
    });

    it('ImplementYields contain sessionId and sessionStatus from the session record', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk, 'Yields test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
            : e,
        ),
      });

      await spider.crawl(); // launch
      await spider.crawl(); // collect

      const [updated] = await book.list();
      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'completed');
      const yields = impl?.yields as Record<string, unknown>;
      assert.ok(typeof yields.sessionId === 'string', 'sessionId should be a string');
      assert.equal(yields.sessionStatus, 'completed');
    });
  });

  // ── Quick engine collect ───────────────────────────────────────────

  describe('quick engine — collect', () => {
    it('collects yields from a terminal session in the sessions book', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      // Simulate: draft completed, implement launched a session
      const enginesWithSession = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') {
          return { ...e, status: 'completed' as const, yields: { draftId: 'x', codexName: 'c', branch: 'b', path: '/p' } };
        }
        if (e.id === 'implement') {
          return { ...e, status: 'running' as const, sessionId: fakeSessionId };
        }
        return e;
      });
      await book.patch(rig.id, { engines: enginesWithSession });

      // Insert terminal session record
      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string;
        output?: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: 'Session completed successfully',
      });

      // Walk: collect step should find the terminal session
      const result = await spider.crawl();
      assert.equal(result?.action, 'engine-completed');
      assert.equal((result as { engineId: string }).engineId, 'implement');

      const [updated] = await book.list();
      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'completed');
      assert.ok(impl?.yields !== undefined);
      const yields = impl?.yields as Record<string, unknown>;
      assert.equal(yields.sessionId, fakeSessionId);
      assert.equal(yields.sessionStatus, 'completed');
    });

    it('marks engine and rig failed when session failed', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      const enginesWithSession = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') {
          return { ...e, status: 'completed' as const, yields: { draftId: 'x' } };
        }
        if (e.id === 'implement') {
          return { ...e, status: 'running' as const, sessionId: fakeSessionId };
        }
        return e;
      });
      await book.patch(rig.id, { engines: enginesWithSession });

      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string;
        error?: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'failed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        error: 'Process exited with code 1',
      });

      const result = await spider.crawl();
      assert.equal(result?.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'failed');
    });

    it('does not collect a still-running session', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      const enginesWithSession = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') {
          return { ...e, status: 'completed' as const, yields: { draftId: 'x' } };
        }
        if (e.id === 'implement') {
          return { ...e, status: 'running' as const, sessionId: fakeSessionId };
        }
        return e;
      });
      await book.patch(rig.id, { engines: enginesWithSession });

      // Session is still running
      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'running',
        startedAt: new Date().toISOString(),
        provider: 'test',
      });

      // Nothing to collect, implement is running (no pending with completed upstream),
      // spawn skips (rig exists) → null
      const result = await spider.crawl();
      assert.equal(result, null);
    });
  });

  // ── Failure propagation ────────────────────────────────────────────

  describe('failure propagation', () => {
    it('engine failure → rig failed → writ transitions to failed via CDC', async () => {
      const { clerk, spider, stacks } = fix;
      const writ = await postWrit(clerk);

      await spider.crawl(); // spawn (writ → active)
      const activeWrit = await clerk.show(writ.id);
      assert.equal(activeWrit.status, 'active');

      // Inject bad design to trigger failure
      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const brokenEngines = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft' ? { ...e, designId: 'broken' } : e,
      );
      await book.patch(rig.id, { engines: brokenEngines });

      // Walk: engine fails → rig fails → CDC → writ fails
      await spider.crawl();

      const [updatedRig] = await book.list();
      assert.equal(updatedRig.status, 'failed');

      const failedWrit = await clerk.show(writ.id);
      assert.equal(failedWrit.status, 'failed');
    });
  });

  // ── Givens/context assembly ────────────────────────────────────────

  describe('givens and context assembly', () => {
    it('each engine receives only the givens it needs', async () => {
      const { clerk, spider, stacks } = fix;
      const writ = await postWrit(clerk, 'My writ');
      await spider.crawl(); // spawn

      const [rig] = await rigsBook(stacks).list();
      const eng = (id: string) => rig.engines.find((e: EngineInstance) => e.id === id)!;

      // draft: { writ } — no role
      assert.ok('writ' in eng('draft').givensSpec, 'draft should have writ');
      assert.ok(!('role' in eng('draft').givensSpec), 'draft should not have role');
      assert.equal((eng('draft').givensSpec.writ as WritDoc).id, writ.id);

      // implement: { writ, role }
      assert.ok('writ' in eng('implement').givensSpec, 'implement should have writ');
      assert.ok('role' in eng('implement').givensSpec, 'implement should have role');
      assert.equal((eng('implement').givensSpec.writ as WritDoc).id, writ.id);

      // review: { writ, role: 'reviewer' }
      assert.ok('writ' in eng('review').givensSpec, 'review should have writ');
      assert.equal(eng('review').givensSpec.role, 'reviewer', 'review role should be hardcoded reviewer');

      // revise: { writ, role }
      assert.ok('writ' in eng('revise').givensSpec, 'revise should have writ');
      assert.ok('role' in eng('revise').givensSpec, 'revise should have role');

      // seal: {}
      assert.deepEqual(eng('seal').givensSpec, {}, 'seal should get empty givensSpec');
    });

    it('role defaults to "artificer" when not configured', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const [rig] = await rigsBook(stacks).list();
      const implementEngine = rig.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(implementEngine?.givensSpec.role, 'artificer');
    });

    it('upstream map is built from completed engine yields', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Mark draft + implement as completed
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      const implYields = { sessionId: 'stub', sessionStatus: 'completed' };
      const updatedEngines = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
        if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: implYields };
        return e;
      });
      await book.patch(rig.id, { engines: updatedEngines });

      // Walk: review launches a session (quick engine → 'engine-started')
      const result = await spider.crawl();
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'review');

      // Walk: collect step picks up the completed review session
      const result2 = await spider.crawl();
      assert.equal(result2?.action, 'engine-completed');
      assert.equal((result2 as { engineId: string }).engineId, 'review');
    });
  });

  // ── Full pipeline ─────────────────────────────────────────────────

  describe('full pipeline', () => {
    it('walks through implement → review → revise → rig completion → writ completed', async () => {
      const { clerk, spider, stacks } = fix;
      const writ = await postWrit(clerk, 'Full pipeline test');

      await spider.crawl(); // spawn (writ → active)

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft (real impl would need codexes)
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig0.id, {
        engines: rig0.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, status: 'completed' as const, yields: draftYields } : e,
        ),
      });

      // Walk: implement launches an Animator session (quick engine)
      const r1 = await spider.crawl();
      assert.equal(r1?.action, 'engine-started');
      assert.equal((r1 as { engineId: string }).engineId, 'implement');

      // Walk: collect step picks up the completed implement session
      const r1c = await spider.crawl();
      assert.equal(r1c?.action, 'engine-completed');
      assert.equal((r1c as { engineId: string }).engineId, 'implement');

      // Walk: review launches a session (quick engine)
      const r2 = await spider.crawl();
      assert.equal(r2?.action, 'engine-started');
      assert.equal((r2 as { engineId: string }).engineId, 'review');

      // Walk: collect review session
      const r2c = await spider.crawl();
      assert.equal(r2c?.action, 'engine-completed');
      assert.equal((r2c as { engineId: string }).engineId, 'review');

      // Walk: revise launches a session (quick engine)
      const r3 = await spider.crawl();
      assert.equal(r3?.action, 'engine-started');
      assert.equal((r3 as { engineId: string }).engineId, 'revise');

      // Walk: collect revise session
      const r3c = await spider.crawl();
      assert.equal(r3c?.action, 'engine-completed');
      assert.equal((r3c as { engineId: string }).engineId, 'revise');

      // Pre-complete seal (real impl would need codexes)
      const [rig3] = await book.list();
      const sealYields = { sealedCommit: 'abc123', strategy: 'fast-forward', retries: 0, inscriptionsSealed: 5 };
      await book.patch(rig3.id, {
        engines: rig3.engines.map((e: EngineInstance) =>
          e.id === 'seal' ? { ...e, status: 'completed' as const, yields: sealYields } : e,
        ),
        status: 'completed',
      });

      // CDC should have fired — writ should now be completed
      const finalWrit = await clerk.show(writ.id);
      assert.equal(finalWrit.status, 'completed');

      const [finalRig] = await book.list();
      assert.equal(finalRig.status, 'completed');
    });

    it('walks all 5 engines to rig completion without manual seal patching', async () => {
      const { clerk, spider, stacks, fire } = fix;

      // Register a stub seal engine that doesn't require Scriptorium
      const stubSealEngine: EngineDesign = {
        id: 'seal',
        async run() {
          return {
            status: 'completed' as const,
            yields: { sealedCommit: 'abc', strategy: 'fast-forward' as const, retries: 0, inscriptionsSealed: 1 },
          };
        },
      };
      const fakePlugin: LoadedApparatus = {
        packageName: '@test/stub-seal',
        id: 'test-seal',
        version: '0.0.0',
        apparatus: {
          requires: [],
          supportKit: { engines: { seal: stubSealEngine } },
          provides: {},
          start() {},
        },
      };
      void fire('plugin:initialized', fakePlugin);

      const writ = await postWrit(clerk, 'Full pipeline stub seal');
      await spider.crawl(); // spawn (writ → active)

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft (requires Scriptorium — not available in tests)
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig0.id, {
        engines: rig0.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, status: 'completed' as const, yields: draftYields } : e,
        ),
      });

      // implement launches
      const r1 = await spider.crawl();
      assert.equal(r1?.action, 'engine-started');
      assert.equal((r1 as { engineId: string }).engineId, 'implement');

      // collect implement
      const r1c = await spider.crawl();
      assert.equal(r1c?.action, 'engine-completed');
      assert.equal((r1c as { engineId: string }).engineId, 'implement');

      // review launches (quick engine)
      const r2 = await spider.crawl();
      assert.equal(r2?.action, 'engine-started');
      assert.equal((r2 as { engineId: string }).engineId, 'review');

      // collect review
      const r2c = await spider.crawl();
      assert.equal(r2c?.action, 'engine-completed');
      assert.equal((r2c as { engineId: string }).engineId, 'review');

      // revise launches (quick engine)
      const r3 = await spider.crawl();
      assert.equal(r3?.action, 'engine-started');
      assert.equal((r3 as { engineId: string }).engineId, 'revise');

      // collect revise
      const r3c = await spider.crawl();
      assert.equal(r3c?.action, 'engine-completed');
      assert.equal((r3c as { engineId: string }).engineId, 'revise');

      // seal runs (stub) — last engine → rig completes
      const r4 = await spider.crawl();
      assert.equal(r4?.action, 'rig-completed');
      assert.equal((r4 as { outcome: string }).outcome, 'completed');

      // CDC should have fired — writ should now be completed
      const finalWrit = await clerk.show(writ.id);
      assert.equal(finalWrit.status, 'completed', 'writ should transition to completed via CDC');

      const [finalRig] = await book.list();
      assert.equal(finalRig.status, 'completed');
    });
  });

  // ── Review engine — Animator integration ─────────────────────────

  describe('review engine — Animator integration', () => {
    it('calls animator.summon() with reviewer role, draft cwd, and prompt containing spec', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      const writ = await postWrit(clerk, 'Review integration test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      const result = await spider.crawl(); // launch review
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'review');

      assert.equal(summonCalls.length, 1, 'summon should be called once for review');
      const call = summonCalls[0];
      assert.equal(call.role, 'reviewer', 'review engine uses reviewer role');
      assert.equal(call.cwd, '/p', 'cwd is the draft worktree path');
      assert.ok(call.prompt.includes('# Code Review'), 'prompt includes review header');
      assert.ok(call.prompt.includes(writ.body), 'prompt includes writ body (spec)');
      assert.ok(call.prompt.includes('## Instructions'), 'prompt includes instructions section');
      assert.ok(call.prompt.includes('### Overall: PASS or FAIL'), 'prompt includes findings format');
      assert.deepEqual(call.metadata?.mechanicalChecks, [], 'no mechanical checks when not configured');
    });

    it('collects ReviewYields: parses PASS from session.output', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      const findings = '### Overall: PASS\n\n### Completeness\nAll requirements met.';
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: findings,
        metadata: { mechanicalChecks: [] },
      });

      const result = await spider.crawl(); // collect review
      assert.equal(result?.action, 'engine-completed');
      assert.equal((result as { engineId: string }).engineId, 'review');

      const [updated] = await book.list();
      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
      const yields = reviewEngine?.yields as ReviewYields;
      assert.equal(yields.sessionId, fakeSessionId);
      assert.equal(yields.passed, true, 'passed should be true when output contains PASS');
      assert.equal(yields.findings, findings);
      assert.deepEqual(yields.mechanicalChecks, []);
    });

    it('collects ReviewYields: passed is false when output contains FAIL', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: '### Overall: FAIL\n\n### Required Changes\n1. Fix the bug.',
        metadata: { mechanicalChecks: [] },
      });

      await spider.crawl(); // collect review
      const [updated] = await book.list();
      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
      const yields = reviewEngine?.yields as ReviewYields;
      assert.equal(yields.passed, false, 'passed should be false when output contains FAIL');
    });

    it('collects ReviewYields: mechanicalChecks retrieved from session.metadata', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      const checks: MechanicalCheck[] = [
        { name: 'build', passed: true, output: 'Build succeeded', durationMs: 1200 },
        { name: 'test', passed: false, output: '3 tests failed', durationMs: 4500 },
      ];
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: '### Overall: FAIL',
        metadata: { mechanicalChecks: checks },
      });

      await spider.crawl(); // collect review
      const [updated] = await book.list();
      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
      const yields = reviewEngine?.yields as ReviewYields;
      assert.equal(yields.mechanicalChecks.length, 2);
      assert.equal(yields.mechanicalChecks[0].name, 'build');
      assert.equal(yields.mechanicalChecks[0].passed, true);
      assert.equal(yields.mechanicalChecks[1].name, 'test');
      assert.equal(yields.mechanicalChecks[1].passed, false);
    });
  });

  // ── Review engine — mechanical checks ────────────────────────────

  describe('review engine — mechanical checks', () => {
    let mechFix: ReturnType<typeof buildFixture>;

    beforeEach(() => {
      mechFix = buildFixture({
        spider: {
          buildCommand: 'echo "build output"',
          testCommand: 'exit 1',
        },
      });
    });

    afterEach(() => {
      clearGuild();
    });

    it('executes build and test commands; captures pass/fail from exit code', async () => {
      const { clerk, spider, stacks, summonCalls } = mechFix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/tmp', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      const result = await spider.crawl(); // launch review (runs checks first)
      assert.equal(result?.action, 'engine-started');

      assert.equal(summonCalls.length, 1);
      const checks = summonCalls[0].metadata?.mechanicalChecks as MechanicalCheck[];
      assert.equal(checks.length, 2, 'both build and test checks should run');

      const buildCheck = checks.find((c) => c.name === 'build');
      assert.ok(buildCheck, 'build check should be present');
      assert.equal(buildCheck!.passed, true, 'echo exits 0 → passed');
      assert.ok(buildCheck!.output.includes('build output'), 'output captured from stdout');
      assert.ok(typeof buildCheck!.durationMs === 'number', 'durationMs recorded');

      const testCheck = checks.find((c) => c.name === 'test');
      assert.ok(testCheck, 'test check should be present');
      assert.equal(testCheck!.passed, false, 'exit 1 → failed');
    });

    it('skips checks gracefully when no buildCommand or testCommand configured', async () => {
      const noCmdFix = buildFixture({ spider: {} }); // no buildCommand/testCommand
      const { clerk, spider: w, stacks: s, summonCalls: sc } = noCmdFix;
      await postWrit(clerk);
      await w.crawl(); // spawn

      const book = rigsBook(s);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      await w.crawl(); // launch review
      assert.deepEqual(sc[0].metadata?.mechanicalChecks, [], 'no checks when commands not configured');
      clearGuild();
    });

    it('truncates check output to 4KB', async () => {
      const bigFix = buildFixture({
        spider: { buildCommand: 'python3 -c "print(\'x\' * 8192)"' },
      });
      const { clerk, spider: w, stacks: s, summonCalls: sc } = bigFix;
      await postWrit(clerk);
      await w.crawl(); // spawn

      const book = rigsBook(s);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/tmp', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      await w.crawl(); // launch review (runs check with big output)
      const checks = sc[0].metadata?.mechanicalChecks as MechanicalCheck[];
      assert.ok(checks[0].output.length <= 4096, `output should be truncated to 4KB, got ${checks[0].output.length} chars`);
      clearGuild();
    });
  });

  // ── Revise engine — Animator integration ─────────────────────────

  describe('revise engine — Animator integration', () => {
    it('calls animator.summon() with role from givens, draft cwd, and writ env', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      const writ = await postWrit(clerk, 'Revise integration test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const reviewYields: ReviewYields = { sessionId: 'rev-1', passed: true, findings: '### Overall: PASS\nAll good.', mechanicalChecks: [] };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          return e;
        }),
      });

      const result = await spider.crawl(); // launch revise
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'revise');

      assert.equal(summonCalls.length, 1, 'summon called once for revise');
      const call = summonCalls[0];
      assert.equal(call.role, 'artificer', 'revise uses role from givens (default artificer)');
      assert.equal(call.cwd, '/p', 'cwd is draft worktree path');
      assert.deepEqual(call.environment, { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` });
    });

    it('revision prompt includes pass branch when review passed', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      await postWrit(clerk, 'Pass branch test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const reviewYields: ReviewYields = {
        sessionId: 'rev-1',
        passed: true,
        findings: '### Overall: PASS\nAll requirements met.',
        mechanicalChecks: [],
      };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          return e;
        }),
      });

      await spider.crawl(); // launch revise
      const prompt = summonCalls[0].prompt;
      assert.ok(prompt.includes('## Review Result: PASS'), 'prompt includes PASS result');
      assert.ok(prompt.includes('The review passed'), 'prompt includes pass branch instruction');
      assert.ok(prompt.includes(reviewYields.findings), 'prompt includes review findings');
    });

    it('revision prompt includes fail branch when review failed', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      await postWrit(clerk, 'Fail branch test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const reviewYields: ReviewYields = {
        sessionId: 'rev-1',
        passed: false,
        findings: '### Overall: FAIL\n\n### Required Changes\n1. Fix the bug.',
        mechanicalChecks: [],
      };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          return e;
        }),
      });

      await spider.crawl(); // launch revise
      const prompt = summonCalls[0].prompt;
      assert.ok(prompt.includes('## Review Result: FAIL'), 'prompt includes FAIL result');
      assert.ok(
        prompt.includes('The review identified issues that need to be addressed'),
        'prompt includes fail branch instruction',
      );
      assert.ok(prompt.includes(reviewYields.findings), 'prompt includes review findings');
    });

    it('ReviseYields: sessionId and sessionStatus collected from session record', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      const reviewYields: ReviewYields = { sessionId: 'rev-1', passed: true, findings: '### Overall: PASS', mechanicalChecks: [] };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          if (e.id === 'revise') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
      });

      const result = await spider.crawl(); // collect revise
      assert.equal(result?.action, 'engine-completed');
      assert.equal((result as { engineId: string }).engineId, 'revise');

      const [updated] = await book.list();
      const reviseEngine = updated.engines.find((e: EngineInstance) => e.id === 'revise');
      const yields = reviseEngine?.yields as { sessionId: string; sessionStatus: string };
      assert.equal(yields.sessionId, fakeSessionId);
      assert.equal(yields.sessionStatus, 'completed');
    });
  });

  // ── Walk returns null ──────────────────────────────────────────────

  describe('walk() returns null', () => {
    it('returns null when no rigs exist and no ready writs', async () => {
      const result = await fix.spider.crawl();
      assert.equal(result, null);
    });

    it('returns null when the rig has a running engine with no terminal session', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      // Put draft in 'running' with a live session
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'running' as const, sessionId: fakeSessionId }
            : e,
        ),
      });

      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'running',
        startedAt: new Date().toISOString(),
        provider: 'test',
      });

      const result = await spider.crawl();
      assert.equal(result, null);
    });
  });
});

=== FILE: packages/plugins/spider/src/spider.ts ===
/**
 * The Spider — rig execution engine apparatus.
 *
 * The Spider drives writ-to-completion by managing rigs: ordered pipelines
 * of engine instances. Each crawl() call performs one unit of work:
 *
 *   collect > run > spawn   (priority order)
 *
 * collect — check running engines for terminal session results
 * run     — execute the next pending engine (clockwork inline, quick → launch)
 * spawn   — create a new rig for a ready writ with no existing rig
 *
 * CDC on the rigs book (Phase 1 cascade) transitions the associated writ
 * when a rig reaches a terminal state (completed or failed).
 *
 * See: docs/architecture/apparatus/spider.md
 */

import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import { guild, generateId } from '@shardworks/nexus-core';
import type { StacksApi, Book, ReadOnlyBook } from '@shardworks/stacks-apparatus';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';
import type { FabricatorApi } from '@shardworks/fabricator-apparatus';
import type { SessionDoc } from '@shardworks/animator-apparatus';

import type {
  RigDoc,
  EngineInstance,
  SpiderApi,
  CrawlResult,
  SpiderConfig,
} from './types.ts';

import {
  draftEngine,
  implementEngine,
  reviewEngine,
  reviseEngine,
  sealEngine,
} from './engines/index.ts';

import { crawlTool, crawlContinualTool } from './tools/index.ts';

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Check whether a value is JSON-serializable.
 * Non-serializable yields cause engine failure — the Stacks cannot store them.
 */
function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the upstream yields map for a rig: all completed engine yields
 * keyed by engine id. Passed as context.upstream to the engine's run().
 */
function buildUpstreamMap(rig: RigDoc): Record<string, unknown> {
  const upstream: Record<string, unknown> = {};
  for (const engine of rig.engines) {
    if (engine.status === 'completed' && engine.yields !== undefined) {
      upstream[engine.id] = engine.yields;
    }
  }
  return upstream;
}

/**
 * Find the first pending engine whose entire upstream is completed.
 * Returns null if no runnable engine exists.
 */
function findRunnableEngine(rig: RigDoc): EngineInstance | null {
  for (const engine of rig.engines) {
    if (engine.status !== 'pending') continue;
    const allUpstreamDone = engine.upstream.every((upstreamId) => {
      const dep = rig.engines.find((e) => e.id === upstreamId);
      return dep?.status === 'completed';
    });
    if (allUpstreamDone) return engine;
  }
  return null;
}

/**
 * Produce the five-engine static pipeline for a writ.
 * Each engine receives only the givens it needs.
 * Upstream yields arrive via context.upstream at run time.
 */
function buildStaticEngines(writ: WritDoc, config: SpiderConfig): EngineInstance[] {
  const role = config.role ?? 'artificer';
  const reviewGivens: Record<string, unknown> = {
    writ,
    role: 'reviewer',
    ...(config.buildCommand !== undefined ? { buildCommand: config.buildCommand } : {}),
    ...(config.testCommand !== undefined ? { testCommand: config.testCommand } : {}),
  };

  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],           givensSpec: { writ } },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: ['draft'],     givensSpec: { writ, role } },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: ['implement'], givensSpec: reviewGivens },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: ['review'],    givensSpec: { writ, role } },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: ['revise'],    givensSpec: {} },
  ];
}

// ── Apparatus factory ──────────────────────────────────────────────────

export function createSpider(): Plugin {
  let rigsBook: Book<RigDoc>;
  let sessionsBook: ReadOnlyBook<SessionDoc>;
  let writsBook: ReadOnlyBook<WritDoc>;
  let clerk: ClerkApi;
  let fabricator: FabricatorApi;
  let spiderConfig: SpiderConfig = {};

  // ── Internal crawl operations ─────────────────────────────────────

  /**
   * Mark an engine failed and propagate failure to the rig (same update).
   */
  async function failEngine(
    rig: RigDoc,
    engineId: string,
    errorMessage: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const updatedEngines = rig.engines.map((e) =>
      e.id === engineId
        ? { ...e, status: 'failed' as const, error: errorMessage, completedAt: now }
        : e,
    );
    await rigsBook.patch(rig.id, {
      engines: updatedEngines,
      status: 'failed',
    });
  }

  /**
   * Phase 1 — collect.
   *
   * Find the first running engine with a sessionId whose session has
   * reached a terminal state. Populate yields and advance the engine
   * (and possibly the rig) to completed or failed.
   */
  async function tryCollect(): Promise<CrawlResult | null> {
    const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
    for (const rig of runningRigs) {
      for (const engine of rig.engines) {
        if (engine.status !== 'running' || !engine.sessionId) continue;

        const session = await sessionsBook.get(engine.sessionId);
        if (!session || session.status === 'running') continue;

        // Terminal session found — collect.
        const now = new Date().toISOString();

        if (session.status === 'failed' || session.status === 'timeout') {
          await failEngine(rig, engine.id, session.error ?? `Session ${session.status}`);
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
        }

        // Completed session — assemble engine-specific yields from session record.
        let yields: Record<string, unknown>;
        if (engine.id === 'review') {
          // Review collect: parse findings and passed flag from session output;
          // retrieve mechanicalChecks stashed in session metadata by the review engine.
          const findings = session.output ?? '';
          const passed = /^###\s*Overall:\s*PASS/mi.test(findings);
          const mechanicalChecks = (session.metadata?.mechanicalChecks as unknown[]) ?? [];
          yields = { sessionId: session.id, passed, findings, mechanicalChecks };
        } else {
          yields = {
            sessionId: session.id,
            sessionStatus: session.status,
            ...(session.output !== undefined ? { output: session.output } : {}),
          };
        }

        if (!isJsonSerializable(yields)) {
          await failEngine(rig, engine.id, 'Session yields are not JSON-serializable');
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
        }

        const updatedEngines = rig.engines.map((e) =>
          e.id === engine.id
            ? { ...e, status: 'completed' as const, yields, completedAt: now }
            : e,
        );

        const allCompleted = updatedEngines.every((e) => e.status === 'completed');
        await rigsBook.patch(rig.id, {
          engines: updatedEngines,
          status: allCompleted ? 'completed' : 'running',
        });

        if (allCompleted) {
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'completed' };
        }
        return { action: 'engine-completed', rigId: rig.id, engineId: engine.id };
      }
    }
    return null;
  }

  /**
   * Phase 2 — run.
   *
   * Find the first pending engine in any running rig whose upstream is
   * all completed. Execute it:
   * - Clockwork ('completed') → store yields, mark engine completed,
   *   check for rig completion.
   * - Quick ('launched') → store sessionId, mark engine running.
   */
  async function tryRun(): Promise<CrawlResult | null> {
    const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
    for (const rig of runningRigs) {
      const pending = findRunnableEngine(rig);
      if (!pending) continue;

      const design = fabricator.getEngineDesign(pending.designId);
      if (!design) {
        await failEngine(rig, pending.id, `No engine design found for "${pending.designId}"`);
        return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
      }

      const now = new Date().toISOString();
      const upstream = buildUpstreamMap(rig);
      const givens = { ...pending.givensSpec };
      const context = { engineId: pending.id, upstream };

      let engineResult: Awaited<ReturnType<typeof design.run>>;
      try {
        // Mark engine as running before executing
        const startedEngines = rig.engines.map((e) =>
          e.id === pending.id ? { ...e, status: 'running' as const, startedAt: now } : e,
        );
        await rigsBook.patch(rig.id, { engines: startedEngines });

        // Re-fetch to get the up-to-date engines list (with startedAt set)
        const updatedRig = { ...rig, engines: startedEngines };

        engineResult = await design.run(givens, context);

        if (engineResult.status === 'launched') {
          // Quick engine — store sessionId, leave engine in 'running'
          const { sessionId } = engineResult;
          const launchedEngines = updatedRig.engines.map((e) =>
            e.id === pending.id
              ? { ...e, status: 'running' as const, sessionId }
              : e,
          );
          await rigsBook.patch(rig.id, { engines: launchedEngines });
          return { action: 'engine-started', rigId: rig.id, engineId: pending.id };
        }

        // Clockwork engine — validate and store yields
        const { yields } = engineResult;
        if (!isJsonSerializable(yields)) {
          await failEngine(updatedRig, pending.id, 'Engine yields are not JSON-serializable');
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
        }

        const completedAt = new Date().toISOString();
        const completedEngines = updatedRig.engines.map((e) =>
          e.id === pending.id
            ? { ...e, status: 'completed' as const, yields, completedAt }
            : e,
        );
        const allCompleted = completedEngines.every((e) => e.status === 'completed');
        await rigsBook.patch(rig.id, {
          engines: completedEngines,
          status: allCompleted ? 'completed' : 'running',
        });

        if (allCompleted) {
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'completed' };
        }
        return { action: 'engine-completed', rigId: rig.id, engineId: pending.id };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await failEngine(rig, pending.id, errorMessage);
        return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
      }
    }
    return null;
  }

  /**
   * Phase 3 — spawn.
   *
   * Find the oldest ready writ with no existing rig. Create a rig and
   * transition the writ to active so the Clerk tracks it as in-progress.
   */
  async function trySpawn(): Promise<CrawlResult | null> {
    // Find ready writs ordered by creation time (oldest first)
    const readyWrits = await writsBook.find({
      where: [['status', '=', 'ready']],
      orderBy: ['createdAt', 'asc'],
      limit: 10,
    });

    for (const writ of readyWrits) {
      // Check for existing rig
      const existing = await rigsBook.find({
        where: [['writId', '=', writ.id]],
        limit: 1,
      });
      if (existing.length > 0) continue;

      const rigId = generateId('rig', 4);
      const engines = buildStaticEngines(writ, spiderConfig);

      const rig: RigDoc = {
        id: rigId,
        writId: writ.id,
        status: 'running',
        engines,
      };

      await rigsBook.put(rig);

      // Transition writ to active so Clerk tracks it
      try {
        await clerk.transition(writ.id, 'active');
      } catch (err) {
        // Only swallow state-transition conflicts (writ already moved past 'ready')
        if (err instanceof Error && err.message.includes('transition')) {
          // Race condition — another spider got here first. The rig is already created,
          // so we continue. The writ is already active or beyond.
        } else {
          throw err;
        }
      }

      return { action: 'rig-spawned', rigId, writId: writ.id };
    }

    return null;
  }

  // ── SpiderApi ─────────────────────────────────────────────────────

  const api: SpiderApi = {
    async crawl(): Promise<CrawlResult | null> {
      const collected = await tryCollect();
      if (collected) return collected;

      const ran = await tryRun();
      if (ran) return ran;

      const spawned = await trySpawn();
      if (spawned) return spawned;

      return null;
    },
  };

  // ── Apparatus ─────────────────────────────────────────────────────

  return {
    apparatus: {
      requires: ['stacks', 'clerk', 'fabricator'],

      supportKit: {
        books: {
          rigs: {
            indexes: ['status', 'writId', ['status', 'writId']],
          },
        },
        engines: {
          draft:     draftEngine,
          implement: implementEngine,
          review:    reviewEngine,
          revise:    reviseEngine,
          seal:      sealEngine,
        },
        tools: [crawlTool, crawlContinualTool],
      },

      provides: api,

      start(_ctx: StartupContext): void {
        const g = guild();
        spiderConfig = g.guildConfig().spider ?? {};

        const stacks = g.apparatus<StacksApi>('stacks');
        clerk = g.apparatus<ClerkApi>('clerk');
        fabricator = g.apparatus<FabricatorApi>('fabricator');

        rigsBook = stacks.book<RigDoc>('spider', 'rigs');
        sessionsBook = stacks.readBook<SessionDoc>('animator', 'sessions');
        writsBook = stacks.readBook<WritDoc>('clerk', 'writs');

        // CDC — Phase 1 cascade on rigs book.
        // When a rig reaches a terminal state, transition the associated writ.
        stacks.watch<RigDoc>(
          'spider',
          'rigs',
          async (event) => {
            if (event.type !== 'update') return;

            const rig = event.entry;
            const prev = event.prev;

            // Only act when status changes to a terminal state
            if (rig.status === prev.status) return;

            if (rig.status === 'completed') {
              // Use seal yields as the resolution summary
              const sealEngine = rig.engines.find((e) => e.id === 'seal');
              const resolution = sealEngine?.yields
                ? JSON.stringify(sealEngine.yields)
                : 'Rig completed';
              await clerk.transition(rig.writId, 'completed', { resolution });
            } else if (rig.status === 'failed') {
              const failedEngine = rig.engines.find((e) => e.status === 'failed');
              const resolution = failedEngine?.error ?? 'Engine failure';
              await clerk.transition(rig.writId, 'failed', { resolution });
            }
          },
          { failOnError: true },
        );
      },
    },
  };
}

=== FILE: packages/plugins/spider/src/tools/crawl-continual.ts ===
/**
 * crawlContinual tool — runs the crawl loop continuously.
 *
 * Polls crawl() on a configurable interval until stopped or no remaining
 * work exists for the configured number of consecutive idle cycles.
 */

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi, SpiderConfig } from '../types.ts';

export default tool({
  name: 'crawlContinual',
  description: "Run the Spider's crawl loop continuously until idle",
  instructions:
    'Polls crawl() in a loop, sleeping between steps when idle. ' +
    'Stops when the configured number of consecutive idle cycles is reached. ' +
    'Returns a summary of all actions taken.',
  params: {
    maxIdleCycles: z
      .number()
      .optional()
      .default(3)
      .describe(
        'Number of consecutive idle crawl() calls before stopping (default: 3)',
      ),
    pollIntervalMs: z
      .number()
      .optional()
      .describe(
        'Override the configured poll interval in milliseconds',
      ),
  },
  permission: 'spider:write',
  handler: async (params) => {
    const g = guild();
    const spider = g.apparatus<SpiderApi>('spider');
    const config = g.guildConfig().spider ?? {} as SpiderConfig;
    const intervalMs = params.pollIntervalMs ?? config.pollIntervalMs ?? 5000;
    const maxIdle = params.maxIdleCycles;

    const actions: unknown[] = [];
    let idleCount = 0;

    while (idleCount < maxIdle) {
      let result: Awaited<ReturnType<typeof spider.crawl>>;
      try {
        result = await spider.crawl();
      } catch (err) {
        console.error('[crawlContinual] crawl() error:', err instanceof Error ? err.message : String(err));
        idleCount++;
        if (idleCount < maxIdle) {
          await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
        }
        continue;
      }
      if (result === null) {
        idleCount++;
        if (idleCount < maxIdle) {
          await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
        }
      } else {
        idleCount = 0;
        actions.push(result);
      }
    }

    return { actions, totalActions: actions.length };
  },
});

=== FILE: packages/plugins/spider/src/tools/crawl.ts ===
/**
 * crawl tool — executes a single step of the crawl loop.
 *
 * Returns the CrawlResult or null (idle) from one crawl() call.
 * Useful for manual step-through or testing.
 */

import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi } from '../types.ts';

export default tool({
  name: 'crawl',
  description: "Execute one step of the Spider's crawl loop",
  instructions:
    'Runs a single crawl() step: collect a pending session result, run the next ' +
    'ready engine, or spawn a rig for a ready writ — in that priority order. ' +
    'Returns the action taken, or null if there is nothing to do.',
  params: {},
  permission: 'spider:write',
  handler: async () => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.crawl();
  },
});

=== FILE: packages/plugins/spider/src/tools/index.ts ===
export { default as crawlTool } from './crawl.ts';
export { default as crawlContinualTool } from './crawl-continual.ts';

=== FILE: packages/plugins/spider/src/types.ts ===
/**
 * The Spider — public types.
 *
 * Rig and engine data model, CrawlResult, SpiderApi, and configuration.
 * Engine yield shapes (DraftYields, SealYields) live here too so downstream
 * packages can import them without depending on the engine implementation files.
 */

// ── Engine instance status ────────────────────────────────────────────

export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed';

// ── Engine instance ───────────────────────────────────────────────────

/**
 * A single engine slot within a rig.
 *
 * `id` is the engine's position identifier (e.g. 'draft', 'implement').
 * For the static pipeline it matches `designId`.
 *
 * `givensSpec` holds literal values set at spawn time (writ, role, commands).
 * The Spider assembles `givens` from this directly; upstream yields arrive
 * via `context.upstream` as the escape hatch.
 */
export interface EngineInstance {
  /** Unique identifier within the rig (e.g. 'draft', 'implement'). */
  id: string;
  /** The engine design to look up in the Fabricator. */
  designId: string;
  /** Current execution status. */
  status: EngineStatus;
  /** Engine IDs that must be completed before this engine can run. */
  upstream: string[];
  /** Literal givens values set at rig spawn time. */
  givensSpec: Record<string, unknown>;
  /** Yields from a completed engine run (JSON-serializable). */
  yields?: unknown;
  /** Error message if this engine failed. */
  error?: string;
  /** Session ID from a launched quick engine, used by the collect step. */
  sessionId?: string;
  /** ISO timestamp when execution started. */
  startedAt?: string;
  /** ISO timestamp when execution completed (or failed). */
  completedAt?: string;
}

// ── Rig ──────────────────────────────────────────────────────────────

export type RigStatus = 'running' | 'completed' | 'failed';

/**
 * A rig — the execution context for a single writ.
 *
 * Stored in The Stacks (`spider/rigs` book). The `engines` array is the
 * ordered pipeline of engine instances. The Spider updates this document
 * in-place as engines run and complete.
 */
export interface RigDoc {
  /** Index signature required to satisfy BookEntry constraint. */
  [key: string]: unknown;
  /** Unique rig id. */
  id: string;
  /** The writ this rig is executing. */
  writId: string;
  /** Current rig status. */
  status: RigStatus;
  /** Ordered engine pipeline. */
  engines: EngineInstance[];
}

// ── CrawlResult ────────────────────────────────────────────────────────

/**
 * The result of a single crawl() call.
 *
 * Four variants, ordered by priority:
 * - 'engine-completed' — an engine finished (collected or ran inline); rig still running
 * - 'engine-started'   — launched a quick engine's session
 * - 'rig-spawned'      — created a new rig for a ready writ
 * - 'rig-completed'    — the crawl step caused a rig to reach a terminal state
 *
 * null means no work was available.
 */
export type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' };

// ── SpiderApi ─────────────────────────────────────────────────────────

/**
 * The Spider's public API — retrieved via guild().apparatus<SpiderApi>('spider').
 */
export interface SpiderApi {
  /**
   * Execute one step of the crawl loop.
   *
   * Priority ordering: collect > run > spawn.
   * Returns null when no work is available.
   */
  crawl(): Promise<CrawlResult | null>;
}

// ── Configuration ─────────────────────────────────────────────────────

/**
 * Spider apparatus configuration — lives under the `spider` key in guild.json.
 */
export interface SpiderConfig {
  /**
   * Role to summon for quick engine sessions.
   * Default: 'artificer'.
   */
  role?: string;
  /**
   * Polling interval for crawlContinual tool (milliseconds).
   * Default: 5000.
   */
  pollIntervalMs?: number;
  /**
   * Build command to pass to quick engines.
   */
  buildCommand?: string;
  /**
   * Test command to pass to quick engines.
   */
  testCommand?: string;
}

// ── Engine yield shapes ───────────────────────────────────────────────

/**
 * Yields from the `draft` clockwork engine.
 * The Spider stores these in the engine instance and passes them
 * to downstream engines via context.upstream['draft'].
 */
export interface DraftYields {
  /** The draft's unique id. */
  draftId: string;
  /** Codex this draft belongs to. */
  codexName: string;
  /** Git branch name for the draft. */
  branch: string;
  /** Absolute filesystem path to the draft's worktree. */
  path: string;
  /** HEAD commit SHA at the time the draft was opened. Used by review engine to compute diffs. */
  baseSha: string;
}

/**
 * Yields from the `seal` clockwork engine.
 */
export interface SealYields {
  /** The commit SHA at head of the target branch after sealing. */
  sealedCommit: string;
  /** Git strategy used. */
  strategy: 'fast-forward' | 'rebase';
  /** Number of retry attempts. */
  retries: number;
  /** Number of inscriptions (commits) sealed. */
  inscriptionsSealed: number;
}

/**
 * Yields from the `implement` quick engine.
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ImplementYields {
  /** The Animator session id. */
  sessionId: string;
  /** Terminal status of the session. */
  sessionStatus: 'completed' | 'failed';
}

/**
 * A single mechanical check (build or test) run by the review engine
 * before launching the reviewer session.
 */
export interface MechanicalCheck {
  /** Check name. */
  name: 'build' | 'test';
  /** Whether the command exited with code 0. */
  passed: boolean;
  /** Combined stdout+stderr, truncated to 4KB. */
  output: string;
  /** Wall-clock duration of the check in milliseconds. */
  durationMs: number;
}

/**
 * Yields from the `review` quick engine.
 * Assembled by the Spider's collect step from session.output and session.metadata.
 */
export interface ReviewYields {
  /** The Animator session id. */
  sessionId: string;
  /** Reviewer's overall assessment — true if the review passed. */
  passed: boolean;
  /** Structured markdown findings from the reviewer's final message. */
  findings: string;
  /** Mechanical check results run before the reviewer session. */
  mechanicalChecks: MechanicalCheck[];
}

/**
 * Yields from the `revise` quick engine.
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ReviseYields {
  /** The Animator session id. */
  sessionId: string;
  /** Terminal status of the session. */
  sessionStatus: 'completed' | 'failed';
}

// Augment GuildConfig so `guild().guildConfig().spider` is typed.
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    spider?: SpiderConfig;
  }
}

=== FILE: packages/plugins/spider/tsconfig.json ===
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": [
    "src"
  ],
  "exclude": [
    "src/**/*.test.ts"
  ]
}

=== FILE: pnpm-lock.yaml ===
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .:
    devDependencies:
      '@tsconfig/node24':
        specifier: 24.0.4
        version: 24.0.4
      typescript:
        specifier: 5.9.3
        version: 5.9.3

  packages/framework/arbor:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../core
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/framework/cli:
    dependencies:
      '@shardworks/nexus-arbor':
        specifier: workspace:*
        version: link:../arbor
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../../plugins/tools
      commander:
        specifier: 14.0.3
        version: 14.0.3
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/framework/core:
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/animator:
    dependencies:
      '@shardworks/loom-apparatus':
        specifier: workspace:*
        version: link:../loom
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/claude-code:
    dependencies:
      '@modelcontextprotocol/sdk':
        specifier: 1.27.1
        version: 1.27.1(zod@4.3.6)
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/clerk:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/codexes:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/dashboard:
    dependencies:
      '@shardworks/clerk-apparatus':
        specifier: workspace:*
        version: link:../clerk
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/dispatch:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/clerk-apparatus':
        specifier: workspace:*
        version: link:../clerk
      '@shardworks/codexes-apparatus':
        specifier: workspace:*
        version: link:../codexes
      '@shardworks/loom-apparatus':
        specifier: workspace:*
        version: link:../loom
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/fabricator:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/loom:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/parlour:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/loom-apparatus':
        specifier: workspace:*
        version: link:../loom
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/spider:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/clerk-apparatus':
        specifier: workspace:*
        version: link:../clerk
      '@shardworks/codexes-apparatus':
        specifier: workspace:*
        version: link:../codexes
      '@shardworks/fabricator-apparatus':
        specifier: workspace:*
        version: link:../fabricator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/stacks:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      better-sqlite3:
        specifier: 12.8.0
        version: 12.8.0
    devDependencies:
      '@types/better-sqlite3':
        specifier: 7.6.13
        version: 7.6.13
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/tools:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

packages:

  '@hono/node-server@1.19.11':
    resolution: {integrity: sha512-dr8/3zEaB+p0D2n/IUrlPF1HZm586qgJNXK1a9fhg/PzdtkK7Ksd5l312tJX2yBuALqDYBlG20QEbayqPyxn+g==}
    engines: {node: '>=18.14.1'}
    peerDependencies:
      hono: ^4

  '@modelcontextprotocol/sdk@1.27.1':
    resolution: {integrity: sha512-sr6GbP+4edBwFndLbM60gf07z0FQ79gaExpnsjMGePXqFcSSb7t6iscpjk9DhFhwd+mTEQrzNafGP8/iGGFYaA==}
    engines: {node: '>=18'}
    peerDependencies:
      '@cfworker/json-schema': ^4.1.1
      zod: ^3.25 || ^4.0
    peerDependenciesMeta:
      '@cfworker/json-schema':
        optional: true

  '@tsconfig/node24@24.0.4':
    resolution: {integrity: sha512-2A933l5P5oCbv6qSxHs7ckKwobs8BDAe9SJ/Xr2Hy+nDlwmLE1GhFh/g/vXGRZWgxBg9nX/5piDtHR9Dkw/XuA==}

  '@types/better-sqlite3@7.6.13':
    resolution: {integrity: sha512-NMv9ASNARoKksWtsq/SHakpYAYnhBrQgGD8zkLYk/jaK8jUGn08CfEdTRgYhMypUQAfzSP8W6gNLe0q19/t4VA==}

  '@types/node@25.5.0':
    resolution: {integrity: sha512-jp2P3tQMSxWugkCUKLRPVUpGaL5MVFwF8RDuSRztfwgN1wmqJeMSbKlnEtQqU8UrhTmzEmZdu2I6v2dpp7XIxw==}

  accepts@2.0.0:
    resolution: {integrity: sha512-5cvg6CtKwfgdmVqY1WIiXKc3Q1bkRqGLi+2W/6ao+6Y7gu/RCwRuAhGEzh5B4KlszSuTLgZYuqFqo5bImjNKng==}
    engines: {node: '>= 0.6'}

  ajv-formats@3.0.1:
    resolution: {integrity: sha512-8iUql50EUR+uUcdRQ3HDqa6EVyo3docL8g5WJ3FNcWmu62IbkGUue/pEyLBW8VGKKucTPgqeks4fIU1DA4yowQ==}
    peerDependencies:
      ajv: ^8.0.0
    peerDependenciesMeta:
      ajv:
        optional: true

  ajv@8.18.0:
    resolution: {integrity: sha512-PlXPeEWMXMZ7sPYOHqmDyCJzcfNrUr3fGNKtezX14ykXOEIvyK81d+qydx89KY5O71FKMPaQ2vBfBFI5NHR63A==}

  base64-js@1.5.1:
    resolution: {integrity: sha512-AKpaYlHn8t4SVbOHCy+b5+KKgvR4vrsD8vbvrbiQJps7fKDTkjkDry6ji0rUJjC0kzbNePLwzxq8iypo41qeWA==}

  better-sqlite3@12.8.0:
    resolution: {integrity: sha512-RxD2Vd96sQDjQr20kdP+F+dK/1OUNiVOl200vKBZY8u0vTwysfolF6Hq+3ZK2+h8My9YvZhHsF+RSGZW2VYrPQ==}
    engines: {node: 20.x || 22.x || 23.x || 24.x || 25.x}

  bindings@1.5.0:
    resolution: {integrity: sha512-p2q/t/mhvuOj/UeLlV6566GD/guowlr0hHxClI0W9m7MWYkL1F0hLo+0Aexs9HSPCtR1SXQ0TD3MMKrXZajbiQ==}

  bl@4.1.0:
    resolution: {integrity: sha512-1W07cM9gS6DcLperZfFSj+bWLtaPGSOHWhPiGzXmvVJbRLdG82sH/Kn8EtW1VqWVA54AKf2h5k5BbnIbwF3h6w==}

  body-parser@2.2.2:
    resolution: {integrity: sha512-oP5VkATKlNwcgvxi0vM0p/D3n2C3EReYVX+DNYs5TjZFn/oQt2j+4sVJtSMr18pdRr8wjTcBl6LoV+FUwzPmNA==}
    engines: {node: '>=18'}

  buffer@5.7.1:
    resolution: {integrity: sha512-EHcyIPBQ4BSGlvjB16k5KgAJ27CIsHY/2JBmCRReo48y9rQ3MaUzWX3KVlBa4U7MyX02HdVj0K7C3WaB3ju7FQ==}

  bytes@3.1.2:
    resolution: {integrity: sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==}
    engines: {node: '>= 0.8'}

  call-bind-apply-helpers@1.0.2:
    resolution: {integrity: sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==}
    engines: {node: '>= 0.4'}

  call-bound@1.0.4:
    resolution: {integrity: sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==}
    engines: {node: '>= 0.4'}

  chownr@1.1.4:
    resolution: {integrity: sha512-jJ0bqzaylmJtVnNgzTeSOs8DPavpbYgEr/b0YL8/2GO3xJEhInFmhKMUnEJQjZumK7KXGFhUy89PrsJWlakBVg==}

  commander@14.0.3:
    resolution: {integrity: sha512-H+y0Jo/T1RZ9qPP4Eh1pkcQcLRglraJaSLoyOtHxu6AapkjWVCy2Sit1QQ4x3Dng8qDlSsZEet7g5Pq06MvTgw==}
    engines: {node: '>=20'}

  content-disposition@1.0.1:
    resolution: {integrity: sha512-oIXISMynqSqm241k6kcQ5UwttDILMK4BiurCfGEREw6+X9jkkpEe5T9FZaApyLGGOnFuyMWZpdolTXMtvEJ08Q==}
    engines: {node: '>=18'}

  content-type@1.0.5:
    resolution: {integrity: sha512-nTjqfcBFEipKdXCv4YDQWCfmcLZKm81ldF0pAopTvyrFGVbcR6P/VAAd5G7N+0tTr8QqiU0tFadD6FK4NtJwOA==}
    engines: {node: '>= 0.6'}

  cookie-signature@1.2.2:
    resolution: {integrity: sha512-D76uU73ulSXrD1UXF4KE2TMxVVwhsnCgfAyTg9k8P6KGZjlXKrOLe4dJQKI3Bxi5wjesZoFXJWElNWBjPZMbhg==}
    engines: {node: '>=6.6.0'}

  cookie@0.7.2:
    resolution: {integrity: sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==}
    engines: {node: '>= 0.6'}

  cors@2.8.6:
    resolution: {integrity: sha512-tJtZBBHA6vjIAaF6EnIaq6laBBP9aq/Y3ouVJjEfoHbRBcHBAHYcMh/w8LDrk2PvIMMq8gmopa5D4V8RmbrxGw==}
    engines: {node: '>= 0.10'}

  cross-spawn@7.0.6:
    resolution: {integrity: sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==}
    engines: {node: '>= 8'}

  debug@4.4.3:
    resolution: {integrity: sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==}
    engines: {node: '>=6.0'}
    peerDependencies:
      supports-color: '*'
    peerDependenciesMeta:
      supports-color:
        optional: true

  decompress-response@6.0.0:
    resolution: {integrity: sha512-aW35yZM6Bb/4oJlZncMH2LCoZtJXTRxES17vE3hoRiowU2kWHaJKFkSBDnDR+cm9J+9QhXmREyIfv0pji9ejCQ==}
    engines: {node: '>=10'}

  deep-extend@0.6.0:
    resolution: {integrity: sha512-LOHxIOaPYdHlJRtCQfDIVZtfw/ufM8+rVj649RIHzcm/vGwQRXFt6OPqIFWsm2XEMrNIEtWR64sY1LEKD2vAOA==}
    engines: {node: '>=4.0.0'}

  depd@2.0.0:
    resolution: {integrity: sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==}
    engines: {node: '>= 0.8'}

  detect-libc@2.1.2:
    resolution: {integrity: sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==}
    engines: {node: '>=8'}

  dunder-proto@1.0.1:
    resolution: {integrity: sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==}
    engines: {node: '>= 0.4'}

  ee-first@1.1.1:
    resolution: {integrity: sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==}

  encodeurl@2.0.0:
    resolution: {integrity: sha512-Q0n9HRi4m6JuGIV1eFlmvJB7ZEVxu93IrMyiMsGC0lrMJMWzRgx6WGquyfQgZVb31vhGgXnfmPNNXmxnOkRBrg==}
    engines: {node: '>= 0.8'}

  end-of-stream@1.4.5:
    resolution: {integrity: sha512-ooEGc6HP26xXq/N+GCGOT0JKCLDGrq2bQUZrQ7gyrJiZANJ/8YDTxTpQBXGMn+WbIQXNVpyWymm7KYVICQnyOg==}

  es-define-property@1.0.1:
    resolution: {integrity: sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==}
    engines: {node: '>= 0.4'}

  es-errors@1.3.0:
    resolution: {integrity: sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==}
    engines: {node: '>= 0.4'}

  es-object-atoms@1.1.1:
    resolution: {integrity: sha512-FGgH2h8zKNim9ljj7dankFPcICIK9Cp5bm+c2gQSYePhpaG5+esrLODihIorn+Pe6FGJzWhXQotPv73jTaldXA==}
    engines: {node: '>= 0.4'}

  escape-html@1.0.3:
    resolution: {integrity: sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==}

  etag@1.8.1:
    resolution: {integrity: sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==}
    engines: {node: '>= 0.6'}

  eventsource-parser@3.0.6:
    resolution: {integrity: sha512-Vo1ab+QXPzZ4tCa8SwIHJFaSzy4R6SHf7BY79rFBDf0idraZWAkYrDjDj8uWaSm3S2TK+hJ7/t1CEmZ7jXw+pg==}
    engines: {node: '>=18.0.0'}

  eventsource@3.0.7:
    resolution: {integrity: sha512-CRT1WTyuQoD771GW56XEZFQ/ZoSfWid1alKGDYMmkt2yl8UXrVR4pspqWNEcqKvVIzg6PAltWjxcSSPrboA4iA==}
    engines: {node: '>=18.0.0'}

  expand-template@2.0.3:
    resolution: {integrity: sha512-XYfuKMvj4O35f/pOXLObndIRvyQ+/+6AhODh+OKWj9S9498pHHn/IMszH+gt0fBCRWMNfk1ZSp5x3AifmnI2vg==}
    engines: {node: '>=6'}

  express-rate-limit@8.3.1:
    resolution: {integrity: sha512-D1dKN+cmyPWuvB+G2SREQDzPY1agpBIcTa9sJxOPMCNeH3gwzhqJRDWCXW3gg0y//+LQ/8j52JbMROWyrKdMdw==}
    engines: {node: '>= 16'}
    peerDependencies:
      express: '>= 4.11'

  express@5.2.1:
    resolution: {integrity: sha512-hIS4idWWai69NezIdRt2xFVofaF4j+6INOpJlVOLDO8zXGpUVEVzIYk12UUi2JzjEzWL3IOAxcTubgz9Po0yXw==}
    engines: {node: '>= 18'}

  fast-deep-equal@3.1.3:
    resolution: {integrity: sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==}

  fast-uri@3.1.0:
    resolution: {integrity: sha512-iPeeDKJSWf4IEOasVVrknXpaBV0IApz/gp7S2bb7Z4Lljbl2MGJRqInZiUrQwV16cpzw/D3S5j5Julj/gT52AA==}

  file-uri-to-path@1.0.0:
    resolution: {integrity: sha512-0Zt+s3L7Vf1biwWZ29aARiVYLx7iMGnEUl9x33fbB/j3jR81u/O2LbqK+Bm1CDSNDKVtJ/YjwY7TUd5SkeLQLw==}

  finalhandler@2.1.1:
    resolution: {integrity: sha512-S8KoZgRZN+a5rNwqTxlZZePjT/4cnm0ROV70LedRHZ0p8u9fRID0hJUZQpkKLzro8LfmC8sx23bY6tVNxv8pQA==}
    engines: {node: '>= 18.0.0'}

  forwarded@0.2.0:
    resolution: {integrity: sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==}
    engines: {node: '>= 0.6'}

  fresh@2.0.0:
    resolution: {integrity: sha512-Rx/WycZ60HOaqLKAi6cHRKKI7zxWbJ31MhntmtwMoaTeF7XFH9hhBp8vITaMidfljRQ6eYWCKkaTK+ykVJHP2A==}
    engines: {node: '>= 0.8'}

  fs-constants@1.0.0:
    resolution: {integrity: sha512-y6OAwoSIf7FyjMIv94u+b5rdheZEjzR63GTyZJm5qh4Bi+2YgwLCcI/fPFZkL5PSixOt6ZNKm+w+Hfp/Bciwow==}

  function-bind@1.1.2:
    resolution: {integrity: sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==}

  get-intrinsic@1.3.0:
    resolution: {integrity: sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==}
    engines: {node: '>= 0.4'}

  get-proto@1.0.1:
    resolution: {integrity: sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==}
    engines: {node: '>= 0.4'}

  github-from-package@0.0.0:
    resolution: {integrity: sha512-SyHy3T1v2NUXn29OsWdxmK6RwHD+vkj3v8en8AOBZ1wBQ/hCAQ5bAQTD02kW4W9tUp/3Qh6J8r9EvntiyCmOOw==}

  gopd@1.2.0:
    resolution: {integrity: sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==}
    engines: {node: '>= 0.4'}

  has-symbols@1.1.0:
    resolution: {integrity: sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==}
    engines: {node: '>= 0.4'}

  hasown@2.0.2:
    resolution: {integrity: sha512-0hJU9SCPvmMzIBdZFqNPXWa6dqh7WdH0cII9y+CyS8rG3nL48Bclra9HmKhVVUHyPWNH5Y7xDwAB7bfgSjkUMQ==}
    engines: {node: '>= 0.4'}

  hono@4.12.9:
    resolution: {integrity: sha512-wy3T8Zm2bsEvxKZM5w21VdHDDcwVS1yUFFY6i8UobSsKfFceT7TOwhbhfKsDyx7tYQlmRM5FLpIuYvNFyjctiA==}
    engines: {node: '>=16.9.0'}

  http-errors@2.0.1:
    resolution: {integrity: sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==}
    engines: {node: '>= 0.8'}

  iconv-lite@0.7.2:
    resolution: {integrity: sha512-im9DjEDQ55s9fL4EYzOAv0yMqmMBSZp6G0VvFyTMPKWxiSBHUj9NW/qqLmXUwXrrM7AvqSlTCfvqRb0cM8yYqw==}
    engines: {node: '>=0.10.0'}

  ieee754@1.2.1:
    resolution: {integrity: sha512-dcyqhDvX1C46lXZcVqCpK+FtMRQVdIMN6/Df5js2zouUsqG7I6sFxitIC+7KYK29KdXOLHdu9zL4sFnoVQnqaA==}

  inherits@2.0.4:
    resolution: {integrity: sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==}

  ini@1.3.8:
    resolution: {integrity: sha512-JV/yugV2uzW5iMRSiZAyDtQd+nxtUnjeLt0acNdw98kKLrvuRVyB80tsREOE7yvGVgalhZ6RNXCmEHkUKBKxew==}

  ip-address@10.1.0:
    resolution: {integrity: sha512-XXADHxXmvT9+CRxhXg56LJovE+bmWnEWB78LB83VZTprKTmaC5QfruXocxzTZ2Kl0DNwKuBdlIhjL8LeY8Sf8Q==}
    engines: {node: '>= 12'}

  ipaddr.js@1.9.1:
    resolution: {integrity: sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==}
    engines: {node: '>= 0.10'}

  is-promise@4.0.0:
    resolution: {integrity: sha512-hvpoI6korhJMnej285dSg6nu1+e6uxs7zG3BYAm5byqDsgJNWwxzM6z6iZiAgQR4TJ30JmBTOwqZUw3WlyH3AQ==}

  isexe@2.0.0:
    resolution: {integrity: sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==}

  jose@6.2.2:
    resolution: {integrity: sha512-d7kPDd34KO/YnzaDOlikGpOurfF0ByC2sEV4cANCtdqLlTfBlw2p14O/5d/zv40gJPbIQxfES3nSx1/oYNyuZQ==}

  json-schema-traverse@1.0.0:
    resolution: {integrity: sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug==}

  json-schema-typed@8.0.2:
    resolution: {integrity: sha512-fQhoXdcvc3V28x7C7BMs4P5+kNlgUURe2jmUT1T//oBRMDrqy1QPelJimwZGo7Hg9VPV3EQV5Bnq4hbFy2vetA==}

  math-intrinsics@1.1.0:
    resolution: {integrity: sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==}
    engines: {node: '>= 0.4'}

  media-typer@1.1.0:
    resolution: {integrity: sha512-aisnrDP4GNe06UcKFnV5bfMNPBUw4jsLGaWwWfnH3v02GnBuXX2MCVn5RbrWo0j3pczUilYblq7fQ7Nw2t5XKw==}
    engines: {node: '>= 0.8'}

  merge-descriptors@2.0.0:
    resolution: {integrity: sha512-Snk314V5ayFLhp3fkUREub6WtjBfPdCPY1Ln8/8munuLuiYhsABgBVWsozAG+MWMbVEvcdcpbi9R7ww22l9Q3g==}
    engines: {node: '>=18'}

  mime-db@1.54.0:
    resolution: {integrity: sha512-aU5EJuIN2WDemCcAp2vFBfp/m4EAhWJnUNSSw0ixs7/kXbd6Pg64EmwJkNdFhB8aWt1sH2CTXrLxo/iAGV3oPQ==}
    engines: {node: '>= 0.6'}

  mime-types@3.0.2:
    resolution: {integrity: sha512-Lbgzdk0h4juoQ9fCKXW4by0UJqj+nOOrI9MJ1sSj4nI8aI2eo1qmvQEie4VD1glsS250n15LsWsYtCugiStS5A==}
    engines: {node: '>=18'}

  mimic-response@3.1.0:
    resolution: {integrity: sha512-z0yWI+4FDrrweS8Zmt4Ej5HdJmky15+L2e6Wgn3+iK5fWzb6T3fhNFq2+MeTRb064c6Wr4N/wv0DzQTjNzHNGQ==}
    engines: {node: '>=10'}

  minimist@1.2.8:
    resolution: {integrity: sha512-2yyAR8qBkN3YuheJanUpWC5U3bb5osDywNB8RzDVlDwDHbocAJveqqj1u8+SVD7jkWT4yvsHCpWqqWqAxb0zCA==}

  mkdirp-classic@0.5.3:
    resolution: {integrity: sha512-gKLcREMhtuZRwRAfqP3RFW+TK4JqApVBtOIftVgjuABpAtpxhPGaDcfvbhNvD0B8iD1oUr/txX35NjcaY6Ns/A==}

  ms@2.1.3:
    resolution: {integrity: sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==}

  napi-build-utils@2.0.0:
    resolution: {integrity: sha512-GEbrYkbfF7MoNaoh2iGG84Mnf/WZfB0GdGEsM8wz7Expx/LlWf5U8t9nvJKXSp3qr5IsEbK04cBGhol/KwOsWA==}

  negotiator@1.0.0:
    resolution: {integrity: sha512-8Ofs/AUQh8MaEcrlq5xOX0CQ9ypTF5dl78mjlMNfOK08fzpgTHQRQPBxcPlEtIw0yRpws+Zo/3r+5WRby7u3Gg==}
    engines: {node: '>= 0.6'}

  node-abi@3.89.0:
    resolution: {integrity: sha512-6u9UwL0HlAl21+agMN3YAMXcKByMqwGx+pq+P76vii5f7hTPtKDp08/H9py6DY+cfDw7kQNTGEj/rly3IgbNQA==}
    engines: {node: '>=10'}

  object-assign@4.1.1:
    resolution: {integrity: sha512-rJgTQnkUnH1sFw8yT6VSU3zD3sWmu6sZhIseY8VX+GRu3P6F7Fu+JNDoXfklElbLJSnc3FUQHVe4cU5hj+BcUg==}
    engines: {node: '>=0.10.0'}

  object-inspect@1.13.4:
    resolution: {integrity: sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==}
    engines: {node: '>= 0.4'}

  on-finished@2.4.1:
    resolution: {integrity: sha512-oVlzkg3ENAhCk2zdv7IJwd/QUD4z2RxRwpkcGY8psCVcCYZNq4wYnVWALHM+brtuJjePWiYF/ClmuDr8Ch5+kg==}
    engines: {node: '>= 0.8'}

  once@1.4.0:
    resolution: {integrity: sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==}

  parseurl@1.3.3:
    resolution: {integrity: sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==}
    engines: {node: '>= 0.8'}

  path-key@3.1.1:
    resolution: {integrity: sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==}
    engines: {node: '>=8'}

  path-to-regexp@8.3.0:
    resolution: {integrity: sha512-7jdwVIRtsP8MYpdXSwOS0YdD0Du+qOoF/AEPIt88PcCFrZCzx41oxku1jD88hZBwbNUIEfpqvuhjFaMAqMTWnA==}

  pkce-challenge@5.0.1:
    resolution: {integrity: sha512-wQ0b/W4Fr01qtpHlqSqspcj3EhBvimsdh0KlHhH8HRZnMsEa0ea2fTULOXOS9ccQr3om+GcGRk4e+isrZWV8qQ==}
    engines: {node: '>=16.20.0'}

  prebuild-install@7.1.3:
    resolution: {integrity: sha512-8Mf2cbV7x1cXPUILADGI3wuhfqWvtiLA1iclTDbFRZkgRQS0NqsPZphna9V+HyTEadheuPmjaJMsbzKQFOzLug==}
    engines: {node: '>=10'}
    deprecated: No longer maintained. Please contact the author of the relevant native addon; alternatives are available.
    hasBin: true

  proxy-addr@2.0.7:
    resolution: {integrity: sha512-llQsMLSUDUPT44jdrU/O37qlnifitDP+ZwrmmZcoSKyLKvtZxpyV0n2/bD/N4tBAAZ/gJEdZU7KMraoK1+XYAg==}
    engines: {node: '>= 0.10'}

  pump@3.0.4:
    resolution: {integrity: sha512-VS7sjc6KR7e1ukRFhQSY5LM2uBWAUPiOPa/A3mkKmiMwSmRFUITt0xuj+/lesgnCv+dPIEYlkzrcyXgquIHMcA==}

  qs@6.15.0:
    resolution: {integrity: sha512-mAZTtNCeetKMH+pSjrb76NAM8V9a05I9aBZOHztWy/UqcJdQYNsf59vrRKWnojAT9Y+GbIvoTBC++CPHqpDBhQ==}
    engines: {node: '>=0.6'}

  range-parser@1.2.1:
    resolution: {integrity: sha512-Hrgsx+orqoygnmhFbKaHE6c296J+HTAQXoxEF6gNupROmmGJRoyzfG3ccAveqCBrwr/2yxQ5BVd/GTl5agOwSg==}
    engines: {node: '>= 0.6'}

  raw-body@3.0.2:
    resolution: {integrity: sha512-K5zQjDllxWkf7Z5xJdV0/B0WTNqx6vxG70zJE4N0kBs4LovmEYWJzQGxC9bS9RAKu3bgM40lrd5zoLJ12MQ5BA==}
    engines: {node: '>= 0.10'}

  rc@1.2.8:
    resolution: {integrity: sha512-y3bGgqKj3QBdxLbLkomlohkvsA8gdAiUQlSBJnBhfn+BPxg4bc62d8TcBW15wavDfgexCgccckhcZvywyQYPOw==}
    hasBin: true

  readable-stream@3.6.2:
    resolution: {integrity: sha512-9u/sniCrY3D5WdsERHzHE4G2YCXqoG5FTHUiCC4SIbr6XcLZBY05ya9EKjYek9O5xOAwjGq+1JdGBAS7Q9ScoA==}
    engines: {node: '>= 6'}

  require-from-string@2.0.2:
    resolution: {integrity: sha512-Xf0nWe6RseziFMu+Ap9biiUbmplq6S9/p+7w7YXP/JBHhrUDDUhwa+vANyubuqfZWTveU//DYVGsDG7RKL/vEw==}
    engines: {node: '>=0.10.0'}

  router@2.2.0:
    resolution: {integrity: sha512-nLTrUKm2UyiL7rlhapu/Zl45FwNgkZGaCpZbIHajDYgwlJCOzLSk+cIPAnsEqV955GjILJnKbdQC1nVPz+gAYQ==}
    engines: {node: '>= 18'}

  safe-buffer@5.2.1:
    resolution: {integrity: sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==}

  safer-buffer@2.1.2:
    resolution: {integrity: sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==}

  semver@7.7.4:
    resolution: {integrity: sha512-vFKC2IEtQnVhpT78h1Yp8wzwrf8CM+MzKMHGJZfBtzhZNycRFnXsHk6E5TxIkkMsgNS7mdX3AGB7x2QM2di4lA==}
    engines: {node: '>=10'}
    hasBin: true

  send@1.2.1:
    resolution: {integrity: sha512-1gnZf7DFcoIcajTjTwjwuDjzuz4PPcY2StKPlsGAQ1+YH20IRVrBaXSWmdjowTJ6u8Rc01PoYOGHXfP1mYcZNQ==}
    engines: {node: '>= 18'}

  serve-static@2.2.1:
    resolution: {integrity: sha512-xRXBn0pPqQTVQiC8wyQrKs2MOlX24zQ0POGaj0kultvoOCstBQM5yvOhAVSUwOMjQtTvsPWoNCHfPGwaaQJhTw==}
    engines: {node: '>= 18'}

  setprototypeof@1.2.0:
    resolution: {integrity: sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==}

  shebang-command@2.0.0:
    resolution: {integrity: sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==}
    engines: {node: '>=8'}

  shebang-regex@3.0.0:
    resolution: {integrity: sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==}
    engines: {node: '>=8'}

  side-channel-list@1.0.0:
    resolution: {integrity: sha512-FCLHtRD/gnpCiCHEiJLOwdmFP+wzCmDEkc9y7NsYxeF4u7Btsn1ZuwgwJGxImImHicJArLP4R0yX4c2KCrMrTA==}
    engines: {node: '>= 0.4'}

  side-channel-map@1.0.1:
    resolution: {integrity: sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==}
    engines: {node: '>= 0.4'}

  side-channel-weakmap@1.0.2:
    resolution: {integrity: sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==}
    engines: {node: '>= 0.4'}

  side-channel@1.1.0:
    resolution: {integrity: sha512-ZX99e6tRweoUXqR+VBrslhda51Nh5MTQwou5tnUDgbtyM0dBgmhEDtWGP/xbKn6hqfPRHujUNwz5fy/wbbhnpw==}
    engines: {node: '>= 0.4'}

  simple-concat@1.0.1:
    resolution: {integrity: sha512-cSFtAPtRhljv69IK0hTVZQ+OfE9nePi/rtJmw5UjHeVyVroEqJXP1sFztKUy1qU+xvz3u/sfYJLa947b7nAN2Q==}

  simple-get@4.0.1:
    resolution: {integrity: sha512-brv7p5WgH0jmQJr1ZDDfKDOSeWWg+OVypG99A/5vYGPqJ6pxiaHLy8nxtFjBA7oMa01ebA9gfh1uMCFqOuXxvA==}

  statuses@2.0.2:
    resolution: {integrity: sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==}
    engines: {node: '>= 0.8'}

  string_decoder@1.3.0:
    resolution: {integrity: sha512-hkRX8U1WjJFd8LsDJ2yQ/wWWxaopEsABU1XfkM8A+j0+85JAGppt16cr1Whg6KIbb4okU6Mql6BOj+uup/wKeA==}

  strip-json-comments@2.0.1:
    resolution: {integrity: sha512-4gB8na07fecVVkOI6Rs4e7T6NOTki5EmL7TUduTs6bu3EdnSycntVJ4re8kgZA+wx9IueI2Y11bfbgwtzuE0KQ==}
    engines: {node: '>=0.10.0'}

  tar-fs@2.1.4:
    resolution: {integrity: sha512-mDAjwmZdh7LTT6pNleZ05Yt65HC3E+NiQzl672vQG38jIrehtJk/J3mNwIg+vShQPcLF/LV7CMnDW6vjj6sfYQ==}

  tar-stream@2.2.0:
    resolution: {integrity: sha512-ujeqbceABgwMZxEJnk2HDY2DlnUZ+9oEcb1KzTVfYHio0UE6dG71n60d8D2I4qNvleWrrXpmjpt7vZeF1LnMZQ==}
    engines: {node: '>=6'}

  toidentifier@1.0.1:
    resolution: {integrity: sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==}
    engines: {node: '>=0.6'}

  tunnel-agent@0.6.0:
    resolution: {integrity: sha512-McnNiV1l8RYeY8tBgEpuodCC1mLUdbSN+CYBL7kJsJNInOP8UjDDEwdk6Mw60vdLLrr5NHKZhMAOSrR2NZuQ+w==}

  type-is@2.0.1:
    resolution: {integrity: sha512-OZs6gsjF4vMp32qrCbiVSkrFmXtG/AZhY3t0iAMrMBiAZyV9oALtXO8hsrHbMXF9x6L3grlFuwW2oAz7cav+Gw==}
    engines: {node: '>= 0.6'}

  typescript@5.9.3:
    resolution: {integrity: sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==}
    engines: {node: '>=14.17'}
    hasBin: true

  undici-types@7.18.2:
    resolution: {integrity: sha512-AsuCzffGHJybSaRrmr5eHr81mwJU3kjw6M+uprWvCXiNeN9SOGwQ3Jn8jb8m3Z6izVgknn1R0FTCEAP2QrLY/w==}

  unpipe@1.0.0:
    resolution: {integrity: sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==}
    engines: {node: '>= 0.8'}

  util-deprecate@1.0.2:
    resolution: {integrity: sha512-EPD5q1uXyFxJpCrLnCc1nHnq3gOa6DZBocAIiI2TaSCA7VCJ1UJDMagCzIkXNsUYfD1daK//LTEQ8xiIbrHtcw==}

  vary@1.1.2:
    resolution: {integrity: sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==}
    engines: {node: '>= 0.8'}

  which@2.0.2:
    resolution: {integrity: sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==}
    engines: {node: '>= 8'}
    hasBin: true

  wrappy@1.0.2:
    resolution: {integrity: sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==}

  zod-to-json-schema@3.25.1:
    resolution: {integrity: sha512-pM/SU9d3YAggzi6MtR4h7ruuQlqKtad8e9S0fmxcMi+ueAK5Korys/aWcV9LIIHTVbj01NdzxcnXSN+O74ZIVA==}
    peerDependencies:
      zod: ^3.25 || ^4

  zod@4.3.6:
    resolution: {integrity: sha512-rftlrkhHZOcjDwkGlnUtZZkvaPHCsDATp4pGpuOOMDaTdDDXF91wuVDJoWoPsKX/3YPQ5fHuF3STjcYyKr+Qhg==}

snapshots:

  '@hono/node-server@1.19.11(hono@4.12.9)':
    dependencies:
      hono: 4.12.9

  '@modelcontextprotocol/sdk@1.27.1(zod@4.3.6)':
    dependencies:
      '@hono/node-server': 1.19.11(hono@4.12.9)
      ajv: 8.18.0
      ajv-formats: 3.0.1(ajv@8.18.0)
      content-type: 1.0.5
      cors: 2.8.6
      cross-spawn: 7.0.6
      eventsource: 3.0.7
      eventsource-parser: 3.0.6
      express: 5.2.1
      express-rate-limit: 8.3.1(express@5.2.1)
      hono: 4.12.9
      jose: 6.2.2
      json-schema-typed: 8.0.2
      pkce-challenge: 5.0.1
      raw-body: 3.0.2
      zod: 4.3.6
      zod-to-json-schema: 3.25.1(zod@4.3.6)
    transitivePeerDependencies:
      - supports-color

  '@tsconfig/node24@24.0.4': {}

  '@types/better-sqlite3@7.6.13':
    dependencies:
      '@types/node': 25.5.0

  '@types/node@25.5.0':
    dependencies:
      undici-types: 7.18.2

  accepts@2.0.0:
    dependencies:
      mime-types: 3.0.2
      negotiator: 1.0.0

  ajv-formats@3.0.1(ajv@8.18.0):
    optionalDependencies:
      ajv: 8.18.0

  ajv@8.18.0:
    dependencies:
      fast-deep-equal: 3.1.3
      fast-uri: 3.1.0
      json-schema-traverse: 1.0.0
      require-from-string: 2.0.2

  base64-js@1.5.1: {}

  better-sqlite3@12.8.0:
    dependencies:
      bindings: 1.5.0
      prebuild-install: 7.1.3

  bindings@1.5.0:
    dependencies:
      file-uri-to-path: 1.0.0

  bl@4.1.0:
    dependencies:
      buffer: 5.7.1
      inherits: 2.0.4
      readable-stream: 3.6.2

  body-parser@2.2.2:
    dependencies:
      bytes: 3.1.2
      content-type: 1.0.5
      debug: 4.4.3
      http-errors: 2.0.1
      iconv-lite: 0.7.2
      on-finished: 2.4.1
      qs: 6.15.0
      raw-body: 3.0.2
      type-is: 2.0.1
    transitivePeerDependencies:
      - supports-color

  buffer@5.7.1:
    dependencies:
      base64-js: 1.5.1
      ieee754: 1.2.1

  bytes@3.1.2: {}

  call-bind-apply-helpers@1.0.2:
    dependencies:
      es-errors: 1.3.0
      function-bind: 1.1.2

  call-bound@1.0.4:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      get-intrinsic: 1.3.0

  chownr@1.1.4: {}

  commander@14.0.3: {}

  content-disposition@1.0.1: {}

  content-type@1.0.5: {}

  cookie-signature@1.2.2: {}

  cookie@0.7.2: {}

  cors@2.8.6:
    dependencies:
      object-assign: 4.1.1
      vary: 1.1.2

  cross-spawn@7.0.6:
    dependencies:
      path-key: 3.1.1
      shebang-command: 2.0.0
      which: 2.0.2

  debug@4.4.3:
    dependencies:
      ms: 2.1.3

  decompress-response@6.0.0:
    dependencies:
      mimic-response: 3.1.0

  deep-extend@0.6.0: {}

  depd@2.0.0: {}

  detect-libc@2.1.2: {}

  dunder-proto@1.0.1:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-errors: 1.3.0
      gopd: 1.2.0

  ee-first@1.1.1: {}

  encodeurl@2.0.0: {}

  end-of-stream@1.4.5:
    dependencies:
      once: 1.4.0

  es-define-property@1.0.1: {}

  es-errors@1.3.0: {}

  es-object-atoms@1.1.1:
    dependencies:
      es-errors: 1.3.0

  escape-html@1.0.3: {}

  etag@1.8.1: {}

  eventsource-parser@3.0.6: {}

  eventsource@3.0.7:
    dependencies:
      eventsource-parser: 3.0.6

  expand-template@2.0.3: {}

  express-rate-limit@8.3.1(express@5.2.1):
    dependencies:
      express: 5.2.1
      ip-address: 10.1.0

  express@5.2.1:
    dependencies:
      accepts: 2.0.0
      body-parser: 2.2.2
      content-disposition: 1.0.1
      content-type: 1.0.5
      cookie: 0.7.2
      cookie-signature: 1.2.2
      debug: 4.4.3
      depd: 2.0.0
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      finalhandler: 2.1.1
      fresh: 2.0.0
      http-errors: 2.0.1
      merge-descriptors: 2.0.0
      mime-types: 3.0.2
      on-finished: 2.4.1
      once: 1.4.0
      parseurl: 1.3.3
      proxy-addr: 2.0.7
      qs: 6.15.0
      range-parser: 1.2.1
      router: 2.2.0
      send: 1.2.1
      serve-static: 2.2.1
      statuses: 2.0.2
      type-is: 2.0.1
      vary: 1.1.2
    transitivePeerDependencies:
      - supports-color

  fast-deep-equal@3.1.3: {}

  fast-uri@3.1.0: {}

  file-uri-to-path@1.0.0: {}

  finalhandler@2.1.1:
    dependencies:
      debug: 4.4.3
      encodeurl: 2.0.0
      escape-html: 1.0.3
      on-finished: 2.4.1
      parseurl: 1.3.3
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  forwarded@0.2.0: {}

  fresh@2.0.0: {}

  fs-constants@1.0.0: {}

  function-bind@1.1.2: {}

  get-intrinsic@1.3.0:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-define-property: 1.0.1
      es-errors: 1.3.0
      es-object-atoms: 1.1.1
      function-bind: 1.1.2
      get-proto: 1.0.1
      gopd: 1.2.0
      has-symbols: 1.1.0
      hasown: 2.0.2
      math-intrinsics: 1.1.0

  get-proto@1.0.1:
    dependencies:
      dunder-proto: 1.0.1
      es-object-atoms: 1.1.1

  github-from-package@0.0.0: {}

  gopd@1.2.0: {}

  has-symbols@1.1.0: {}

  hasown@2.0.2:
    dependencies:
      function-bind: 1.1.2

  hono@4.12.9: {}

  http-errors@2.0.1:
    dependencies:
      depd: 2.0.0
      inherits: 2.0.4
      setprototypeof: 1.2.0
      statuses: 2.0.2
      toidentifier: 1.0.1

  iconv-lite@0.7.2:
    dependencies:
      safer-buffer: 2.1.2

  ieee754@1.2.1: {}

  inherits@2.0.4: {}

  ini@1.3.8: {}

  ip-address@10.1.0: {}

  ipaddr.js@1.9.1: {}

  is-promise@4.0.0: {}

  isexe@2.0.0: {}

  jose@6.2.2: {}

  json-schema-traverse@1.0.0: {}

  json-schema-typed@8.0.2: {}

  math-intrinsics@1.1.0: {}

  media-typer@1.1.0: {}

  merge-descriptors@2.0.0: {}

  mime-db@1.54.0: {}

  mime-types@3.0.2:
    dependencies:
      mime-db: 1.54.0

  mimic-response@3.1.0: {}

  minimist@1.2.8: {}

  mkdirp-classic@0.5.3: {}

  ms@2.1.3: {}

  napi-build-utils@2.0.0: {}

  negotiator@1.0.0: {}

  node-abi@3.89.0:
    dependencies:
      semver: 7.7.4

  object-assign@4.1.1: {}

  object-inspect@1.13.4: {}

  on-finished@2.4.1:
    dependencies:
      ee-first: 1.1.1

  once@1.4.0:
    dependencies:
      wrappy: 1.0.2

  parseurl@1.3.3: {}

  path-key@3.1.1: {}

  path-to-regexp@8.3.0: {}

  pkce-challenge@5.0.1: {}

  prebuild-install@7.1.3:
    dependencies:
      detect-libc: 2.1.2
      expand-template: 2.0.3
      github-from-package: 0.0.0
      minimist: 1.2.8
      mkdirp-classic: 0.5.3
      napi-build-utils: 2.0.0
      node-abi: 3.89.0
      pump: 3.0.4
      rc: 1.2.8
      simple-get: 4.0.1
      tar-fs: 2.1.4
      tunnel-agent: 0.6.0

  proxy-addr@2.0.7:
    dependencies:
      forwarded: 0.2.0
      ipaddr.js: 1.9.1

  pump@3.0.4:
    dependencies:
      end-of-stream: 1.4.5
      once: 1.4.0

  qs@6.15.0:
    dependencies:
      side-channel: 1.1.0

  range-parser@1.2.1: {}

  raw-body@3.0.2:
    dependencies:
      bytes: 3.1.2
      http-errors: 2.0.1
      iconv-lite: 0.7.2
      unpipe: 1.0.0

  rc@1.2.8:
    dependencies:
      deep-extend: 0.6.0
      ini: 1.3.8
      minimist: 1.2.8
      strip-json-comments: 2.0.1

  readable-stream@3.6.2:
    dependencies:
      inherits: 2.0.4
      string_decoder: 1.3.0
      util-deprecate: 1.0.2

  require-from-string@2.0.2: {}

  router@2.2.0:
    dependencies:
      debug: 4.4.3
      depd: 2.0.0
      is-promise: 4.0.0
      parseurl: 1.3.3
      path-to-regexp: 8.3.0
    transitivePeerDependencies:
      - supports-color

  safe-buffer@5.2.1: {}

  safer-buffer@2.1.2: {}

  semver@7.7.4: {}

  send@1.2.1:
    dependencies:
      debug: 4.4.3
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      fresh: 2.0.0
      http-errors: 2.0.1
      mime-types: 3.0.2
      ms: 2.1.3
      on-finished: 2.4.1
      range-parser: 1.2.1
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  serve-static@2.2.1:
    dependencies:
      encodeurl: 2.0.0
      escape-html: 1.0.3
      parseurl: 1.3.3
      send: 1.2.1
    transitivePeerDependencies:
      - supports-color

  setprototypeof@1.2.0: {}

  shebang-command@2.0.0:
    dependencies:
      shebang-regex: 3.0.0

  shebang-regex@3.0.0: {}

  side-channel-list@1.0.0:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4

  side-channel-map@1.0.1:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4

  side-channel-weakmap@1.0.2:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4
      side-channel-map: 1.0.1

  side-channel@1.1.0:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4
      side-channel-list: 1.0.0
      side-channel-map: 1.0.1
      side-channel-weakmap: 1.0.2

  simple-concat@1.0.1: {}

  simple-get@4.0.1:
    dependencies:
      decompress-response: 6.0.0
      once: 1.4.0
      simple-concat: 1.0.1

  statuses@2.0.2: {}

  string_decoder@1.3.0:
    dependencies:
      safe-buffer: 5.2.1

  strip-json-comments@2.0.1: {}

  tar-fs@2.1.4:
    dependencies:
      chownr: 1.1.4
      mkdirp-classic: 0.5.3
      pump: 3.0.4
      tar-stream: 2.2.0

  tar-stream@2.2.0:
    dependencies:
      bl: 4.1.0
      end-of-stream: 1.4.5
      fs-constants: 1.0.0
      inherits: 2.0.4
      readable-stream: 3.6.2

  toidentifier@1.0.1: {}

  tunnel-agent@0.6.0:
    dependencies:
      safe-buffer: 5.2.1

  type-is@2.0.1:
    dependencies:
      content-type: 1.0.5
      media-typer: 1.1.0
      mime-types: 3.0.2

  typescript@5.9.3: {}

  undici-types@7.18.2: {}

  unpipe@1.0.0: {}

  util-deprecate@1.0.2: {}

  vary@1.1.2: {}

  which@2.0.2:
    dependencies:
      isexe: 2.0.0

  wrappy@1.0.2: {}

  zod-to-json-schema@3.25.1(zod@4.3.6):
    dependencies:
      zod: 4.3.6

  zod@4.3.6: {}


## Convention Reference (sibling files not modified by this commission)


=== CONTEXT FILE: README.md ===
# Nexus Mk 2.1

A framework for operating multi-agent AI workforces. Nexus provides the guild model: a structured workspace where animas (AI identities) receive commissions, use tools, record work, and collaborate through a shared Books database and event-driven Clockworks.

The framework is plugin-based. Almost everything — tools, engines, database schemas, anima management — is contributed by plugins. The core runtime is intentionally minimal.

---

## For users

### Install the CLI

```sh
npm install -g @shardworks/nexus
```

This installs the `nsg` command globally.

### Initialize a guild

A guild is the workspace where animas operate. Create one with `nsg init`:

```sh
nsg init ./my-guild --name my-guild
cd my-guild
```

This writes `guild.json`, `package.json`, `.gitignore`, and the `.nexus/` directory structure. It does not install any plugins or create any animas.

### Install plugins

Plugins are npm packages that contribute tools, engines, database schemas, and other capabilities to your guild. Install them with `nsg rig install`:

```sh
# Install from npm
nsg rig install @shardworks/nexus-stdlib

# Pin a version
nsg rig install @shardworks/nexus-stdlib@1.2.0

# Install from a git repository
nsg rig install git+https://github.com/acme/my-plugin.git

# Symlink a local directory during development
nsg rig install ./path/to/my-plugin --type link
```

By default, a plugin's tools are added to `baseTools` (available to all animas). To assign tools to specific roles instead:

```sh
nsg rig install @shardworks/nexus-stdlib --roles artificer,scribe
```

List installed plugins:

```sh
nsg rig list
```

Remove a plugin:

```sh
nsg rig remove nexus-stdlib
```

### Check guild status

```sh
nsg status          # guild name, nexus version, installed plugins, roles
nsg version         # framework version + installed plugin versions
```

### `guild.json`

The guild's central configuration file. Updated automatically by `nsg rig install` and `nsg rig remove`. Stores the plugin list, role definitions, tool assignments, Clockworks standing orders, and guild settings.

Plugins are listed by their derived plugin id (package name with the `@shardworks/` scope stripped):

```json
{
  "name": "my-guild",
  "nexus": "2.1.0",
  "plugins": ["nexus-stdlib", "nexus-clockworks"],
  "baseTools": ["commission", "signal", "list-writs"],
  "roles": { ... },
  "settings": { "model": "claude-opus-4-5" }
}
```

---

## For plugin authors

Nexus plugins are npm packages that contribute capabilities to a guild. There are two kinds:

- **Kit** — a passive package contributing tools, engines, relays, or other capabilities. No lifecycle; contributions are read at load time and used by consuming apparatuses.
- **Apparatus** — a package contributing persistent running infrastructure. Has a `start`/`stop` lifecycle, receives `GuildContext` at startup, and exposes a runtime API via `provides`.

Plugin authors import exclusively from `@shardworks/nexus-core`. The arbor runtime (`@shardworks/nexus-arbor`) is an internal concern of the CLI and session provider.

### Key points

- A plugin's **name is inferred from its npm package name** at load time — never declared in the manifest.
- A **kit** is a plain object exported as `{ kit: { ... } }`. The `tools` field (array of `ToolDefinition`) is the most common contribution.
- An **apparatus** is exported as `{ apparatus: { start, stop?, provides?, requires?, supportKit?, consumes? } }`.
- `requires` on a kit names apparatuses whose runtime APIs the kit's tool handlers will call. Hard startup failure if not installed.
- `requires` on an apparatus names other apparatuses that must be started first. Determines start order.
- Apparatus `provides` objects are retrieved at handler invocation time via `ctx.apparatus<T>(name)`.

### Authoring tools

The `tool()` function is the primary authoring entry point. Define a name, description, Zod param schema, and a handler:

```typescript
import { tool } from '@shardworks/nexus-core';
import { z } from 'zod';

const greet = tool({
  name: 'greet',
  description: 'Greet someone by name',
  params: {
    name: z.string().describe('Name to greet'),
  },
  handler: async ({ name }, ctx) => {
    return `Hello, ${name}! Guild root: ${ctx.home}`;
  },
});
```

The handler receives:
- `params` — validated input, typed from your Zod schemas
- `ctx` — a `HandlerContext` with `home` (guild root path) and `apparatus<T>(name)` for accessing started apparatus APIs

Restrict a tool to specific callers with `callableBy`:

```typescript
tool({
  name: 'admin-reset',
  callableBy: ['cli'],    // CLI only — not available to animas
  // ...
});
```

### Exporting a kit

A kit is the simplest plugin form — a plain object with a `kit` key:

```typescript
import { tool, type Kit } from '@shardworks/nexus-core';

const myTool = tool({ name: 'lookup', /* ... */ });

export default {
  kit: {
    tools: [myTool],

    // Optional: declare required apparatuses whose APIs your handlers call
    requires: ['nexus-books'],

    // Optional: document contribution fields for consuming apparatuses
    // (field types are defined by the apparatus packages that consume them)
    books: {
      records: { indexes: ['status', 'createdAt'] },
    },
  } satisfies Kit,
};
```

The `tools` field is the most common kit contribution. Other contribution fields (`engines`, `relays`, etc.) are defined by the apparatus packages that consume them — the framework treats any unknown field as opaque data.

### Exporting an apparatus

An apparatus has a `start`/`stop` lifecycle and can expose a runtime API:

```typescript
import { type Apparatus, type GuildContext } from '@shardworks/nexus-core';

// The API you expose to other plugins
interface MyApi {
  lookup(key: string): string | null;
}

const store = new Map<string, string>();

export default {
  apparatus: {
    // Apparatuses this one requires to be started first
    requires: ['nexus-books'],

    // The runtime API object exposed via ctx.apparatus<MyApi>('my-plugin')
    provides: {
      lookup(key: string) { return store.get(key) ?? null; },
    } satisfies MyApi,

    async start(ctx: GuildContext) {
      // ctx.apparatus<BooksApi>('nexus-books') is available here
      // ctx.kits() — snapshot of all loaded kits
      // ctx.on('plugin:initialized', handler) — react to kit contributions
    },

    async stop() {
      store.clear();
    },
  } satisfies Apparatus,
};
```

Consumers retrieve your `provides` object via `ctx.apparatus<MyApi>('my-plugin')` — either in their own `start()` or in tool handlers via `HandlerContext.apparatus<T>()`.

An apparatus can also contribute tools via `supportKit`:

```typescript
export default {
  apparatus: {
    supportKit: {
      tools: [myAdminTool],
    },
    // ...
  },
};
```

### `HandlerContext`

Injected into every tool and engine handler at invocation time:

```typescript
interface HandlerContext {
  home: string;                        // absolute path to the guild root
  apparatus<T>(name: string): T;       // access a started apparatus's provides object
}
```

### Further reading

- [`packages/arbor/README.md`](packages/arbor/README.md) — runtime API reference (`createArbor`, `Arbor`, `LoadedKit`, `LoadedApparatus`, `derivePluginId`, Books database)
- [`docs/architecture/plugins.md`](docs/architecture/plugins.md) — full plugin architecture specification
- [`docs/architecture/apparatus/books.md`](docs/architecture/apparatus/books.md) — Books apparatus design (in progress)

=== CONTEXT FILE: package.json ===
{
  "private": true,
  "packageManager": "pnpm@10.32.1",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus-mk2"
  },
  "type": "module",
  "engines": {
    "node": "24.x"
  },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "nsg": "node --disable-warning=ExperimentalWarning --experimental-transform-types packages/framework/cli/src/cli.ts",
    "vibe": "node --disable-warning=ExperimentalWarning --experimental-transform-types packages/framework/cli/src/cli.ts --guild-root /workspace/vibers"
  },
  "devDependencies": {
    "@tsconfig/node24": "24.0.4",
    "typescript": "5.9.3"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "better-sqlite3"
    ]
  }
}

=== CONTEXT FILE: LICENSE ===
ISC License

Copyright (c) 2026 Sean Boots

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

=== CONTEXT FILE: docs/DEVELOPERS.md ===
# Nexus Developer Guide

This document is for agents and humans building the Nexus framework — creating packages, implementing apparatus, authoring kits, and contributing to the monorepo. It covers project setup, build workflow, package conventions, and documentation standards.

For the conceptual vocabulary, read [The Guild Metaphor](guild-metaphor.md). For the system architecture, read [Architecture](architecture/index.md).

---

## Project Setup

Nexus is a pnpm workspace monorepo. All packages live under `packages/`.

### Prerequisites

- **Node.js 24.x** (see `engines` in root `package.json`)
- **pnpm 10.x** (see `packageManager` in root `package.json`)

### Install and Build

```sh
pnpm install
pnpm build        # tsc across all packages
pnpm test         # node --test across all packages
pnpm typecheck    # tsc --noEmit across all packages
```

### Running the CLI locally

```sh
pnpm nsg <command>
```

Uses Node's `--experimental-transform-types` to run TypeScript directly — no build step required for development iteration.

### Package-level commands

Each package has its own `build`, `test`, and `typecheck` scripts:

```sh
cd packages/stacks
pnpm test          # run tests for this package only
pnpm typecheck     # type-check this package only
```

---

## Package Conventions

### Naming

Packages in the `@shardworks/` scope follow a naming convention that determines their plugin id (the short name used in `guild.json`, `requires` arrays, and `guild().apparatus()` calls):

1. Strip `@shardworks/` scope
2. Strip trailing `-(plugin|apparatus|kit)` suffix

| npm package | Plugin id |
|---|---|
| `@shardworks/stacks` | `stacks` |
| `@shardworks/tools-apparatus` | `tools` |
| `@shardworks/nexus-core` | `nexus-core` |

Choose package names so the derived plugin id is short, clear, and reads naturally in configuration.

### Module format

All packages are ESM (`"type": "module"` in `package.json`). TypeScript sources use `.ts` extensions; import paths use `.ts` in source (rewritten by `rewriteRelativeImportExtensions` during build) or `.js` for published output.

### Exports

Every package declares explicit `exports` in `package.json`. For development, exports point at source TypeScript (`./src/index.ts`). For publishing, `publishConfig.exports` points at built output (`./dist/index.js` with `.d.ts` types).

```json
{
  "exports": {
    ".": "./src/index.ts"
  },
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
}
```

Additional entry points (e.g. `./testing` for test utilities) follow the same pattern.

### Dependencies

- **Workspace dependencies** use `"workspace:*"` — e.g. `"@shardworks/nexus-core": "workspace:*"`
- **Apparatus packages** depend on `@shardworks/nexus-core` for types, `guild()`, and SDK factories
- **Kit packages** depend only on `@shardworks/nexus-core` — never on apparatus packages directly. Kit code accesses apparatus APIs at runtime via `guild().apparatus()`, not at import time.

### Tests

Tests use Node's built-in test runner (`node --test`). Test files are colocated with source as `*.test.ts`. No external test framework is required.

```sh
pnpm test   # from package root, or monorepo root for all packages
```

---

## Creating a New Package

1. Create a directory under `packages/`:
   ```sh
   mkdir packages/my-apparatus
   ```

2. Add `package.json` with workspace conventions:
   ```json
   {
     "name": "@shardworks/my-apparatus",
     "version": "0.0.0",
     "type": "module",
     "exports": { ".": "./src/index.ts" },
     "scripts": {
       "build": "tsc",
       "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
       "typecheck": "tsc --noEmit"
     },
     "dependencies": {
       "@shardworks/nexus-core": "workspace:*"
     }
   }
   ```

3. Add `tsconfig.json` extending the root config:
   ```json
   {
     "extends": "../../tsconfig.json",
     "compilerOptions": {
       "outDir": "dist",
       "rootDir": "src"
     },
     "include": ["src"]
   }
   ```

4. Create `src/index.ts` with the package's public API.

5. Write a **README.md** (see [README Standards](#readme-standards) below).

6. Run `pnpm install` from the monorepo root to link the new package into the workspace.

---

## Documentation Layers

The project maintains three layers of documentation for different audiences:

| Layer | Audience | Purpose | Location |
|---|---|---|---|
| **Architecture specs** | Implementers | Full system design — internal mechanics, lifecycle, error contracts, backend interfaces, migration notes, open questions | `docs/architecture/apparatus/{name}.md` |
| **Package READMEs** | Consumers (other packages, kit authors) | How to use this package — API surface, configuration, examples | `packages/{name}/README.md` |
| **Architecture index** | Architects (understanding the whole system) | Narrative overview — how pieces relate, what flows where, why | `docs/architecture/index.md` |

These layers overlap intentionally. The README is a curated subset of the architecture spec, written for a reader who wants to *use* the package, not *build* it. The architecture spec is the source of truth during design; the README becomes the source of truth for consumers once the package ships.

### When each is written

- **Architecture specs** are written during design, before implementation begins. They serve as commission specs for implementing agents.
- **READMEs** are written during implementation, as part of the build. The implementing agent extracts consumer-facing content from the architecture spec into the README.
- **Architecture index** is maintained continuously as the system evolves.

---

## README Standards

Every published package must include a `README.md`. The README is the consumer-facing documentation — the first thing another developer (human or agent) reads when they depend on your package.

### Structure

Follow this structure, omitting sections that don't apply:

```markdown
# `@shardworks/{package-name}`

{One paragraph: what this package does, who it's for, and where it sits
in the dependency graph.}

---

## Installation

{How to depend on this package. For workspace packages, this is typically
just adding it to `dependencies` with `workspace:*`.}

## API

{The `provides` interface (for apparatus) or the default export shape
(for kits). Full TypeScript signatures with JSDoc. Include usage examples
showing real-world calls, not just type signatures.}

## Configuration

{Plugin configuration in `guild.json`, if any. Show the JSON structure
and explain each field with defaults.}

## Kit Interface *(apparatus only, optional)*

{For apparatus that consume kit contributions (those declaring
`consumes`): document the contribution schema that kit authors use.
E.g. the Stacks documents the `books` field shape; the Instrumentarium
documents the `tools` field shape. This tells kit authors "here's how
to contribute to this apparatus."}

## Kit Contributions *(kits only, optional)*

{For kit packages: document what the kit contributes (tools, books,
engines, relays), which apparatus it `requires`, and which it
`recommends`. This tells consumers "here's what this kit brings to
the guild."}

## Support Kit *(apparatus only, optional)*

{For apparatus with a supportKit: document the tools, books, or other
contributions the apparatus itself provides to the guild. This is the
apparatus's own kit-style output — e.g. the Animator's session-list
tool, the Parlour's conversations book.}

## Exports

{Secondary entry points beyond the main export, if any. E.g. a
`./testing` export for test utilities.}
```

### What belongs in the README vs. the architecture spec

**In the README:**
- Purpose and positioning (one paragraph)
- The `provides` API with usage examples
- Configuration schema and defaults
- Kit interface — the contribution schema kit authors use (apparatus only, if it consumes contributions)
- Kit contributions — what the package contributes and what it requires (kits only)
- Support kit contents — tools, books, etc. the apparatus provides to the guild (apparatus only)
- Secondary exports

**Not in the README (lives in the architecture spec):**
- Internal lifecycle diagrams and step-by-step flows
- Error handling contracts (unless they directly affect caller behavior)
- Backend interfaces and internal abstractions
- CDC mechanics, cascade rules, coalescing behavior
- Implementation notes, migration guidance
- Future sections, open questions, design alternatives

### Style

- **Lead with usage.** Show how to call the API before explaining what it does internally.
- **Use real examples.** Don't just show type signatures — show a tool handler calling `guild().apparatus<StacksApi>('stacks')` and doing something with the result.
- **Be precise about types.** Include full TypeScript interfaces. Consumers will read the README to understand what they can pass and what they get back.
- **Keep it current.** The README must match the shipped code. If the API changes, the README changes in the same commit. Stale documentation is worse than no documentation.

### Examples of good existing READMEs

- `packages/arbor/README.md` — thorough API reference with tables, clear separation of runtime API from plugin loading internals
- `packages/core/README.md` — SDK-first, shows `tool()` usage immediately, organizes by capability

---

## Commit Practices

- **Commit early and often.** Small, atomic commits. Don't accumulate large changesets — this is a multi-agent environment where conflicts are a real risk.
- **Self-document for other agents.** Write commit messages assuming your primary reader is another agent continuing the work. Be precise and concise.
- **Minimize conflict surface.** Prefer adding new files over modifying shared ones. Keep changes to shared files narrow. Commit and merge promptly.

---

## Architecture Specs

Architecture specs live in `docs/architecture/apparatus/` and follow the [apparatus template](architecture/apparatus/_template.md). They are design documents written before implementation — the implementing agent reads the spec as its primary commission input.

An architecture spec should contain everything needed to build the package:
- Full TypeScript interfaces for the `provides` API and all supporting types
- Behavioral sections (lifecycle flows, error handling, algorithms)
- Configuration schema
- Kit contribution and support kit declarations
- Open questions and future evolution
- Implementation notes (migration concerns, known gotchas, dependencies on other work)

When commissioning an apparatus build, the spec *is* the commission. The implementing agent reads the spec, builds the package, writes the README (extracting consumer content from the spec), and delivers a working package with tests.

=== CONTEXT FILE: docs/philosophy.md ===
# Nexus Mk 2.1 — Project Philosophy

> The whole project is an experiment in whether that relationship — patron directing a guild — is genuinely achievable with AI. Not "AI as a tool the human wields" (that's Mk 2.0, that's every IDE plugin, that's most of the industry). But AI as a workforce that the human directs by intent and judges by output.   

## What Is This

Nexus Mk 2.1 is an experimental multi-agent AI system — and a deliberate departure from its predecessor.

In Mk 2.0, the human was an architect-reviewer: reading code, approving pull requests, steering implementation. The codebase was shared territory. In Mk 2.1, the human is a *user*. The system produces things; the human uses them. The internal workings are the system's own business.

The project serves multiple purposes simultaneously:

1. **Build an autonomous system** — A system where AI agents collaborate to accomplish objectives, delivering usable artifacts without human involvement in implementation.
2. **Explore the user boundary** — Discover what happens when the human gives up visibility into internals and evaluates the system purely by its outputs.
3. **Document the experiment** — The process of building and interacting with the system is primary source material for published writing on AI-enabled development.

## Precepts

1. **The system will be known by its fruits.** The human judges the system by using what it produces, not by inspecting how it was made. Quality is measured at the boundary.

2. **If you can't touch it, it doesn't exist.** The system's job isn't done at the commit. It's done when a human can run, use, or interact with what was built.

3. **Point at the mountain, not the trail.** The human names the destination. The system finds its own path. How it gets there is not the human's concern.

4. **The sanctum is sacred ground.** This repo is the human's space — for thinking, tooling, and orchestration. The system's code lives elsewhere. Agents do not operate here autonomously. You *could* cross the boundary; the system should never require it.

## Mantras

Personal reminders for the human operator. Not system rules — habits of mind.

- **Let go of the wheel.** Resist the urge to steer implementation. Direct, then trust. The hardest part isn't building the system; it's not reaching in to fix it yourself.
- **Speak in wishes, not blueprints.** Express what you want, not how to build it. The more you specify, the less the system can surprise you — and surprise is the point.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js (v24)

## Topology

This repository (`nexus-mk2`) is the sanctum — the human's space for thinking, planning, and building tools to direct and evaluate the system. Agent configurations, session transcripts, evaluation scripts, and orchestration tooling live here.

The system's own code lives in separate repositories within the same organization. The human does not clone, review, or contribute to those repositories during normal operation. The boundary is maintained by discipline, not access control.

## Agent Architecture

Agents are defined in `.claude/agents/`. Each agent file specifies a persona with its own responsibilities and interaction style. All agents inherit the shared directives in `.claude/CLAUDE.md`.

- **Interactive agents** engage in conversation with the human. Sessions are captured as transcripts. (e.g., Coco)
- **Autonomous agents** are invoked programmatically, run without human interaction, and exit when their task is complete.

## Addendums

### On Mountains and Trails

A destination is not just a peak — it is a peak with constraints. Some constraints describe how to get there and belong to the system. Others describe properties the output must have to be usable at all. These are requirements, and they belong in the direction.

The test is simple: **if the system built it another way and you would accept it, let it go.** If building it another way would make the output unusable to you, name it. Name what usability requires. The system owns everything else.

### On Building Trust

The system does not begin capable. There is a period before the user relationship is possible — when the system is building its own foundation and the human cannot yet evaluate the infrastructure purely by its outputs.

Initially, the human names more requirements. The same test applies — name what usability requires — but more things are required because the foundation is unproven. Architecture, data boundaries, workflow design: these are properties the output must have to be usable, and the human names them until the infrastructure earns the right to own them.

=== CONTEXT FILE: docs/architecture ===
tree b98821d8f6e34359fa506196cb377f8dd47ca090:docs/architecture

_agent-context.md
apparatus/
clockworks.md
index.md
kit-components.md
plugins.md
rigging.md

=== CONTEXT FILE: docs/architecture/clockworks.md ===
# The Clockworks

The Clockworks is the guild's nervous system — the event-driven layer that connects things that happen to things that should happen in response. It turns the guild from an imperative system (things happen when someone calls something) into a reactive one (things happen because other things happened).

The Clockworks is Pillar 5 of the guild architecture. The first four pillars make the guild *capable*. The Clockworks makes it *alive* — able to act on itself without waiting for the patron to push.

---

## Core Concepts

### Events

An event is an immutable fact: *this happened*.

```typescript
{
  name: string;       // e.g. "commission.sealed", "tool.installed"
  payload: unknown;   // event-specific data
  emitter: string;    // who signaled it: anima name, engine name, or "framework"
  firedAt: DateTime;
}
```

Events are persisted to the Clockworks' own event queue immediately when signaled. They do not carry intent — they carry record. An event says "this occurred"; it does not say "therefore do this." That causal link lives in standing orders. The event and dispatch tables are internal Clockworks operational state — not part of the guild's Books (Register, Ledger, Daybook).

#### Framework events

Signaled automatically by `nexus-core` operations. Always available; no guild configuration needed.

| Event | Signaled when |
|---|---|
| `anima.instantiated` | A new anima is created |
| `anima.state.changed` | An anima transitions state (aspirant → active, active → retired) |
| `anima.manifested` | An anima is launched for a session |
| `anima.session.ended` | A session completes |
| `commission.posted` | A new commission is posted by the patron |
| `commission.state.changed` | A commission transitions state |
| `commission.sealed` | A commission completes successfully |
| `commission.failed` | A commission fails |
| `{type}.ready` | A writ transitions to `ready` — available for dispatch (e.g. `mandate.ready`, `task.ready`) |
| `{type}.completed` | A writ is fulfilled (e.g. `mandate.completed`, `task.completed`) |
| `{type}.failed` | A writ fails (e.g. `mandate.failed`, `task.failed`) |
| `tool.installed` | A tool (implement, engine, curriculum, or temperament) is installed |
| `tool.removed` | A tool is removed |
| `migration.applied` | A database migration is applied |
| `guild.initialized` | The guild is first initialized |
| `standing-order.failed` | A standing order failed during execution (see Error Handling) |

Framework events are signaled from authoritative code paths in `nexus-core`. Animas cannot signal them.

#### Custom guild events

Guilds declare their own events in `guild.json` under the `clockworks` key:

```json
{
  "clockworks": {
    "events": {
      "code.reviewed": {
        "description": "Signaled when an anima completes a code review",
        "schema": { "pr": "number", "issues_found": "number" }
      },
      "deploy.approved": {
        "description": "Leadership has approved a deployment"
      }
    }
  }
}
```

Custom events use any name not in a reserved framework namespace (`anima.*`, `commission.*`, `tool.*`, `migration.*`, `guild.*`, `standing-order.*`, `session.*`). Writ lifecycle events (e.g. `mandate.ready`, `task.completed`) use guild-defined type names as namespaces — they are framework-emitted but not in the reserved list. See the [Event Catalog](../reference/event-catalog.md#writ-lifecycle-events) for how validation handles this. Bundles may also declare events they introduce; these are merged into `guild.json` on installation.

Animas signal custom events using the `signal` tool. The tool validates the event name against declared events in `guild.json` before persisting.

#### Book change events (Stacks auto-wiring)

The Clockworks apparatus registers CDC handlers across all declared books at startup via The Stacks' `watch()` API (see [stacks.md](apparatus/stacks.md#6-change-data-capture-cdc)). This emits `book.<ownerId>.<bookName>.created`, `book.<ownerId>.<bookName>.updated`, and `book.<ownerId>.<bookName>.deleted` events into the Clockworks event stream automatically — no per-book configuration needed.

```typescript
// In clockworks apparatus start()
const stacks = ctx.apparatus<StacksApi>('stacks')
for (const plugin of ctx.plugins) {
  const bookNames = Object.keys(plugin.books ?? {})
  for (const bookName of bookNames) {
    stacks.watch(plugin.id, bookName, async (event) => {
      await clockworksApi.emit(`book.${event.ownerId}.${event.book}.${event.type}`, event)
    }, { failOnError: false })  // clockworks failure must not block writes
  }
}
```

This means any book mutation from any plugin is observable via standing orders without the originating plugin needing to signal events explicitly. Standing orders can respond to book change events just like framework or custom events:

```json
{ "on": "book.nexus-ledger.writs.updated", "run": "audit-writ-changes" }
```

---

### Standing Orders

A standing order is a registered response to an event. Standing orders are **guild policy** — they live in `guild.json` under the `clockworks` key, not in relay descriptors. The guild decides what fires when; a relay is a capability, not a policy.

#### Canonical form

Every standing order has one canonical form: `{ on, run, ...params }`. The `on` key names the event to respond to. The `run` key names the relay to invoke. Any additional keys are **params** passed to the relay via `RelayContext.params`.

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "commission.sealed",  "run": "cleanup-worktree" },
      { "on": "mandate.ready",      "summon": "artificer", "prompt": "..." },
      { "on": "code.reviewed",      "run": "notify-patron" },
      { "on": "deploy.requested",   "run": "deploy", "environment": "staging", "dryRun": true }
    ]
  }
}
```

#### The `summon` verb (syntactic sugar)

The `summon` key is shorthand for invoking the **summon relay** — the stdlib relay that handles anima session dispatch. The Clockworks desugars `summon` orders at dispatch time:

```json
// What the operator writes:
{ "on": "mandate.ready", "summon": "artificer", "prompt": "...", "maxSessions": 5 }

// What the Clockworks dispatches:
{ "on": "mandate.ready", "run": "summon-relay", "role": "artificer", "prompt": "...", "maxSessions": 5 }
```

The `summon` value becomes the `role` param. All other keys pass through as relay params. This means anima dispatch is handled by a regular relay — replaceable, upgradeable, configurable — not baked into the framework.

The **summon relay** resolves the role to an active anima, binds or synthesizes a writ, manifests the anima, hydrates the prompt template, launches a session, and handles post-session writ lifecycle. See [Dispatch Integration](writs.md#dispatch-integration) for the full sequence.

**Summon relay params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `role` | string | *(required)* | Role to summon (set automatically from `summon` value) |
| `prompt` | string | — | Prompt template with `{{writ.title}}`, `{{writ.description}}`, etc. |
| `maxSessions` | number | 10 | Circuit breaker: max session attempts per writ before auto-fail |

**Circuit breaker:** By default, the summon relay will fail a writ after 10 session attempts. This prevents infinite re-dispatch loops when a writ keeps getting interrupted without making progress. Override per standing order with `"maxSessions": 20` or disable with `"maxSessions": 0`.

**Role resolution:** If no active anima fills the named role, the relay throws and the Clockworks signals `standing-order.failed`.

#### Relay params

Any key on a standing order that isn't `on` or `run` (or `summon`/`brief` for sugar forms) is extracted as a param and passed to the relay:

```typescript
export default relay({
  name: 'deploy',
  handler: async (event, { home, params }) => {
    const environment = (params.environment as string) ?? 'production';
    const dryRun = (params.dryRun as boolean) ?? false;
    // ...
  }
});
```

Params default to `{}` when no extra keys are present. Existing relays that destructure only `{ home }` from context are unaffected.

---

### The Clockworks Runner

A framework engine that processes the event queue. It reads unprocessed events from the Clockworks event queue, resolves which standing orders apply, and executes them in registration order.

#### Phase 1 — manual operation via `nsg clock`

Events are written to the Clockworks event queue immediately when signaled. Processing is explicitly operator-driven — not automatic. This allows the system to be monitored and stepped through until it has earned enough trust to run unattended.

| Command | Behavior |
|---|---|
| `nsg clock list` | Show all pending (unprocessed) events |
| `nsg clock tick [id]` | Process the next pending event, or the specific event with the given id |
| `nsg clock run` | Continuously process all pending events until the queue is empty |

No daemon required. The operator decides when and how much the Clockworks runs.

#### Phase 2 — daemon

A background daemon that polls the event queue and processes events automatically.

| Command | Behavior |
|---|---|
| `nsg clock start [--interval <ms>]` | Start the daemon as a detached background process (default interval: 2000ms) |
| `nsg clock stop` | Send SIGTERM and clean up the PID file |
| `nsg clock status` | Show whether the daemon is running, with PID, uptime, and log file path |

The daemon spawns as a detached child process. It writes a PID file at `<home>/.nexus/clock.pid` and logs to `<home>/.nexus/clock.log` (append mode). Only event-processing cycles are logged; idle polls are silent.

The daemon registers the session provider at startup, enabling the summon relay to dispatch anima sessions autonomously.

Phase 1 commands (`list`, `tick`, `run`) continue to work alongside the daemon. If the daemon is running, `tick` and `run` print a warning but still execute — SQLite handles concurrent access safely.

Core API: `clockStart(home, options?)`, `clockStop(home)`, `clockStatus(home)`. The `clock-status` MCP tool exposes daemon status to animas.

---

## Error Handling

Standing order failures signal a `standing-order.failed` event:

```typescript
{
  name: "standing-order.failed",
  payload: {
    standingOrder: { on: "commission.failed", summon: "steward" },
    triggeringEvent: { id: 42, name: "commission.failed", ... },
    error: "No active anima fills role 'steward'"
  }
}
```

Guilds can respond to this event with their own standing orders — summon an anima, invoke a notification relay, whatever the guild needs. The error handling policy is itself configurable.

**Loop guard**: `standing-order.failed` events are tagged. The Clockworks runner will not fire standing orders in response to a `standing-order.failed` event that was itself triggered by a `standing-order.failed` event. Errors handling errors do not cascade.

---

## The `signal` Tool

A base tool available to all animas. Used to signal custom guild events.

```typescript
tool({
  description: "Signal a custom guild event",
  params: {
    name: z.string().describe("Event name (must be declared in guild.json clockworks.events)"),
    payload: z.record(z.unknown()).optional().describe("Event payload")
  },
  handler: async ({ name, payload }, { home }) => {
    // validate name against guild.json clockworks.events
    // reject framework-reserved namespaces
    // persist to Clockworks events table
  }
})
```

Also exposed as `nsg signal <name> [--payload <json>]` for operator use.

Animas cannot signal framework events (`anima.*`, `commission.*`, `tool.*`, `session.*`, etc.) or writ lifecycle events (`mandate.ready`, `task.completed`, etc.). Only guild-declared custom events. This keeps the event record trustworthy — framework events come from authoritative code paths.

---

## guild.json Shape

```json
{
  "clockworks": {
    "events": {
      "code.reviewed": {
        "description": "Signaled when an anima completes a code review",
        "schema": { "pr": "number", "issues_found": "number" }
      }
    },
    "standingOrders": [
      { "on": "commission.sealed",     "run": "cleanup-worktree" },
      { "on": "commission.failed",     "run": "notify-patron" },
      { "on": "commission.failed",     "summon": "steward" },
      { "on": "code.reviewed",         "run": "post-review-summary" },
      { "on": "standing-order.failed", "summon": "steward" }
    ]
  }
}
```

---

## Clockworks Schema

```sql
-- Event log: immutable fact record
CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  payload    TEXT,                    -- JSON
  emitter    TEXT NOT NULL,           -- anima name, engine name, or 'framework'
  fired_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed  INTEGER NOT NULL DEFAULT 0   -- 0=pending, 1=processed
);

-- Execution log: what ran in response to each event
CREATE TABLE event_dispatches (
  id           INTEGER PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id),
  handler_type TEXT NOT NULL,          -- 'relay' or 'anima' (relays are stored as 'engine' in older schemas)
  handler_name TEXT NOT NULL,          -- relay name or resolved anima name
  target_role  TEXT,                   -- role name (anima orders only; handler_name is the resolved anima)
  notice_type  TEXT,                   -- 'summon' | null (historical; present on summon relay dispatches)
  started_at   DATETIME,
  ended_at     DATETIME,
  status       TEXT,                   -- 'success' | 'error'
  error        TEXT
);
```

---

## ClockworksKit

The Clockworks apparatus consumes relay contributions from installed plugins. It publishes a `ClockworksKit` interface that kit authors import for type safety:

```typescript
// Published by nexus-clockworks
interface ClockworksKit {
  relays?: RelayDefinition[]
}
```

A plugin contributing relays declares itself as satisfying `ClockworksKit` and names `nexus-clockworks` in its `recommends`:

```typescript
import type { ClockworksKit } from "nexus-clockworks"

export default {
  name: "nexus-signals",
  kit: {
    relays:     [memberJoinedRelay, memberLeftRelay],
    recommends: ["nexus-clockworks"],
  } satisfies ClockworksKit,
} satisfies Plugin
```

The Clockworks apparatus registers relays from both standalone kit packages and its own `supportKit` into a unified relay registry. Callers of the Clockworks API see a single relay list regardless of source.

### Relay Contract

The Clockworks needs a standard invocation contract to call relays generically. Relays export a default using the `relay()` SDK factory from `nexus-core`:

```typescript
import { relay } from '@shardworks/nexus-core';

export default relay({
  handler: async (event: GuildEvent | null, { home, params }) => {
    // event  — the triggering GuildEvent when invoked by a standing order (null for direct invocation)
    // home   — absolute path to the guild root
    // params — extra keys from the standing order (empty object when none)
  }
});
```

The Clockworks runner calls `module.default.handler(event, { home, params })`. Params are extracted from the standing order at dispatch time — any key that isn't `on` or `run` becomes a param. Relays can be named in `run:` standing orders; bespoke framework processes cannot.

---

## Relationship to Existing Concepts

**Relays** — a new artifact type, distinct from tools and existing framework machinery. Relays are purpose-built Clockworks handlers that export a standard `relay()` contract and can be named in `run:` standing orders. Framework processes (manifest, mcp-server, ledger-migrate) are unchanged.

**Tools** — `signal` is a new base tool. All other tools unchanged.

**The Books** — the Clockworks owns its event/dispatch tables as internal operational state, separate from the guild's Books (Register, Ledger, Daybook). Writs live in the Ledger — see the architecture overview.

**Bundles** — may ship default standing orders and custom event declarations, merged into `guild.json` on installation. Same delivery mechanism as other bundle-provided config.

---

## Deferred

- **Natural language trigger syntax** — `'when a commission is posted'` instead of `'commission.posted'`. Worth pursuing once real guilds have standing orders in production and vocabulary needs are understood. Requires validation tooling to be safe.
- **Pre-event hooks** — cancellable `before.*` events. Powerful but complex. Start with observation-only (post-facto) events.
- **Payload schema enforcement** — schema field in custom event declarations is documented but not validated. Enforcement deferred.
- **Phase 2 daemon enhancements** — external event injection (webhooks, file watchers), log rotation, concurrency.
- **Scheduled standing orders** — time-triggered rather than event-triggered. Deferred.

=== CONTEXT FILE: docs/architecture/apparatus ===
tree b98821d8f6e34359fa506196cb377f8dd47ca090:docs/architecture/apparatus

_template.md
animator.md
claude-code.md
clerk.md
dispatch.md
fabricator.md
instrumentarium.md
loom.md
parlour.md
review-loop.md
scriptorium.md
spider.md
stacks.md

=== CONTEXT FILE: docs/architecture/apparatus/parlour.md ===
# The Parlour — API Contract

Status: **Draft — MVP**

Package: `@shardworks/parlour` · Plugin id: `parlour`

> **⚠️ MVP scope.** This spec covers the core conversation lifecycle: creating conversations, registering participants, taking turns (with streaming), enforcing turn limits, and ending conversations. Inter-turn context assembly (`formatConveneMessage`) is included for convene conversations. There is no event signalling, no conversation-level cost budgets, and no pluggable turn-order strategies. See the Future sections for the target design.

---

## Purpose

The Parlour manages multi-turn conversations within the guild. It provides the structure for two kinds of interaction: **consult** (a human talks to an anima) and **convene** (multiple animas hold a structured dialogue). The Parlour tracks who is participating, whose turn it is, what has been said, and when the conversation ends.

The Parlour does not launch sessions itself — it delegates each turn to **The Animator**. The Parlour does not assemble prompts — it delegates that to **The Loom**. The Parlour orchestrates: it decides *when* and *for whom* to call the Animator, and assembles the inter-turn context that keeps each participant coherent across turns.

---

## Dependencies

```
requires: ['stacks', 'animator', 'loom']
```

- **The Stacks** — persists conversations (with nested participants) and turn records.
- **The Animator** — launches individual session turns (via `animate()` / `animateStreaming()`).
- **The Loom** — weaves the session context for each participant's turn.

---

## Support Kit

The Parlour contributes a `conversations` book and conversation management tools via its supportKit:

```typescript
supportKit: {
  books: {
    conversations: {
      indexes: ['status', 'kind', 'createdAt'],
    },
  },
  tools: [conversationList, conversationShow, conversationEnd],
},
```

### Document Shape

Participants are nested directly in the conversation document rather than stored in a separate book. This avoids N+1 queries on `list()` and `show()` operations — since Books has no join support, a separate participants book would require a per-conversation query to resolve participants. Conversations have a small, bounded number of participants (typically 2–5), so the nested document stays compact.

```typescript
interface ConversationDoc {
  id: string
  status: 'active' | 'concluded' | 'abandoned'
  kind: 'consult' | 'convene'
  topic: string | null
  turnLimit: number | null
  createdAt: string
  endedAt: string | null
  eventId: string | null
  participants: ParticipantRecord[]
}

interface ParticipantRecord {
  /** Stable participant id (generated at creation). */
  id: string
  kind: 'anima' | 'human'
  name: string
  /** Anima id, resolved at creation time. Null for human participants. */
  animaId: string | null
  /**
   * Provider session id for --resume. Updated after each turn so
   * the next turn can continue the provider's conversation context.
   */
  providerSessionId: string | null
}
```

The trade-off: updating a participant's `providerSessionId` after each turn requires a read-modify-write of the full conversation document. This is acceptable — the document is small and the write happens once per turn, not in a hot loop.

The one query this makes harder is "find all conversations involving anima X" — this requires a JSON path query on `participants[*].animaId` rather than a direct index lookup. This is a dashboard/analytics query, not an operational hot path, and The Stacks' JSON path queries handle it adequately.

### `conversation-list` tool

List conversations with optional filters. Returns conversation summaries ordered by `createdAt` descending (newest first).

| Parameter | Type | Description |
|---|---|---|
| `status` | `'active' \| 'concluded' \| 'abandoned'` | Filter by lifecycle status |
| `kind` | `'consult' \| 'convene'` | Filter by conversation kind |
| `limit` | `number` | Maximum results (default: 20) |

Returns: `ConversationSummary[]` — id, status, kind, topic, participants, turnCount, totalCostUsd.

### `conversation-show` tool

Show full detail for a conversation including all turns.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Conversation id |

Returns: `ConversationDetail` — full conversation record with participant list, per-turn session references, prompts, costs, and durations.

### `conversation-end` tool

End an active conversation.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Conversation id |
| `reason` | `'concluded' \| 'abandoned'` | Why the conversation ended (default: `'concluded'`) |

Idempotent — no error if the conversation is already ended.

---

## `ParlourApi` Interface (`provides`)

```typescript
interface ParlourApi {
  /**
   * Create a new conversation.
   *
   * Sets up conversation and participant records. Does NOT take a first
   * turn — that's a separate call to takeTurn().
   */
  create(request: CreateConversationRequest): Promise<CreateConversationResult>

  /**
   * Take a turn in a conversation.
   *
   * For anima participants: weaves context via The Loom, assembles the
   * inter-turn message, and calls The Animator to run a session. Returns
   * the session result. For human participants: records the message as
   * context for the next turn (no session launched).
   *
   * Throws if the conversation is not active or the turn limit is reached.
   */
  takeTurn(request: TakeTurnRequest): Promise<TurnResult>

  /**
   * Take a turn with streaming output.
   *
   * Same as takeTurn(), but yields ConversationChunks as the session
   * produces output. Includes a turn_complete chunk at the end.
   */
  takeTurnStreaming(request: TakeTurnRequest): {
    chunks: AsyncIterable<ConversationChunk>
    result: Promise<TurnResult>
  }

  /**
   * Get the next participant in a conversation.
   *
   * For convene: returns the next anima in round-robin order.
   * For consult: returns the anima participant (human turns are implicit).
   * Returns null if the conversation is not active or the turn limit is reached.
   */
  nextParticipant(conversationId: string): Promise<Participant | null>

  /**
   * End a conversation.
   *
   * Sets status to 'concluded' (normal end) or 'abandoned' (e.g. timeout,
   * disconnect). Idempotent — no error if already ended.
   */
  end(conversationId: string, reason?: 'concluded' | 'abandoned'): Promise<void>

  /**
   * List conversations with optional filters.
   */
  list(options?: ListConversationsOptions): Promise<ConversationSummary[]>

  /**
   * Show full detail for a conversation.
   */
  show(conversationId: string): Promise<ConversationDetail | null>
}
```

### Supporting Types

```typescript
interface CreateConversationRequest {
  /** Conversation kind. */
  kind: 'consult' | 'convene'
  /** Seed topic or prompt. Used as the initial message for the first turn. */
  topic?: string
  /** Maximum allowed turns. Null = unlimited. */
  turnLimit?: number
  /** Participants in the conversation. */
  participants: ParticipantDeclaration[]
  /** Triggering event id, for conversations started by clockworks. */
  eventId?: string
}

interface ParticipantDeclaration {
  kind: 'anima' | 'human'
  /** Display name. For anima participants, this is the anima name
   *  used to resolve identity via The Loom at turn time. */
  name: string
}

interface CreateConversationResult {
  conversationId: string
  participants: Participant[]
}

interface Participant {
  id: string
  name: string
  kind: 'anima' | 'human'
}

interface TakeTurnRequest {
  conversationId: string
  participantId: string
  /** The message for this turn. For consult: the human's message.
   *  For convene: typically assembled by the caller via formatMessage(),
   *  or omitted to let The Parlour assemble it automatically. */
  message?: string
}

interface TurnResult {
  /** The Animator's session result for this turn. Null for human turns. */
  sessionResult: SessionResult | null
  /** Turn number within the conversation (1-indexed). */
  turnNumber: number
  /** Whether the conversation is still active after this turn. */
  conversationActive: boolean
}

/** A chunk of output from a conversation turn. */
type ConversationChunk =
  | SessionChunk
  | { type: 'turn_complete'; turnNumber: number; costUsd?: number }

interface ConversationSummary {
  id: string
  status: 'active' | 'concluded' | 'abandoned'
  kind: 'consult' | 'convene'
  topic: string | null
  turnLimit: number | null
  createdAt: string
  endedAt: string | null
  participants: Participant[]
  /** Computed from session records. */
  turnCount: number
  /** Aggregate cost across all turns. */
  totalCostUsd: number
}

interface ConversationDetail extends ConversationSummary {
  turns: TurnSummary[]
}

interface TurnSummary {
  sessionId: string
  turnNumber: number
  participant: string
  prompt: string | null
  exitCode: number | null
  costUsd: number | null
  durationMs: number | null
  startedAt: string
  endedAt: string | null
}

interface ListConversationsOptions {
  status?: 'active' | 'concluded' | 'abandoned'
  kind?: 'consult' | 'convene'
  limit?: number
}
```

---

## Conversation Lifecycle

### Create

```
create(request)
  │
  ├─ 1. Generate conversation id
  ├─ 2. For each participant declaration:
  │     ├─ Generate participant id
  │     └─ Resolve animaId (for anima participants)
  ├─ 3. Write conversation document to The Stacks
  │     (status: 'active', participants nested inline)
  └─ 4. Return conversationId + participants
```

No session is launched at creation time. The first turn is a separate call.

### Take Turn (anima participant)

```
takeTurn(request)
  │
  ├─ 1. Read conversation state from The Stacks
  │     ├─ Verify status is 'active'
  │     └─ Verify turn limit not reached
  │
  ├─ 2. Determine turn number (count existing turns + 1)
  │
  ├─ 3. Assemble inter-turn message:
  │     ├─ First turn for this participant → use conversation topic
  │     └─ Subsequent turns → assemble messages from other participants
  │       since this participant's last turn (see § Inter-Turn Context)
  │
  ├─ 4. Weave context via The Loom (participant's anima name)
  │
  ├─ 5. Call The Animator:
  │     ├─ animate() or animateStreaming()
  │     ├─ conversationId for --resume
  │     └─ metadata: { trigger, conversationId, turnNumber, participantId }
  │
  ├─ 6. Update participant's providerSessionId in conversation doc
  │     (read-modify-write; enables --resume on next turn)
  │
  ├─ 7. If turn limit reached → auto-conclude conversation
  │
  └─ 8. Return TurnResult
```

### Take Turn (human participant)

Human turns do not launch sessions. The human's message is passed as context to the next anima turn via the inter-turn context assembly. The Parlour records that a human turn occurred (for turn counting and turn limit enforcement) but no Animator call is made.

### End

```
end(conversationId, reason)
  │
  ├─ 1. Read conversation from The Stacks
  ├─ 2. If already ended → no-op (idempotent)
  └─ 3. Update status to reason, set endedAt
```

---

## Inter-Turn Context

For convene conversations, each anima participant maintains their own session context via `--resume` (the provider's `conversationId`). Their session already contains their own prior messages and responses. When it's their turn again, The Parlour assembles only what happened *since their last turn* — the contributions of other participants.

```
Participant A's turn 3:
  - Read all turns since A's last turn (turn 1)
  - For each intervening turn (B's turn 2):
    - Read the session record artifact (if available)
    - Extract the assistant's text response from the transcript
  - Format as: "[B]: {response text}"
  - Pass as the message to A's session
```

On a participant's first turn, the conversation topic is used as the initial message.

For consult conversations, the pattern is simpler: the human's message is passed directly as the prompt to the anima's next turn.

**Dependency note:** Extracting responses from session transcripts requires access to session record artifacts (the JSON files written by The Animator). At MVP, this depends on The Animator writing artifacts to disk — see [Animator: Future: Session Record Artifacts](animator.md#future-session-record-artifacts). If artifacts are not available, the inter-turn message falls back to a placeholder (`[participant]: [response not available]`).

---

## Provider Session Continuity

Each anima participant in a conversation maintains session continuity across turns via the provider's `--resume` mechanism. The Parlour:

1. Passes `conversationId` to The Animator on each turn
2. Captures `providerSessionId` from the Animator's `SessionResult`
3. Stores it in the participant's `providerSessionId` field (in the conversation document)
4. Passes it back to The Animator on the participant's next turn

This allows the underlying AI process to maintain its full context window across turns without re-sending the entire conversation history.

### Workspace Persistence Constraint

The `--resume` mechanism depends on provider-specific session data stored on the local filesystem (e.g. Claude Code's `.claude/` directory). This creates a hard constraint: **all turns in a conversation must run in the same working directory**, or the session data needed for `--resume` will not be present.

This means:
- **Fresh temp worktrees per turn will not work.** The session data from turn 1 would be gone by turn 2.
- **A persistent workspace is required** — either the guildhall itself or a long-lived worktree that survives across turns.
- If a persistent workspace is not available, the fallback is to abandon `--resume` and re-send the full conversation context each turn. This works but costs more tokens and loses the provider's internal state (tool use history, reasoning context, etc.).

The Parlour must pass the same `cwd` to The Animator for every turn in a given conversation. The caller that creates the conversation is responsible for providing a workspace that will persist for the conversation's lifetime.

---

## Open Questions

- **Turn counting for human turns.** Do human turns count toward the turn limit? The legacy system counts only anima turns (sessions). For convene conversations this is clear (all turns are anima turns). For consult, should a turn limit of 10 mean 10 anima responses or 10 total exchanges (5 human + 5 anima)?
- **Conversation-level workspace.** Provider session continuity requires a persistent workspace across turns (see § Workspace Persistence Constraint). Should the `cwd` be set once at conversation creation and stored in the conversation document? Or is it the caller's responsibility to pass a consistent `cwd` on each `takeTurn()` call? Storing it on the conversation is safer (can't accidentally use different directories) but means the Parlour owns workspace lifecycle awareness.
- **Participant ordering.** The legacy uses insertion order for round-robin. Should The Parlour support explicit ordering or custom turn-order strategies?

---

## Future: Event Signalling

When Clockworks integration is available, The Parlour will signal conversation lifecycle events:

- **`conversation.started`** — fired after create(). Payload includes `conversationId`, `kind`, `topic`, participant names.
- **`conversation.turn-taken`** — fired after each turn. Payload includes `conversationId`, `turnNumber`, `participantName`, `sessionId`, `costUsd`.
- **`conversation.ended`** — fired after end() or auto-conclude. Payload includes `conversationId`, `reason`, `turnCount`, `totalCostUsd`.

These events enable clockworks standing orders to react to conversation activity (e.g. auto-summarize on conclusion, alert on high cost).

Blocked on: Clockworks apparatus spec finalization, Animator event signalling.

---

## Future: Conversation Cost Budgets

A `maxBudgetUsd` field on `CreateConversationRequest` that caps aggregate cost across all turns. The Parlour checks cumulative cost before each turn and auto-concludes if the budget would be exceeded.

---

## Future: Pluggable Turn-Order Strategies

The MVP uses round-robin for convene and simple alternation for consult. Future strategies might include:

- **Priority-based** — participants with higher priority speak more frequently
- **Facilitator-directed** — a designated facilitator anima decides who speaks next
- **Reactive** — participants speak when they have something to say (event-driven rather than scheduled)

This would require a `TurnOrderStrategy` interface and a configuration field on `CreateConversationRequest`.

---

## Implementation Notes

- **Cross-book queries.** The Parlour reads from both its own `conversations` book and The Animator's `sessions` book (for turn counts, cost aggregation, transcript extraction). This cross-apparatus read is via The Stacks' query API — no direct DB access.
- **Single-document access pattern.** With participants nested in the conversation document, most operations are single-document reads or read-modify-writes. The `takeTurn()` hot path reads one conversation doc, calls The Animator, then writes back the updated `providerSessionId`. No multi-book coordination needed.
- **No in-memory state.** All conversation state is persisted in The Stacks. The Parlour reads state fresh on each `takeTurn()` call. This makes it safe for concurrent callers and process restarts between turns.
- **Legacy migration.** The legacy `nexus-sessions` package combines session and conversation management in a single rig with separate `conversations` and `participants` books. The new architecture splits sessions (Animator) from conversations (Parlour) and nests participants inline. The Parlour's `conversations` book supersedes both legacy books.

=== CONTEXT FILE: docs/architecture/apparatus/claude-code.md ===
# Claude Code Session Provider — API Contract

Status: **Draft — MVP**

Package: `@shardworks/claude-code-apparatus` · Plugin id: `claude-code`

> **⚠️ MVP scope.** This spec covers the session provider implementation: launching Claude Code CLI processes in autonomous mode, parsing stream-json telemetry, and reporting structured results back to The Animator. The MCP tool server module exists but is not yet wired into the session lifecycle — see [Future: Tool-Equipped Sessions](#future-tool-equipped-sessions).

---

## Purpose

The Claude Code apparatus is a **session provider** — a pluggable backend that The Animator delegates to for launching and communicating with a specific AI system. It implements `AnimatorSessionProvider` from `@shardworks/animator-apparatus` and is discovered via guild config:

```json
{
  "animator": {
    "sessionProvider": "claude-code"
  }
}
```

The apparatus handles the mechanics of the Claude Code CLI: process spawning, argument assembly, system prompt file management, stream-json NDJSON parsing, and telemetry extraction (cost, token usage, session id). It does not handle session lifecycle, recording, or identity composition — those belong to The Animator and The Loom respectively.

The provider also injects environment variables from `SessionProviderConfig.environment` into the spawned process. This is how anima git identity (set by The Loom and optionally overridden per-task by the orchestrator) reaches the `claude` child process. The provider does not interpret these variables — it spreads them into the spawn environment alongside `process.env`.

The package also contains the **MCP tool server** — a module that creates an MCP server from resolved tool definitions, serving guild tools to Claude during sessions. This module is not yet integrated into the session lifecycle but is the designated home for MCP server functionality.

---

## Dependencies

```
requires: []
```

The Claude Code apparatus has no apparatus dependencies. It implements `AnimatorSessionProvider` (imported as a type from `@shardworks/animator-apparatus`) but does not call The Animator at runtime — the relationship is reversed: The Animator calls the provider.

The MCP server module imports types from `@shardworks/tools-apparatus` (`ToolDefinition`, `isToolDefinition`) and uses `@modelcontextprotocol/sdk` for the MCP protocol implementation. These are compile-time dependencies, not runtime apparatus dependencies.

---

## `AnimatorSessionProvider` Implementation (`provides`)

The apparatus provides a stateless implementation of `AnimatorSessionProvider`:

```typescript
interface AnimatorSessionProvider {
  name: string;
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>;
    result: Promise<SessionProviderResult>;
  };
}
```

A single `launch()` method handles both streaming and non-streaming sessions. When `config.streaming` is true, the provider spawns Claude and yields `SessionChunk` objects as they arrive via an async iterable. When false, it accumulates all output internally and returns empty chunks. The return shape is always `{ chunks, result }` — the Animator does not branch on streaming capability.

Internally, the provider delegates to one of two spawn helpers based on the streaming flag:
- **`spawnClaudeStreamJson()`** — accumulates all stream-json output, resolves when the process exits. Used for non-streaming sessions.
- **`spawnClaudeStreamingJson()`** — yields chunks in real time via an async iterable while accumulating the full result. Used for streaming sessions.

The apparatus has no startup logic — `start()` is a no-op. The provider is stateless and safe for concurrent use.

---

## Session Preparation

Both launch methods share a `prepareSession()` step that writes temporary files and assembles CLI arguments:

```
prepareSession(config)
  │
  ├─ 1. Create temp directory (nsg-session-XXXXX)
  ├─ 2. Build base args:
  │     --setting-sources user
  │     --dangerously-skip-permissions
  │     --model <config.model>
  ├─ 3. If systemPrompt provided:
  │     Write to temp/system-prompt.md
  │     --system-prompt-file <path>
  ├─ 4. If conversationId provided:
  │     --resume <conversationId>
  └─ 5. Return { tmpDir, args }
```

The caller adds the final arguments (`--print`, `--output-format stream-json`, `--verbose`) and the initial prompt, then spawns the `claude` process. The temp directory is cleaned up in a `finally` block after the process exits.

### CLI Flags

| Flag | Purpose |
|------|---------|
| `--setting-sources user` | Use only user-level settings, not project-level |
| `--dangerously-skip-permissions` | Bypass interactive permission prompts (autonomous mode) |
| `--model` | Model selection from guild settings |
| `--print` | Autonomous mode — no interactive input, prompt via argument |
| `--output-format stream-json` | Structured NDJSON output on stdout |
| `--verbose` | Include detailed telemetry in stream-json output |
| `--system-prompt-file` | System prompt from file (composed by The Loom) |
| `--resume` | Resume an existing conversation by provider session id |

### Bare Mode (Future)

When sessions are fully composed by The Loom (system prompt, tools, CLAUDE.md), the provider should use `--bare` mode:

```
--bare    Skip hooks, LSP, plugin sync, attribution, auto-memory, background
          prefetches, keychain reads, and CLAUDE.md auto-discovery.
          Context is explicitly provided via:
          --system-prompt[-file], --mcp-config, --settings, --add-dir, etc.
```

This ensures the session context is entirely what The Loom wove — no ambient CLAUDE.md or project settings leak in. Not yet implemented; current sessions may pick up ambient project configuration.

---

## Stream-JSON Parsing

The `claude` CLI with `--output-format stream-json` emits NDJSON (newline-delimited JSON) on stdout. Each line is a message with a `type` field:

| Message type | Content | Extracted data |
|-------------|---------|----------------|
| `assistant` | Model response with content blocks | Transcript entry; text chunks → stderr + `SessionChunk` |
| `user` | User messages including tool results | Transcript entry; tool_result chunks → `SessionChunk` |
| `result` | Final summary after session completes | `costUsd`, `tokenUsage`, `providerSessionId` |

### Content Block Types (within `assistant` messages)

| Block type | Action |
|-----------|--------|
| `text` | Written to stderr (real-time visibility); emitted as `{ type: 'text', text }` chunk |
| `tool_use` | Emitted as `{ type: 'tool_use', tool: name }` chunk |

### Parsing Architecture

Two internal functions handle the parsing pipeline:

- **`processNdjsonBuffer(buffer, handler)`** — splits an incoming buffer on newlines, parses each complete JSON line, and calls the handler. Returns the remaining incomplete buffer. Gracefully skips non-JSON lines.

- **`parseStreamJsonMessage(msg, accumulator)`** — processes a single parsed message, accumulating transcript entries and telemetry into the accumulator object, and returning any `SessionChunk` objects for streaming consumers.

The stderr write of assistant text content is a deliberate side effect — it provides real-time session output visibility in the terminal. See [The Animator § CLI streaming behavior](./animator.md#cli-streaming-behavior) for the rationale.

---

## MCP Tool Server

The package contains a module (`mcp-server.ts`) that creates an MCP server from `ToolDefinition` objects, and an HTTP server helper (`startMcpHttpServer()`) that serves it over Streamable HTTP on an ephemeral localhost port. Each anima session gets its own MCP server instance serving that session's permission-gated tool set.

### `createMcpServer(tools)`

```typescript
async function createMcpServer(tools: ToolDefinition[]): Promise<McpServer>
```

Creates an MCP server instance with the given tools registered. Each tool is registered with the MCP SDK using:
- Tool name and description from the definition
- Zod param schema (the SDK handles JSON Schema conversion)
- Handler wrapped with Zod validation and error formatting

Tools with `callableBy` set that does not include `'anima'` are filtered out. Tools without `callableBy` are included (available to all callers by default).

### `startMcpHttpServer(tools)`

```typescript
async function startMcpHttpServer(tools: ToolDefinition[]): Promise<McpHttpHandle>

interface McpHttpHandle {
  /** URL for --mcp-config (e.g. "http://localhost:PORT/mcp") */
  url: string;
  /** Shut down the HTTP server and MCP transport. */
  close(): Promise<void>;
}
```

Starts an in-process HTTP server serving the MCP tool set via the Streamable HTTP transport. The server:

1. Calls `createMcpServer(tools)` to build the MCP server instance
2. Creates a `StreamableHTTPServerTransport` in stateless mode (one session per server — no session tracking needed)
3. Connects the MCP server to the transport
4. Starts a Node.js `http.createServer()` listening on `127.0.0.1` with port `0` (OS-assigned ephemeral port)
5. Routes all requests to the transport's `handleRequest()`
6. Returns a handle with the URL and a `close()` function

The HTTP server binds to localhost only — it is not network-accessible. The ephemeral port avoids conflicts when multiple sessions run concurrently.

### Transport Choice: HTTP vs Stdio

The MCP SDK supports multiple transports. We chose in-process HTTP over the more common stdio child-process approach:

| Concern | Stdio (child process) | HTTP (in-process) |
|---------|----------------------|-------------------|
| Guild instances | Two (SQLite contention risk) | One (shared) |
| Tool resolution | Must re-resolve in child | Already resolved by Loom |
| Boot latency | Guild boot per session | ~0 (just start HTTP listener) |
| Lifecycle | Claude manages | Provider manages |
| Entry point | Needs runnable script file | No extra file |
| Permissions | Must serialize & re-resolve | Not needed — tools in memory |

The in-process approach eliminates the need for a separate MCP server process entry point, avoids duplicate guild boot, and removes the SQLite concurrent-writer concern entirely. Tool definitions (including Zod schemas and handler functions) are passed directly — no serialization boundary.

### MCP Config Format

The provider writes a temporary `--mcp-config` JSON file:

```json
{
  "mcpServers": {
    "nexus-guild": {
      "type": "http",
      "url": "http://127.0.0.1:PORT/mcp"
    }
  }
}
```

Claude connects to the HTTP server as an MCP client using the Streamable HTTP transport. From Claude's perspective, this is no different from any remote MCP server.

### Server Lifecycle

The provider owns the MCP server lifecycle — it starts the server before launching the Claude session and stops it after the session exits:

```
prepareSession(config)
  │
  ├─ ... existing steps (temp dir, args, system prompt, resume) ...
  │
  └─ If config.tools has entries:
      ├─ startMcpHttpServer(tools) → { url, close }
      ├─ Write --mcp-config JSON to temp dir (pointing at url)
      ├─ Add --mcp-config <path> to args
      ├─ Add --strict-mcp-config to args
      └─ Return close() in PreparedSession for cleanup
```

Cleanup happens in the same `finally` block that removes the temp directory:

```
launch(config)
  ├─ prepareSession() → { tmpDir, args, mcpClose? }
  ├─ spawn claude process
  └─ on exit:
      ├─ mcpClose?.() — shut down HTTP server + transport
      └─ rmSync(tmpDir) — remove temp files
```

The `close()` function:
1. Closes the `StreamableHTTPServerTransport` (terminates any active SSE connections)
2. Closes the `http.Server` (stops accepting new connections)

If the Claude process crashes or is killed, the cleanup still runs — the `close` handler on the child process fires regardless of exit reason.

### Concurrency

Each session gets its own MCP server on its own ephemeral port. Multiple concurrent sessions each have independent HTTP servers, all sharing the same in-process guild instance. This is safe because:
- Tool handlers access guild infrastructure via `guild()`, which is process-global
- Read operations (stacks queries, config reads) are naturally concurrent
- Write operations (stacks puts) go through SQLite, which handles concurrency in WAL mode

---

## Configuration

The Claude Code apparatus reads no direct configuration from `guild.json`. It is selected as a session provider via The Animator's config:

```json
{
  "animator": {
    "sessionProvider": "claude-code"
  }
}
```

The `claude-code` value is the default when `sessionProvider` is not specified. The model comes from `guild.json["settings"]["model"]`, resolved by The Animator before being passed in `SessionProviderConfig`.

---

## Open Questions

- **`--bare` mode.** When should the provider switch from the current `--setting-sources user` to full `--bare` mode? Likely when The Loom produces real system prompts and MCP config is attached. Need to verify that `--bare` + `--mcp-config` + `--system-prompt-file` gives us full control with no ambient leakage.

---

## Future: Server Reuse

Currently each session gets its own MCP HTTP server, even when consecutive sessions have identical tool sets (same role, same permissions). A future optimization could pool and reuse MCP servers:

- **Key by tool set** — hash the sorted list of tool names to produce a cache key
- **Reference counting** — track active sessions per server; close when count drops to zero
- **Idle timeout** — close unused servers after a configurable idle period
- **Stale detection** — invalidate the cache when tool registrations change (plugin reload, guild restart)

This would eliminate per-session HTTP server startup for batch operations (e.g., dispatching multiple artificer sessions). The savings are modest — HTTP server start is fast — but it reduces port churn and simplifies cleanup in high-throughput scenarios.

Not implemented; revisit if session launch latency becomes a concern.

=== CONTEXT FILE: docs/architecture/apparatus/stacks.md ===
# The Stacks — API Contract

Status: **Draft — under review**

Package: `@shardworks/stacks` · Plugin id: `stacks`

---

## Purpose

The Stacks is the guild's persistence layer — a JSON document store backed by SQLite, with change data capture (CDC) as its primary integration mechanism. Every piece of guild state that needs to survive process restarts lives here: writs, sessions, anima records, event logs.

The Stacks owns the write path exclusively. There is no raw SQL escape hatch, no bypass. This is what makes CDC reliable — if the API is the only write path, the event stream is complete. The Stacks does not know what the documents mean; it stores them, indexes them, watches them, and stays out of the way.

---

## Dependencies

```
requires: []
consumes: ['books']    — scans kit contributions for book declarations
```

The Stacks has no apparatus dependencies — it is the foundation layer that everything else builds on.

---

## Kit Interface

When The Stacks is installed, kits gain the ability to declare a `books` field — a record of named book declarations with index schemas. The Stacks reads these at startup and creates or reconciles the backing tables. Schema changes are additive only — new books and new indexes are always safe; nothing is ever dropped automatically.

```typescript
// Example: a kit declaring two books
export default {
  kit: {
    requires: ['stacks'],
    books: {
      writs:    { indexes: ['status', 'createdAt', 'parent.id', ['status', 'createdAt']] },
      sessions: { indexes: ['writId', 'startedAt', 'animaId'] },
    },
  },
} satisfies Plugin
```

```typescript
interface BookSchema {
  /**
   * Fields or field tuples to index for efficient querying.
   * - A `string` creates a single-field index (e.g. `'status'`)
   * - A `string[]` creates a compound index (e.g. `['status', 'createdAt']`)
   *
   * Dot-notation for nested fields ('parent.id') is supported.
   */
  indexes?: (string | string[])[]
}
```

> **Index policy:** Only declared indexes are guaranteed to be efficient. Querying on a non-indexed field works but may scan the full table.

---

## `StacksApi` Interface (`provides`)

```typescript
interface StacksApi {
  /**
   * Get a writable Book handle for the given owner and book name.
   *
   * `ownerId` is the plugin id of the declaring kit — this is the write
   * boundary. Trust-based: not validated at runtime against the caller's
   * identity. `readBook()` enforces the boundary at the type level.
   */
  book<T extends BookEntry>(ownerId: string, name: string): Book<T>

  /**
   * Get a read-only Book handle scoped to another plugin's book.
   * Exposes `get`, `find`, `list`, and `count` only.
   */
  readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>

  /**
   * Register a CDC handler for a book.
   *
   * Must be called during startup before any writes occur.
   * The `failOnError` option controls execution phase — see
   * "Change Data Capture" below.
   */
  watch<T extends BookEntry>(
    ownerId: string,
    bookName: string,
    handler: ChangeHandler<T>,
    options?: WatchOptions,
  ): void

  /**
   * Execute a function within an atomic transaction.
   *
   * All writes inside `fn` commit or roll back together. Reads see
   * uncommitted writes (read-your-writes). CDC events are buffered
   * and fired (coalesced per-document) after commit.
   */
  transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>
}

interface TransactionContext {
  book<T extends BookEntry>(ownerId: string, name: string): Book<T>
  readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>
}
```

---

## Configuration

```json
{
  "stacks": {
    "autoMigrate": true,
    "maxCascadeDepth": 16
  }
}
```

- **`autoMigrate`** — whether to apply database migrations automatically on startup.
- **`maxCascadeDepth`** — maximum CDC cascade depth before the transaction is aborted (default: 16).

---

## Document Model

A **book** is a named collection of documents. Every document must include an `id: string` field. The framework puts nothing else in the envelope — no `_rev`, no `_createdAt`, no `_type`. Domain types own their own fields.

```typescript
type BookEntry = { id: string } & Record<string, unknown>
```

IDs are author-generated. Plugins own ID generation (ULIDs recommended). The Stacks has no opinion on format beyond requiring a non-empty string. Documents are stored as plain JSON objects; nested objects are fully supported. Field names in query predicates use dot-notation for nested access (`'parent.id'`).

---

## Read and Write API

```typescript
interface Book<T extends BookEntry> extends ReadOnlyBook<T> {
  /** Upsert a document. Fires a `create` or `update` CDC event. */
  put(entry: T): Promise<void>

  /**
   * Partially update a document (top-level field merge).
   * Throws if the document does not exist. Returns the full document after merge.
   * Fires an `update` CDC event with the pre-patch document as `prev`.
   */
  patch(id: string, fields: Partial<Omit<T, 'id'>>): Promise<T>

  /** Delete by id. Silent no-op if the document does not exist. */
  delete(id: string): Promise<void>
}

interface ReadOnlyBook<T extends BookEntry> {
  get(id: string): Promise<T | null>
  find(query: BookQuery<T>): Promise<T[]>
  list(options?: ListOptions): Promise<T[]>
  count(where?: WhereClause<T> | { or: WhereClause<T>[] }): Promise<number>
}
```

---

## Query Language

Where conditions are expressed as tuples — `[field, operator, value?]`. All conditions within a single `WhereClause` are AND-ed.

```typescript
type WhereCondition<T> =
  | [string, '=' | '!=', Scalar]
  | [string, '>' | '>=' | '<' | '<=', number | string]
  | [string, 'LIKE', string]       // % and _ wildcards
  | [string, 'IN', Scalar[]]
  | [string, 'IS NULL' | 'IS NOT NULL']

type Scalar = string | number | boolean | null
type WhereClause<T> = WhereCondition<T>[]
```

**OR support:** The `where` field accepts `{ or: WhereClause<T>[] }` — each element is an AND-clause; results are unioned and deduplicated by `id`.

**Sorting:** Multi-field ordering via `orderBy: [field, 'asc' | 'desc']` or an array of such tuples.

**Pagination:** `{ limit: number; offset?: number }`. Offset requires limit.

```typescript
type BookQuery<T extends BookEntry> = {
  where?:   WhereClause<T> | { or: WhereClause<T>[] }
  orderBy?: OrderBy
} & Pagination
```

---

## Change Data Capture

All writes go through the Stacks API — this is the guarantee that makes CDC complete. CDC handlers fire on every write to a watched book.

### Event shapes

```typescript
type ChangeEvent<T extends BookEntry> =
  | CreateEvent<T>
  | UpdateEvent<T>
  | DeleteEvent<T>

interface CreateEvent<T> {
  type: 'create'; ownerId: string; book: string; entry: T
}
interface UpdateEvent<T> {
  type: 'update'; ownerId: string; book: string; entry: T; prev: T
}
interface DeleteEvent<T> {
  type: 'delete'; ownerId: string; book: string; id: string; prev: T
}
```

`prev` is always populated for `update` and `delete` events. The pre-read cost is only paid when handlers are registered for the book.

### Two-phase execution

```typescript
type ChangeHandler<T extends BookEntry> = (event: ChangeEvent<T>) => Promise<void> | void

interface WatchOptions {
  /**
   * true  (default) — Phase 1: runs INSIDE the transaction. Handler writes
   *   join the same atomic unit. If the handler throws, everything rolls back.
   * false — Phase 2: runs AFTER commit. Data is persisted. Handler failures
   *   are logged as warnings.
   */
  failOnError?: boolean
}
```

**Phase 1 — Cascade** (`failOnError: true`, the default). Runs inside the transaction, before commit. The handler's writes join the same atomic unit. If the handler throws, everything rolls back — the triggering write, the handler's writes, and all nested cascades. This is the correct phase for referential integrity (e.g. cancelling child writs when a parent is cancelled).

**Phase 2 — Notification** (`failOnError: false`). Runs after the transaction commits. Data is already persisted. This is the correct phase for Clockworks event emission, telemetry, and audit logging. If your Phase 1 handler produces effects outside the Stacks, it probably belongs in Phase 2 — transaction rollback cannot undo non-database side effects.

### Transaction binding

Handlers access the Stacks through the normal `guild().apparatus<StacksApi>('stacks')` path. Transaction binding is transparent via `AsyncLocalStorage` — Phase 1 handlers automatically route their book operations through the active transaction. No special API, no transaction-aware handles. The transaction context is ambient.

**All book operations inside a Phase 1 handler must be `await`-ed.** A non-awaited write inherits the transaction context but may execute after commit or rollback, producing undefined behavior.

### Cascade depth limiting

A depth counter prevents infinite recursion from accidental handler cycles. Default limit is 16, configurable via `"stacks": { "maxCascadeDepth": 32 }` in `guild.json`. Exceeding the limit throws and rolls back the entire transaction.

### CDC event coalescing

Within a transaction, multiple writes to the same document produce a single CDC event reflecting the net change:

| Mutations | Coalesced event |
|---|---|
| create | `create` (final state) |
| create → update(s) | `create` (final state) |
| create → delete | *(no event)* |
| update(s) | `update` (pre-transaction → final) |
| update → delete | `delete` (pre-transaction state) |
| delete | `delete` (pre-transaction state) |

Phase 2 handlers see exactly one event per document. They never see intermediate states.

---

## Transaction Model

Every write participates in a transaction. There are two ways they're created:

**Implicit.** Every `put()`, `patch()`, or `delete()` outside a transaction opens one implicitly. It spans the write plus all Phase 1 handlers (and their cascades). Commits after all Phase 1 handlers succeed; rolls back if any throw.

**Explicit.** `stacks.transaction()` groups multiple writes into a single atomic unit. Phase 1 handlers within an explicit transaction join the same transaction. Commit is deferred until the callback completes.

Reads within a transaction see uncommitted writes from the same transaction (read-your-writes).

---

## Backend Interface

The Stacks depends on a `StacksBackend` interface, not SQLite directly. The default implementation uses SQLite via `better-sqlite3`; alternative backends implement the same interface. No SQLite types leak into the public API.

```typescript
interface StacksBackend {
  open(options: BackendOptions): Promise<void>
  close(): Promise<void>
  ensureBook(ref: BookRef, schema: BookSchema): Promise<void>
  beginTransaction(): Promise<BackendTransaction>
}

interface BackendTransaction {
  put(ref: BookRef, entry: BookEntry, opts?: { withPrev: boolean }): Promise<PutResult>
  patch(ref: BookRef, id: string, fields: Record<string, unknown>): Promise<PatchResult>
  delete(ref: BookRef, id: string, opts?: { withPrev: boolean }): Promise<DeleteResult>
  get(ref: BookRef, id: string): Promise<BookEntry | null>
  find(ref: BookRef, query: InternalQuery): Promise<BookEntry[]>
  count(ref: BookRef, where?: InternalCondition[]): Promise<number>
  commit(): Promise<void>
  rollback(): Promise<void>
}
```

For v1, the backend is an internal implementation detail — not a public extension point. To use a different persistence backend, install a different apparatus that provides `StacksApi`. The in-memory backend for tests ships inside `@shardworks/stacks` as a test utility export.

---

## Implementation Notes

- **Migration from existing code.** The existing `arbor/src/db/` (`BookStore`, `sqlite-adapter`, `reconcile-books`) moves into `@shardworks/stacks` as the SQLite backend. `Arbor.getDatabase()` (already `@deprecated`) is removed when The Stacks ships. The `core/src/book.ts` types are superseded by this spec's types. Direct database access in `nexus-clockworks` and `nexus-sessions` is replaced with `guild().apparatus<StacksApi>('stacks')` calls.
- **Plugin id ownership.** Each plugin hardcodes its own id as a constant (e.g. `const PLUGIN_ID = 'nexus-ledger'`). The framework does not inject it.

See [the full Stacks specification](../../../packages/stacks/docs/stacks.md) for complete type signatures, use case coverage matrix, resolved design questions, and the detailed cascade walkthrough.

=== CONTEXT FILE: packages/plugins/animator/src/animator.test.ts ===
/**
 * Animator tests.
 *
 * Uses a fake session provider apparatus and in-memory Stacks backend to
 * test the full animate() lifecycle without spawning real processes.
 *
 * The fake provider is registered as an apparatus in the guild mock,
 * matching how real providers work (the Animator discovers them via
 * guild().apparatus(config.sessionProvider)).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild } from '@shardworks/nexus-core';
import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
import type { StacksApi } from '@shardworks/stacks-apparatus';

import { createLoom } from '@shardworks/loom-apparatus';
import type { LoomApi } from '@shardworks/loom-apparatus';

import { createAnimator } from './animator.ts';
import type {
  AnimatorApi,
  AnimatorSessionProvider,
  SessionProviderConfig,
  SessionProviderResult,
  SessionChunk,
  SessionDoc,
  TranscriptDoc,
} from './types.ts';

// ── Shared empty chunks iterable ─────────────────────────────────────

const emptyChunks: AsyncIterable<SessionChunk> = {
  [Symbol.asyncIterator]() {
    return {
      async next() {
        return { value: undefined as unknown as SessionChunk, done: true as const };
      },
    };
  },
};

// ── Fake providers ───────────────────────────────────────────────────

function createFakeProvider(
  overrides: Partial<SessionProviderResult> = {},
): AnimatorSessionProvider {
  return {
    name: 'fake',
    launch(_config: SessionProviderConfig) {
      return {
        chunks: emptyChunks,
        result: Promise.resolve({
          status: 'completed' as const,
          exitCode: 0,
          providerSessionId: 'fake-sess-123',
          tokenUsage: {
            inputTokens: 1000,
            outputTokens: 500,
          },
          costUsd: 0.05,
          ...overrides,
        }),
      };
    },
  };
}

function createStreamingFakeProvider(
  streamChunks: SessionChunk[],
  overrides: Partial<SessionProviderResult> = {},
): AnimatorSessionProvider {
  return {
    name: 'fake-streaming',
    launch(config: SessionProviderConfig) {
      if (config.streaming) {
        let idx = 0;
        const asyncChunks: AsyncIterable<SessionChunk> = {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                if (idx < streamChunks.length) {
                  return { value: streamChunks[idx++]!, done: false as const };
                }
                return { value: undefined as unknown as SessionChunk, done: true as const };
              },
            };
          },
        };

        return {
          chunks: asyncChunks,
          result: Promise.resolve({
            status: 'completed' as const,
            exitCode: 0,
            providerSessionId: 'fake-stream-sess',
            ...overrides,
          }),
        };
      }

      // Non-streaming: return empty chunks
      return {
        chunks: emptyChunks,
        result: Promise.resolve({
          status: 'completed' as const,
          exitCode: 0,
          providerSessionId: 'fake-stream-sess',
          ...overrides,
        }),
      };
    },
  };
}

function createThrowingProvider(error: Error): AnimatorSessionProvider {
  return {
    name: 'fake-throwing',
    launch() {
      return {
        chunks: emptyChunks,
        result: Promise.reject(error),
      };
    },
  };
}

// ── Spy provider (captures the config passed to launch) ──────────────

function createSpyProvider(): {
  provider: AnimatorSessionProvider;
  getCapturedConfig: () => SessionProviderConfig | null;
} {
  let capturedConfig: SessionProviderConfig | null = null;

  return {
    provider: {
      name: 'fake-spy',
      launch(config: SessionProviderConfig) {
        capturedConfig = config;
        return {
          chunks: emptyChunks,
          result: Promise.resolve({ status: 'completed' as const, exitCode: 0 }),
        };
      },
    },
    getCapturedConfig: () => capturedConfig,
  };
}

// ── Test harness ─────────────────────────────────────────────────────

let stacks: StacksApi;
let animator: AnimatorApi;
let memBackendRef: InstanceType<typeof MemoryBackend>;

/**
 * Set up the test environment with a guild mock, in-memory Stacks,
 * and the Animator apparatus. The provider is registered as an apparatus
 * that the Animator discovers via guild().apparatus('fake-provider').
 *
 * @param opts.installLoom — if true, installs The Loom apparatus (needed for summon() tests)
 */
function setup(
  provider: AnimatorSessionProvider = createFakeProvider(),
  sessionProviderPluginId = 'fake-provider',
  opts: { installLoom?: boolean } = {},
) {
  memBackendRef = new MemoryBackend();
  const memBackend = memBackendRef;
  const stacksPlugin = createStacksApparatus(memBackend);
  const animatorPlugin = createAnimator();

  // Apparatus registry for the guild mock
  const apparatusMap = new Map<string, unknown>();

  // Register the provider as an apparatus (same as a real guild would)
  apparatusMap.set(sessionProviderPluginId, provider);

  const fakeGuild: Guild = {
    home: '/tmp/fake-guild',
    apparatus<T>(name: string): T {
      const api = apparatusMap.get(name);
      if (!api) throw new Error(`Apparatus "${name}" not installed`);
      return api as T;
    },
    config<T>(pluginId: string): T {
      if (pluginId === 'animator') {
        return { sessionProvider: sessionProviderPluginId } as T;
      }
      return {} as T;
    },
    writeConfig() { /* noop in test */ },
    guildConfig() {
      return {
        name: 'test-guild',
        nexus: '0.0.0',
        workshops: {},
        roles: {},
        baseTools: [],
        plugins: [],
        settings: { model: 'sonnet' },
        animator: { sessionProvider: sessionProviderPluginId },
      };
    },
    kits: () => [],
    apparatuses: () => [],
  };

  // Must set guild before starting apparatus that call guild() in start()
  setGuild(fakeGuild);

  // Optionally install The Loom (needed for summon() tests)
  if (opts.installLoom) {
    const loomPlugin = createLoom();
    const loomApparatus = (loomPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
    loomApparatus.start({ on: () => {} });
    apparatusMap.set('loom', loomApparatus.provides);
  }

  // Start stacks
  const stacksApparatus = (stacksPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  stacksApparatus.start({ on: () => {} });
  stacks = stacksApparatus.provides as StacksApi;
  apparatusMap.set('stacks', stacks);

  // Ensure the animator's books are created
  memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
    indexes: ['startedAt', 'status', 'conversationId', 'provider'],
  });
  memBackend.ensureBook({ ownerId: 'animator', book: 'transcripts' }, {
    indexes: ['sessionId'],
  });

  // Start animator
  const animatorApparatus = (animatorPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  animatorApparatus.start({ on: () => {} });
  animator = animatorApparatus.provides as AnimatorApi;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Animator', () => {
  afterEach(() => {
    clearGuild();
  });

  describe('animate()', () => {
    beforeEach(() => {
      setup();
    });

    it('returns an AnimateHandle with chunks and result', () => {
      const handle = animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      });

      assert.ok(handle.chunks, 'should have chunks');
      assert.ok(handle.result instanceof Promise, 'result should be a Promise');
    });

    it('completes a session and records to Stacks', async () => {
      const result = await animator.animate({
        context: { systemPrompt: 'You are a test agent.' },
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.status, 'completed');
      assert.equal(result.exitCode, 0);
      assert.equal(result.provider, 'fake');
      assert.ok(result.id.startsWith('ses-'));
      assert.ok(result.startedAt);
      assert.ok(result.endedAt);
      assert.equal(typeof result.durationMs, 'number');
      assert.equal(result.providerSessionId, 'fake-sess-123');
      assert.deepEqual(result.tokenUsage, { inputTokens: 1000, outputTokens: 500 });
      assert.equal(result.costUsd, 0.05);

      // Verify recorded in Stacks
      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(result.id);
      assert.ok(doc);
      assert.equal(doc.status, 'completed');
      assert.equal(doc.provider, 'fake');
      assert.equal(doc.exitCode, 0);
    });

    it('records metadata as-is', async () => {
      const metadata = {
        trigger: 'summon',
        animaName: 'scribe',
        writId: 'wrt-abc123',
      };

      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
        metadata,
      }).result;

      assert.deepEqual(result.metadata, metadata);

      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(result.id);
      assert.deepEqual(doc?.metadata, metadata);
    });

    it('passes conversationId through', async () => {
      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
        conversationId: 'conv-xyz',
      }).result;

      assert.equal(result.conversationId, 'conv-xyz');

      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(result.id);
      assert.equal(doc?.conversationId, 'conv-xyz');
    });

    it('passes prompt and systemPrompt to provider', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider);

      await animator.animate({
        context: { systemPrompt: 'System prompt here' },
        prompt: 'Do the thing',
        cwd: '/tmp/workdir',
      }).result;

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.equal(captured!.systemPrompt, 'System prompt here');
      assert.equal(captured!.initialPrompt, 'Do the thing');
      assert.equal(captured!.model, 'sonnet');
      assert.equal(captured!.cwd, '/tmp/workdir');
    });

    it('passes context environment through to provider', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider);

      await animator.animate({
        context: { systemPrompt: 'Test', environment: { GIT_AUTHOR_NAME: 'Custom' } },
        cwd: '/tmp/workdir',
      }).result;

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.deepStrictEqual(captured!.environment, { GIT_AUTHOR_NAME: 'Custom' });
    });

    it('merges request environment over context environment', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider);

      await animator.animate({
        context: {
          systemPrompt: 'Test',
          environment: { GIT_AUTHOR_NAME: 'FromContext', GIT_AUTHOR_EMAIL: 'context@nexus.local' },
        },
        environment: { GIT_AUTHOR_NAME: 'FromRequest' },
        cwd: '/tmp/workdir',
      }).result;

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.equal(captured!.environment?.GIT_AUTHOR_NAME, 'FromRequest');
      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, 'context@nexus.local');
    });

    it('records failed session when provider throws', async () => {
      const throwProvider = createThrowingProvider(new Error('Provider exploded'));
      setup(throwProvider);

      await assert.rejects(
        () => animator.animate({
          context: { systemPrompt: 'Test' },
          cwd: '/tmp/workdir',
        }).result,
        { message: 'Provider exploded' },
      );

      // Should still be recorded in Stacks
      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const allDocs = await sessions.list();
      const failedDocs = allDocs.filter((d) => d.status === 'failed');
      assert.equal(failedDocs.length, 1);
      assert.equal(failedDocs[0]!.error, 'Provider exploded');
      assert.equal(failedDocs[0]!.exitCode, 1);
    });

    it('records provider-reported failure (not throw)', async () => {
      const failProvider = createFakeProvider({
        status: 'failed',
        exitCode: 2,
        error: 'Process crashed',
      });
      setup(failProvider);

      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.status, 'failed');
      assert.equal(result.exitCode, 2);
      assert.equal(result.error, 'Process crashed');
    });

    it('records timeout status', async () => {
      const timeoutProvider = createFakeProvider({
        status: 'timeout',
        exitCode: 124,
        error: 'Session timed out after 300s',
      });
      setup(timeoutProvider);

      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.status, 'timeout');
      assert.equal(result.exitCode, 124);
    });

    it('throws when session provider apparatus not installed', () => {
      // Set up with a bad provider plugin id
      setup(createFakeProvider(), 'nonexistent');
      // The provider IS registered at 'nonexistent', so the lookup will work.
      // Instead, set up a guild that has no apparatus at the configured id.
      clearGuild();

      const memBackend = new MemoryBackend();
      const stacksPlugin = createStacksApparatus(memBackend);
      const animatorPlugin = createAnimator();

      const apparatusMap = new Map<string, unknown>();

      setGuild({
        home: '/tmp/fake-guild',
        apparatus<T>(name: string): T {
          const api = apparatusMap.get(name);
          if (!api) throw new Error(`Apparatus "${name}" not installed`);
          return api as T;
        },
        config<T>(pluginId: string): T {
          if (pluginId === 'animator') {
            return { sessionProvider: 'missing-provider' } as T;
          }
          return {} as T;
        },
        writeConfig() { /* noop in test */ },
        guildConfig: () => ({
          name: 'test', nexus: '0.0.0', workshops: {}, roles: {},
          baseTools: [], plugins: [], settings: { model: 'sonnet' },
          animator: { sessionProvider: 'missing-provider' },
        }),
        kits: () => [],
        apparatuses: () => [],
      });

      const sa = (stacksPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
      sa.start({ on: () => {} });
      apparatusMap.set('stacks', sa.provides);
      memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, { indexes: [] });

      const aa = (animatorPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
      aa.start({ on: () => {} });
      const a = aa.provides as AnimatorApi;

      // animate() resolves the provider synchronously — throws before
      // returning the AnimateHandle.
      assert.throws(
        () => a.animate({
          context: { systemPrompt: 'Test' },
          cwd: '/tmp/workdir',
        }),
        /missing-provider/,
      );
    });

    it('returns empty chunks when streaming is not requested', async () => {
      const { chunks, result } = animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      });

      const collected: SessionChunk[] = [];
      for await (const chunk of chunks) {
        collected.push(chunk);
      }
      assert.equal(collected.length, 0);

      const sessionResult = await result;
      assert.equal(sessionResult.status, 'completed');
    });

    it('records output from provider result', async () => {
      const providerWithOutput = createFakeProvider({ output: 'The task is done.' });
      setup(providerWithOutput);

      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.output, 'The task is done.');

      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(result.id);
      assert.equal(doc?.output, 'The task is done.');
    });

    it('records transcript to transcripts book', async () => {
      const transcript = [
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } },
        { type: 'result', total_cost_usd: 0.01 },
      ];
      const providerWithTranscript = createFakeProvider({ transcript, output: 'Hello' });
      setup(providerWithTranscript);

      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      }).result;

      const transcripts = stacks.readBook<TranscriptDoc>('animator', 'transcripts');
      const doc = await transcripts.get(result.id);
      assert.ok(doc, 'transcript doc should be written');
      assert.equal(doc.id, result.id);
      assert.deepEqual(doc.messages, transcript);
    });

    it('skips transcript write when transcript is undefined', async () => {
      // Default fake provider has no transcript
      setup();

      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      }).result;

      const transcripts = stacks.readBook<TranscriptDoc>('animator', 'transcripts');
      const doc = await transcripts.get(result.id);
      assert.ok(!doc, 'no transcript doc should be written when transcript is undefined');
    });

    it('skips transcript write when transcript is empty', async () => {
      const providerWithEmptyTranscript = createFakeProvider({ transcript: [] });
      setup(providerWithEmptyTranscript);

      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      }).result;

      const transcripts = stacks.readBook<TranscriptDoc>('animator', 'transcripts');
      const doc = await transcripts.get(result.id);
      assert.ok(!doc, 'no transcript doc should be written for empty transcript');
    });

    it('session write failure does not mask transcript write', async () => {
      // Use a provider with transcript; the session write will fail but we
      // verify the transcript write still proceeds (both errors are independent).
      // In this test we just verify the result still resolves — error handling
      // contract says failures are logged, not propagated.
      const transcript = [
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Done' }] } },
      ];
      const providerWithTranscript = createFakeProvider({ transcript, output: 'Done' });
      setup(providerWithTranscript);

      // Should resolve without throwing even if internal writes fail
      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.status, 'completed');
      assert.equal(result.output, 'Done');
    });
  });

  describe('animate({ streaming: true })', () => {
    it('streams chunks and returns result', async () => {
      const testChunks: SessionChunk[] = [
        { type: 'text', text: 'Hello ' },
        { type: 'tool_use', tool: 'bash' },
        { type: 'tool_result', tool: 'bash' },
        { type: 'text', text: 'Done.' },
      ];

      setup(createStreamingFakeProvider(testChunks));

      const { chunks, result } = animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
        streaming: true,
      });

      const collected: SessionChunk[] = [];
      for await (const chunk of chunks) {
        collected.push(chunk);
      }

      assert.equal(collected.length, 4);
      assert.deepEqual(collected[0], { type: 'text', text: 'Hello ' });
      assert.deepEqual(collected[1], { type: 'tool_use', tool: 'bash' });

      const sessionResult = await result;
      assert.equal(sessionResult.status, 'completed');
      assert.ok(sessionResult.id.startsWith('ses-'));

      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(sessionResult.id);
      assert.ok(doc);
      assert.equal(doc.status, 'completed');
    });

    it('returns empty chunks when provider ignores streaming flag', async () => {
      // createFakeProvider always returns empty chunks regardless of streaming
      setup(createFakeProvider());

      const { chunks, result } = animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
        streaming: true,
      });

      const collected: SessionChunk[] = [];
      for await (const chunk of chunks) {
        collected.push(chunk);
      }
      assert.equal(collected.length, 0);

      const sessionResult = await result;
      assert.equal(sessionResult.status, 'completed');
      assert.equal(sessionResult.provider, 'fake');
    });

    it('records failed streaming session', async () => {
      const failChunks: SessionChunk[] = [
        { type: 'text', text: 'Starting...' },
      ];

      setup(createStreamingFakeProvider(failChunks, {
        status: 'failed',
        exitCode: 1,
        error: 'Stream failed',
      }));

      const { result } = animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
        streaming: true,
      });

      const sessionResult = await result;
      assert.equal(sessionResult.status, 'failed');

      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(sessionResult.id);
      assert.ok(doc);
      assert.equal(doc.status, 'failed');
    });
  });

  describe('session id generation', () => {
    beforeEach(() => {
      setup();
    });

    it('generates unique ids', async () => {
      const results = await Promise.all([
        animator.animate({ context: { systemPrompt: 'Test' }, cwd: '/tmp' }).result,
        animator.animate({ context: { systemPrompt: 'Test' }, cwd: '/tmp' }).result,
        animator.animate({ context: { systemPrompt: 'Test' }, cwd: '/tmp' }).result,
      ]);

      const ids = new Set(results.map((r) => r.id));
      assert.equal(ids.size, 3, 'All session ids should be unique');
    });

    it('ids follow ses-{base36_timestamp}-{hex_random} format', async () => {
      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp',
      }).result;

      assert.match(result.id, /^ses-[a-z0-9]+-[a-f0-9]{8}$/);
    });
  });

  describe('summon()', () => {
    it('returns an AnimateHandle with chunks and result', () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const handle = animator.summon({
        prompt: 'Build the frobnicator',
        cwd: '/tmp/workdir',
      });

      assert.ok(handle.chunks, 'should have chunks');
      assert.ok(handle.result instanceof Promise, 'result should be a Promise');
    });

    it('composes context via The Loom and launches a session', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider, 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Build the frobnicator',
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.status, 'completed');
      assert.ok(result.id.startsWith('ses-'));

      // Verify the provider received the prompt as initialPrompt
      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.equal(captured!.initialPrompt, 'Build the frobnicator');
      assert.equal(captured!.cwd, '/tmp/workdir');
      assert.equal(captured!.model, 'sonnet');
    });

    it('auto-populates trigger: summon in metadata', async () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Do the thing',
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.metadata?.trigger, 'summon');

      // Verify in Stacks too
      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(result.id);
      assert.equal(doc?.metadata?.trigger, 'summon');
    });

    it('merges caller metadata with auto-generated metadata', async () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Build it',
        cwd: '/tmp/workdir',
        metadata: {
          role: 'artificer',
          writId: 'wrt-abc123',
        },
      }).result;

      assert.equal(result.metadata?.trigger, 'summon');
      assert.equal(result.metadata?.role, 'artificer');
      assert.equal(result.metadata?.writId, 'wrt-abc123');
    });

    it('passes conversationId through for resume', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider, 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Continue working',
        cwd: '/tmp/workdir',
        conversationId: 'conv-resume-123',
      }).result;

      assert.equal(result.conversationId, 'conv-resume-123');

      const captured = getCapturedConfig();
      assert.equal(captured!.conversationId, 'conv-resume-123');
    });

    it('records session to Stacks', async () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Build it',
        cwd: '/tmp/workdir',
      }).result;

      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(result.id);
      assert.ok(doc);
      assert.equal(doc.status, 'completed');
      assert.equal(doc.metadata?.trigger, 'summon');
    });

    it('throws with clear error when Loom is not installed', async () => {
      // Setup WITHOUT the Loom
      setup(createFakeProvider());

      assert.throws(
        () => animator.summon({
          prompt: 'Build it',
          cwd: '/tmp/workdir',
        }),
        /Loom apparatus/,
      );
    });

    it('records failed session when provider throws', async () => {
      const throwProvider = createThrowingProvider(new Error('Session crashed'));
      setup(throwProvider, 'fake-provider', { installLoom: true });

      await assert.rejects(
        () => animator.summon({
          prompt: 'Build it',
          cwd: '/tmp/workdir',
        }).result,
        { message: 'Session crashed' },
      );

      // Failed session should still be recorded
      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const allDocs = await sessions.list();
      const failedDocs = allDocs.filter((d) => d.status === 'failed');
      assert.equal(failedDocs.length, 1);
      assert.equal(failedDocs[0]!.metadata?.trigger, 'summon');
    });

    it('Loom produces undefined systemPrompt at MVP', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider, 'fake-provider', { installLoom: true });

      await animator.summon({
        prompt: 'Build the thing',
        cwd: '/tmp/workdir',
      }).result;

      const captured = getCapturedConfig();
      assert.equal(captured!.systemPrompt, undefined);
    });

    it('records role in metadata when provided', async () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Build it',
        role: 'artificer',
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.metadata?.trigger, 'summon');
      assert.equal(result.metadata?.role, 'artificer');
    });

    it('omits role from metadata when not provided', async () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Build it',
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.metadata?.trigger, 'summon');
      assert.ok(!('role' in (result.metadata ?? {})));
    });

    it('prompt bypasses the Loom and goes directly to provider', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider, 'fake-provider', { installLoom: true });

      await animator.summon({
        prompt: 'Build the frobnicator',
        role: 'artificer',
        cwd: '/tmp/workdir',
      }).result;

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.equal(captured!.initialPrompt, 'Build the frobnicator');
      assert.equal(captured!.systemPrompt, undefined);
    });

    it('returns empty chunks when streaming is not requested', async () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const { chunks, result } = animator.summon({
        prompt: 'Build it',
        cwd: '/tmp/workdir',
      });

      const collected: SessionChunk[] = [];
      for await (const chunk of chunks) {
        collected.push(chunk);
      }
      assert.equal(collected.length, 0);

      const sessionResult = await result;
      assert.equal(sessionResult.status, 'completed');
    });

    it('passes Loom environment to provider when no request environment', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider, 'fake-provider', { installLoom: true });

      await animator.summon({
        prompt: 'Build the thing',
        role: 'artificer',
        cwd: '/tmp/workdir',
      }).result;

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.deepStrictEqual(captured!.environment, {
        GIT_AUTHOR_NAME: 'Artificer',
        GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
      });
    });

    it('merges request environment over Loom environment', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider, 'fake-provider', { installLoom: true });

      await animator.summon({
        prompt: 'Build the thing',
        role: 'artificer',
        cwd: '/tmp/workdir',
        environment: { GIT_AUTHOR_EMAIL: 'override@nexus.local' },
      }).result;

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.equal(captured!.environment?.GIT_AUTHOR_NAME, 'Artificer');
      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, 'override@nexus.local');
    });
  });
});

=== CONTEXT FILE: packages/plugins/animator/src/animator.ts ===
/**
 * The Animator — session launch and telemetry recording apparatus.
 *
 * Two API levels:
 * - summon() — high-level: composes context via The Loom, then launches.
 * - animate() — low-level: takes a pre-composed AnimaWeave + prompt.
 *
 * See: docs/specification.md (animator)
 */

import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import { guild, generateId } from '@shardworks/nexus-core';
import type { StacksApi, Book } from '@shardworks/stacks-apparatus';

import type { LoomApi } from '@shardworks/loom-apparatus';

import type {
  AnimatorApi,
  AnimateHandle,
  AnimatorConfig,
  AnimateRequest,
  SummonRequest,
  SessionResult,
  SessionChunk,
  SessionDoc,
  TranscriptDoc,
  TranscriptMessage,
  AnimatorSessionProvider,
  SessionProviderConfig,
  SessionProviderResult,
} from './types.ts';

import { sessionList, sessionShow, summon as summonTool } from './tools/index.ts';

// ── Core logic ───────────────────────────────────────────────────────

/**
 * Resolve the session provider apparatus.
 *
 * Looks up the provider by plugin id from guild config. The provider is
 * an apparatus whose `provides` implements AnimatorSessionProvider.
 * Arbor throws immediately if the plugin isn't loaded or has no provides.
 */
function resolveProvider(config: AnimatorConfig): AnimatorSessionProvider {
  const pluginId = config.sessionProvider ?? 'claude-code';
  return guild().apparatus<AnimatorSessionProvider>(pluginId);
}

/**
 * Resolve the model from guild settings.
 */
function resolveModel(): string {
  const g = guild();
  const guildConfig = g.guildConfig();
  return guildConfig.settings?.model ?? 'sonnet';
}

/**
 * Build the provider config from an AnimateRequest.
 *
 * The system prompt comes from the AnimaWeave (composed by The Loom).
 * The work prompt comes from the request directly (bypasses The Loom).
 * The streaming flag is passed through for the provider to honor (or ignore).
 */
function buildProviderConfig(
  request: AnimateRequest,
  model: string,
): SessionProviderConfig {
  return {
    systemPrompt: request.context.systemPrompt,
    initialPrompt: request.prompt,
    model,
    conversationId: request.conversationId,
    cwd: request.cwd,
    streaming: request.streaming,
    tools: request.context.tools,
    environment: { ...request.context.environment, ...request.environment },
  };
}

/**
 * Build a SessionResult from provider output and session metadata.
 */
function buildSessionResult(
  id: string,
  startedAt: string,
  providerName: string,
  providerResult: SessionProviderResult,
  request: AnimateRequest,
): SessionResult {
  const endedAt = new Date().toISOString();
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();

  return {
    id,
    status: providerResult.status,
    startedAt,
    endedAt,
    durationMs,
    provider: providerName,
    exitCode: providerResult.exitCode,
    error: providerResult.error,
    conversationId: request.conversationId,
    providerSessionId: providerResult.providerSessionId,
    tokenUsage: providerResult.tokenUsage,
    costUsd: providerResult.costUsd,
    metadata: request.metadata,
    output: providerResult.output,
  };
}

/**
 * Build a failed SessionResult when the provider throws.
 */
function buildFailedResult(
  id: string,
  startedAt: string,
  providerName: string,
  error: unknown,
  request: AnimateRequest,
): SessionResult {
  const endedAt = new Date().toISOString();
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const errorMessage = error instanceof Error ? error.message : String(error);

  return {
    id,
    status: 'failed',
    startedAt,
    endedAt,
    durationMs,
    provider: providerName,
    exitCode: 1,
    error: errorMessage,
    conversationId: request.conversationId,
    metadata: request.metadata,
  };
}

/**
 * Convert a SessionResult to a SessionDoc for Stacks storage.
 */
function toSessionDoc(result: SessionResult): SessionDoc {
  return {
    id: result.id,
    status: result.status,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    durationMs: result.durationMs,
    provider: result.provider,
    exitCode: result.exitCode,
    error: result.error,
    conversationId: result.conversationId,
    providerSessionId: result.providerSessionId,
    tokenUsage: result.tokenUsage,
    costUsd: result.costUsd,
    metadata: result.metadata,
    output: result.output,
  };
}

/**
 * Record a session result to The Stacks (sessions + transcripts books).
 *
 * Errors are logged but never propagated — session data loss is
 * preferable to masking the original failure. See § Error Handling Contract.
 */
async function recordSession(
  sessions: Book<SessionDoc>,
  transcripts: Book<TranscriptDoc>,
  result: SessionResult,
  transcript: TranscriptMessage[] | undefined,
): Promise<void> {
  try {
    await sessions.put(toSessionDoc(result));
  } catch (err) {
    console.warn(
      `[animator] Failed to record session ${result.id}: ${err instanceof Error ? err.message : err}`,
    );
  }

  if (transcript && transcript.length > 0) {
    try {
      await transcripts.put({ id: result.id, messages: transcript });
    } catch (err) {
      console.warn(
        `[animator] Failed to record transcript for ${result.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

/**
 * Write the initial 'running' session record to The Stacks.
 */
async function recordRunning(
  sessions: Book<SessionDoc>,
  id: string,
  startedAt: string,
  providerName: string,
  request: AnimateRequest,
): Promise<void> {
  try {
    await sessions.put({
      id,
      status: 'running',
      startedAt,
      provider: providerName,
      conversationId: request.conversationId,
      metadata: request.metadata,
    });
  } catch (err) {
    console.warn(
      `[animator] Failed to write initial session record ${id}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

// ── Apparatus factory ────────────────────────────────────────────────

/**
 * Create the Animator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks']` — records session results
 * - `provides: AnimatorApi` — the session launch API
 * - `supportKit` — contributes `sessions` book + inspection tools
 */
export function createAnimator(): Plugin {
  let config: AnimatorConfig = {};
  let sessions: Book<SessionDoc>;
  let transcripts: Book<TranscriptDoc>;

  const api: AnimatorApi = {
    summon(request: SummonRequest): AnimateHandle {
      // Resolve The Loom at call time — not a startup dependency.
      // This allows the Animator to start without the Loom installed;
      // only summon() requires it.
      let loom: LoomApi;
      try {
        loom = guild().apparatus<LoomApi>('loom');
      } catch {
        throw new Error(
          'summon() requires The Loom apparatus to be installed. ' +
          'Use animate() directly if you want to provide a pre-composed AnimaWeave.',
        );
      }

      // We need to weave context before we can animate, but summon()
      // must return synchronously. Wrap the async Loom call and the
      // animate delegation into a single deferred flow.
      const deferred = (async () => {
        // Compose identity context via The Loom.
        // The Loom owns system prompt composition — it produces the system
        // prompt from the anima's identity layers (role instructions,
        // curriculum, temperament, charter). MVP: returns empty (no
        // systemPrompt); the session runs without one until the Loom
        // gains composition logic. The work prompt bypasses the Loom.
        const context = await loom.weave({
          role: request.role,
        });

        // Merge caller metadata with auto-generated summon metadata
        const metadata: Record<string, unknown> = {
          trigger: 'summon',
          ...(request.role ? { role: request.role } : {}),
          ...request.metadata,
        };

        // Delegate to the standard animate path.
        // The work prompt goes directly on the request — it is not
        // a composition concern.
        return this.animate({
          context,
          prompt: request.prompt,
          cwd: request.cwd,
          conversationId: request.conversationId,
          metadata,
          streaming: request.streaming,
          environment: request.environment,
        });
      })();

      // Pipe chunks through — can't get them until the Loom weave resolves.
      // Works for both streaming and non-streaming: non-streaming providers
      // return empty chunks, so the generator yields nothing and completes.
      async function* pipeChunks(): AsyncIterable<SessionChunk> {
        const handle = await deferred;
        yield* handle.chunks;
      }

      return {
        chunks: pipeChunks(),
        result: deferred.then((handle) => handle.result),
      };
    },

    animate(request: AnimateRequest): AnimateHandle {
      const provider = resolveProvider(config);
      const model = resolveModel();
      const providerConfig = buildProviderConfig(request, model);

      // Step 1: generate session id, capture startedAt
      const id = generateId('ses', 4);
      const startedAt = new Date().toISOString();

      // Single path — the provider returns { chunks, result } regardless
      // of whether streaming is enabled. Providers that don't support
      // streaming return empty chunks; the Animator doesn't branch.
      const { chunks, result: providerResultPromise } = provider.launch(providerConfig);

      // Write initial record (fire and forget — don't block streaming)
      const initPromise = recordRunning(sessions, id, startedAt, provider.name, request);

      const result = (async () => {
        await initPromise;

        let sessionResult: SessionResult;
        try {
          const providerResult = await providerResultPromise;
          sessionResult = buildSessionResult(id, startedAt, provider.name, providerResult, request);
          await recordSession(sessions, transcripts, sessionResult, providerResult.transcript);
        } catch (err) {
          sessionResult = buildFailedResult(id, startedAt, provider.name, err, request);
          await recordSession(sessions, transcripts, sessionResult, undefined);
          throw err;
        }
        return sessionResult;
      })();

      return { chunks, result };
    },
  };

  return {
    apparatus: {
      requires: ['stacks'],
      recommends: ['loom'],

      supportKit: {
        books: {
          sessions: {
            indexes: ['startedAt', 'status', 'conversationId', 'provider'],
          },
          transcripts: {
            indexes: ['sessionId'],
          },
        },
        tools: [sessionList, sessionShow, summonTool],
      },

      provides: api,

      start(_ctx: StartupContext): void {
        const g = guild();
        config = g.guildConfig().animator ?? {};

        const stacks = g.apparatus<StacksApi>('stacks');
        sessions = stacks.book<SessionDoc>('animator', 'sessions');
        transcripts = stacks.book<TranscriptDoc>('animator', 'transcripts');
      },
    },
  };
}

=== CONTEXT FILE: packages/plugins/animator/src/index.ts ===
/**
 * @shardworks/animator-apparatus — The Animator.
 *
 * Session launch and telemetry recording: takes an AnimaWeave from The Loom,
 * launches an AI process via a session provider, monitors it until exit, and
 * records the result to The Stacks.
 *
 * See: docs/specification.md (animator)
 */

import { createAnimator } from './animator.ts';

// ── Animator API ─────────────────────────────────────────────────────

export {
  type AnimatorApi,
  type AnimateHandle,
  type AnimateRequest,
  type SummonRequest,
  type SessionResult,
  type SessionChunk,
  type TokenUsage,
  type SessionDoc,
  type AnimatorConfig,
  // Provider types (for implementors)
  type AnimatorSessionProvider,
  type SessionProviderConfig,
  type SessionProviderResult,
} from './types.ts';

export { createAnimator } from './animator.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createAnimator();

=== CONTEXT FILE: packages/plugins/dashboard/src/tool.ts ===
/**
 * dashboard-start tool — CLI-only.
 *
 * Starts the web dashboard server and opens the browser.
 * Runs until the process is interrupted (Ctrl+C).
 */

import { execSync } from 'node:child_process';
import process from 'node:process';
import { z } from 'zod';
import { tool } from '@shardworks/tools-apparatus';
import { startServer } from './server.ts';

export const dashboardStart = tool({
  name: 'dashboard-start',
  description: 'Start the guild web dashboard. Opens a browser and serves a live operations UI.',
  callableBy: ['cli'],
  params: {
    port: z
      .number()
      .int()
      .min(1024)
      .max(65535)
      .optional()
      .describe('Port to listen on (default: 4242)'),
    'no-open': z
      .boolean()
      .optional()
      .describe('Skip opening the browser automatically'),
  },
  handler: async ({ port: portArg, 'no-open': noOpen }) => {
    const port = portArg ?? 4242;
    const server = await startServer(port);
    const url = server.url;

    console.log('');
    console.log('  Guild Dashboard running at:');
    console.log('');
    console.log('    ' + url);
    console.log('');
    console.log('  Press Ctrl+C to stop.');
    console.log('');

    if (!noOpen) {
      try {
        const platform = process.platform;
        if (platform === 'darwin')  execSync('open ' + url,   { stdio: 'ignore' });
        else if (platform === 'win32') execSync('start "" ' + url, { stdio: 'ignore', shell: 'cmd.exe' });
        else execSync('xdg-open ' + url + ' 2>/dev/null; true', { stdio: 'ignore', shell: '/bin/sh' });
      } catch {
        // Browser open is best-effort; ignore errors
      }
    }

    // Keep the process alive until Ctrl+C
    await new Promise<void>(resolve => {
      process.once('SIGINT',  async () => { await server.close(); resolve(); });
      process.once('SIGTERM', async () => { await server.close(); resolve(); });
    });

    return { status: 'stopped', url };
  },
});

=== CONTEXT FILE: packages/plugins/dashboard/src/types.ts ===
/**
 * Local type stubs for apparatus documents read via Stacks readBook().
 * These mirror the shapes declared by the respective apparatus packages
 * without importing from them (to keep dashboard dependencies minimal).
 */

/** Minimal shape of a session document from the Animator's sessions book. */
export interface SessionDoc {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  provider: string;
  exitCode?: number;
  error?: string;
  conversationId?: string;
  providerSessionId?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  costUsd?: number;
  metadata?: Record<string, unknown>;
  output?: string;
  [key: string]: unknown;
}

=== CONTEXT FILE: packages/plugins/dispatch/package.json ===
{
  "name": "@shardworks/dispatch-apparatus",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus",
    "directory": "packages/plugins/dispatch"
  },
  "description": "The Dispatch — interim work runner: find the oldest ready writ and execute it",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@shardworks/animator-apparatus": "workspace:*",
    "@shardworks/clerk-apparatus": "workspace:*",
    "@shardworks/codexes-apparatus": "workspace:*",
    "@shardworks/loom-apparatus": "workspace:*",
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@shardworks/stacks-apparatus": "workspace:*",
    "@types/node": "25.5.0"
  },
  "files": [
    "dist"
  ],
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
}

=== CONTEXT FILE: packages/plugins/dispatch/src ===
tree b98821d8f6e34359fa506196cb377f8dd47ca090:packages/plugins/dispatch/src

dispatch.test.ts
dispatch.ts
index.ts
tools/
types.ts

=== CONTEXT FILE: packages/plugins/dispatch/tsconfig.json ===
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": [
    "src"
  ],
  "exclude": [
    "src/**/*.test.ts"
  ]
}

=== CONTEXT FILE: packages/plugins/dispatch/src/dispatch.test.ts ===
/**
 * Dispatch apparatus tests.
 *
 * Uses a fake session provider, in-memory Stacks, real Clerk, real Animator,
 * real Loom, and a fake Scriptorium to test the full dispatch lifecycle
 * without spawning real AI processes or touching git.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild, GuildConfig } from '@shardworks/nexus-core';
import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
import type { StacksApi } from '@shardworks/stacks-apparatus';
import { createLoom } from '@shardworks/loom-apparatus';
import { createAnimator } from '@shardworks/animator-apparatus';
import type {
  AnimatorSessionProvider,
  SessionProviderConfig,
  SessionChunk,
} from '@shardworks/animator-apparatus';
import { createClerk } from '@shardworks/clerk-apparatus';
import type { ClerkApi } from '@shardworks/clerk-apparatus';
import type { ScriptoriumApi, DraftRecord, SealResult } from '@shardworks/codexes-apparatus';

import { createDispatch } from './dispatch.ts';
import type { DispatchApi } from './types.ts';

// ── Shared empty chunks ───────────────────────────────────────────────

const emptyChunks: AsyncIterable<SessionChunk> = {
  [Symbol.asyncIterator]() {
    return {
      async next() {
        return { value: undefined as unknown as SessionChunk, done: true as const };
      },
    };
  },
};

// ── Fake session provider ─────────────────────────────────────────────

interface FakeProviderOptions {
  status?: 'completed' | 'failed' | 'timeout';
  error?: string;
}

function createFakeProvider(options: FakeProviderOptions = {}): AnimatorSessionProvider {
  let callCount = 0;

  return {
    name: 'fake',
    launch(_config: SessionProviderConfig) {
      callCount++;
      const status = options.status ?? 'completed';
      return {
        chunks: emptyChunks,
        result: Promise.resolve({
          status,
          exitCode: status === 'completed' ? 0 : 1,
          providerSessionId: `fake-sess-${callCount}`,
          error: options.error,
        }),
      };
    },
  };
}

// ── Fake Scriptorium ──────────────────────────────────────────────────

interface FakeScriptoriumOptions {
  openDraftFails?: boolean;
  sealFails?: boolean;
  pushFails?: boolean;
}

function createFakeScriptorium(options: FakeScriptoriumOptions = {}): ScriptoriumApi {
  let draftCounter = 0;

  return {
    async openDraft({ codexName, associatedWith }): Promise<DraftRecord> {
      if (options.openDraftFails) throw new Error('openDraft: bare clone not ready');
      draftCounter++;
      return {
        id: `draft-${draftCounter}`,
        codexName,
        branch: `draft-test-${draftCounter}`,
        path: `/tmp/worktrees/${codexName}/draft-${draftCounter}`,
        createdAt: new Date().toISOString(),
        associatedWith,
      };
    },
    async seal(): Promise<SealResult> {
      if (options.sealFails) throw new Error('seal: merge conflict');
      return { success: true, strategy: 'fast-forward', retries: 0, sealedCommit: 'abc123def' };
    },
    async push(): Promise<void> {
      if (options.pushFails) throw new Error('push: remote rejected');
    },
    async abandonDraft(): Promise<void> {
      // no-op
    },
    async add() { throw new Error('not implemented'); },
    async list() { return []; },
    async show() { throw new Error('not implemented'); },
    async remove() {},
    async fetch() {},
    async listDrafts() { return []; },
  };
}

// ── Spy fake provider (captures SessionProviderConfig) ───────────────

function createSpyFakeProvider(): {
  provider: AnimatorSessionProvider;
  getCapturedConfig: () => SessionProviderConfig | null;
} {
  let capturedConfig: SessionProviderConfig | null = null;
  return {
    provider: {
      name: 'fake-spy',
      launch(config: SessionProviderConfig) {
        capturedConfig = config;
        return {
          chunks: emptyChunks,
          result: Promise.resolve({
            status: 'completed' as const,
            exitCode: 0,
            providerSessionId: 'fake-spy-sess',
          }),
        };
      },
    },
    getCapturedConfig: () => capturedConfig,
  };
}

// ── Test harness ──────────────────────────────────────────────────────

interface SetupOptions {
  provider?: AnimatorSessionProvider;
  scriptorium?: ScriptoriumApi;
}

interface TestContext {
  dispatch: DispatchApi;
  clerk: ClerkApi;
  scriptorium: ScriptoriumApi;
}

function setup(options: SetupOptions = {}): TestContext {
  const memBackend = new MemoryBackend();
  const stacksPlugin = createStacksApparatus(memBackend);
  const loomPlugin = createLoom();
  const animatorPlugin = createAnimator();
  const clerkPlugin = createClerk();
  const dispatchPlugin = createDispatch();

  const provider = options.provider ?? createFakeProvider();
  const scriptorium = options.scriptorium ?? createFakeScriptorium();

  const apparatusMap = new Map<string, unknown>();
  apparatusMap.set('fake-provider', provider);
  apparatusMap.set('codexes', scriptorium);

  const fakeGuildConfig: GuildConfig = {
    name: 'test-guild',
    nexus: '0.0.0',
    plugins: [],
    settings: { model: 'sonnet' },
    animator: { sessionProvider: 'fake-provider' },
  };

  const fakeGuild: Guild = {
    home: '/tmp/fake-guild',
    apparatus<T>(name: string): T {
      const api = apparatusMap.get(name);
      if (!api) throw new Error(`Apparatus "${name}" not installed`);
      return api as T;
    },
    config<T>(pluginId: string): T {
      if (pluginId === 'animator') {
        return { sessionProvider: 'fake-provider' } as T;
      }
      return {} as T;
    },
    writeConfig() {},
    guildConfig() { return fakeGuildConfig; },
    kits: () => [],
    apparatuses: () => [],
  };

  setGuild(fakeGuild);

  // Start stacks
  const stacksApparatus = (stacksPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  stacksApparatus.start({ on: () => {} });
  const stacks = stacksApparatus.provides as StacksApi;
  apparatusMap.set('stacks', stacks);

  // Ensure books
  memBackend.ensureBook({ ownerId: 'clerk', book: 'writs' }, {
    indexes: ['status', 'type', 'createdAt'],
  });
  memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
    indexes: ['startedAt', 'status', 'conversationId', 'provider'],
  });

  // Start loom
  const loomApparatus = (loomPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  loomApparatus.start({ on: () => {} });
  apparatusMap.set('loom', loomApparatus.provides);

  // Start animator
  const animatorApparatus = (animatorPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  animatorApparatus.start({ on: () => {} });
  apparatusMap.set('animator', animatorApparatus.provides);

  // Start clerk
  const clerkApparatus = (clerkPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  clerkApparatus.start({ on: () => {} });
  const clerk = clerkApparatus.provides as ClerkApi;
  apparatusMap.set('clerk', clerk);

  // Start dispatch
  const dispatchApparatus = (dispatchPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  dispatchApparatus.start({ on: () => {} });
  const dispatch = dispatchApparatus.provides as DispatchApi;
  apparatusMap.set('dispatch', dispatch);

  return { dispatch, clerk, scriptorium };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Dispatch', () => {
  afterEach(() => {
    clearGuild();
  });

  // ── No ready writs ────────────────────────────────────────────────

  describe('next() — empty queue', () => {
    it('returns null when there are no ready writs', async () => {
      const { dispatch } = setup();
      const result = await dispatch.next();
      assert.equal(result, null);
    });

    it('returns null when all writs are in terminal states', async () => {
      const { dispatch, clerk } = setup();
      const writ = await clerk.post({ title: 'Already done', body: '' });
      await clerk.transition(writ.id, 'active');
      await clerk.transition(writ.id, 'completed');

      const result = await dispatch.next();
      assert.equal(result, null);
    });
  });

  // ── Dry run ───────────────────────────────────────────────────────

  describe('next({ dryRun: true })', () => {
    it('returns the writ id without dispatching', async () => {
      const { dispatch, clerk } = setup();
      const writ = await clerk.post({ title: 'Dry run target', body: '' });

      const result = await dispatch.next({ dryRun: true });

      assert.ok(result);
      assert.equal(result.writId, writ.id);
      assert.equal(result.dryRun, true);
      assert.equal(result.sessionId, undefined);
      assert.equal(result.outcome, undefined);
    });

    it('does not transition the writ on dry run', async () => {
      const { dispatch, clerk } = setup();
      const writ = await clerk.post({ title: 'Stay ready', body: '' });

      await dispatch.next({ dryRun: true });

      const after = await clerk.show(writ.id);
      assert.equal(after?.status, 'ready');
    });

    it('returns null on dry run when no ready writs exist', async () => {
      const { dispatch } = setup();
      const result = await dispatch.next({ dryRun: true });
      assert.equal(result, null);
    });
  });

  // ── Success path — no codex ───────────────────────────────────────

  describe('next() — successful session, no codex', () => {
    it('transitions writ ready → active → completed', async () => {
      const { dispatch, clerk } = setup();
      const writ = await clerk.post({ title: 'No codex work', body: '' });

      const result = await dispatch.next();

      assert.ok(result);
      assert.equal(result.writId, writ.id);
      assert.equal(result.outcome, 'completed');
      assert.equal(result.dryRun, false);
      assert.ok(result.sessionId);
      assert.ok(result.resolution);

      const after = await clerk.show(writ.id);
      assert.equal(after?.status, 'completed');
    });

    it('uses the default role "artificer" when none specified', async () => {
      // Verifies no error from omitting role
      const { dispatch, clerk } = setup();
      await clerk.post({ title: 'Default role test', body: '' });

      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.outcome, 'completed');
    });

    it('accepts an explicit role', async () => {
      const { dispatch, clerk } = setup();
      await clerk.post({ title: 'Scribe work', body: '' });

      const result = await dispatch.next({ role: 'scribe' });
      assert.ok(result);
      assert.equal(result.outcome, 'completed');
    });
  });

  // ── Success path — with codex ─────────────────────────────────────

  describe('next() — successful session, with codex', () => {
    it('opens draft, seals, pushes, and completes the writ', async () => {
      const openCalls: string[] = [];
      const sealCalls: string[] = [];
      const pushCalls: string[] = [];

      const scriptorium = createFakeScriptorium();
      // Wrap to track calls
      const trackingScriptorium: ScriptoriumApi = {
        ...scriptorium,
        async openDraft(req) {
          openCalls.push(req.codexName);
          return scriptorium.openDraft(req);
        },
        async seal(req) {
          sealCalls.push(req.codexName);
          return scriptorium.seal(req);
        },
        async push(req) {
          pushCalls.push(req.codexName);
          return scriptorium.push(req);
        },
      };

      const { dispatch, clerk } = setup({ scriptorium: trackingScriptorium });

      // Post a writ with a codex field (via index signature)
      const writ = await clerk.post({ title: 'Codex work', body: '' });
      // Patch the codex field onto the writ — WritDoc allows arbitrary fields
      // The Clerk doesn't expose codex patching, so we rely on the index signature
      // and test the no-codex path for Clerk-created writs.
      // For codex-bound writs, we test the Dispatch internals directly.
      // (A real commission-post would include codex; the Clerk API accepts it via [key: string]: unknown)

      // Dispatch the writ without codex (standard path)
      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.outcome, 'completed');

      // No codex on the writ, so no draft ops expected
      assert.equal(openCalls.length, 0);
      assert.equal(sealCalls.length, 0);
      assert.equal(pushCalls.length, 0);

      const after = await clerk.show(writ.id);
      assert.equal(after?.status, 'completed');
    });
  });

  // ── Failure path — session fails ──────────────────────────────────

  describe('next() — session fails', () => {
    it('transitions writ to failed when session fails', async () => {
      const { dispatch, clerk } = setup({
        provider: createFakeProvider({ status: 'failed', error: 'Claude exited with code 1' }),
      });

      const writ = await clerk.post({ title: 'Doomed commission', body: '' });

      const result = await dispatch.next();

      assert.ok(result);
      assert.equal(result.writId, writ.id);
      assert.equal(result.outcome, 'failed');
      assert.ok(result.resolution);
      assert.equal(result.dryRun, false);

      const after = await clerk.show(writ.id);
      assert.equal(after?.status, 'failed');
    });

    it('records the session error as the failure resolution', async () => {
      const { dispatch, clerk } = setup({
        provider: createFakeProvider({ status: 'failed', error: 'Out of tokens' }),
      });

      await clerk.post({ title: 'Token fail', body: '' });

      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.resolution, 'Out of tokens');
    });

    it('uses session status as resolution when no error message', async () => {
      const { dispatch, clerk } = setup({
        provider: createFakeProvider({ status: 'timeout' }),
      });

      await clerk.post({ title: 'Timeout commission', body: '' });

      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.resolution, 'Session timeout');
    });
  });

  // ── FIFO ordering ─────────────────────────────────────────────────

  describe('next() — FIFO dispatch ordering', () => {
    it('dispatches the oldest ready writ first', async () => {
      const { dispatch, clerk } = setup();

      // Create writs with small delays to ensure different createdAt timestamps
      const w1 = await clerk.post({ title: 'First posted', body: '' });
      await new Promise((r) => setTimeout(r, 5));
      const w2 = await clerk.post({ title: 'Second posted', body: '' });
      await new Promise((r) => setTimeout(r, 5));
      const w3 = await clerk.post({ title: 'Third posted', body: '' });

      // First dispatch should take w1 (oldest)
      const r1 = await dispatch.next();
      assert.ok(r1);
      assert.equal(r1.writId, w1.id);

      // Second dispatch should take w2
      const r2 = await dispatch.next();
      assert.ok(r2);
      assert.equal(r2.writId, w2.id);

      // Third dispatch should take w3
      const r3 = await dispatch.next();
      assert.ok(r3);
      assert.equal(r3.writId, w3.id);

      // No more ready writs
      const r4 = await dispatch.next();
      assert.equal(r4, null);
    });
  });

  // ── Draft open failure ────────────────────────────────────────────

  describe('next() — draft open fails', () => {
    it('fails the writ and returns without launching a session', async () => {
      // We need a writ with a codex field to trigger draft opening.
      // Since the Clerk API doesn't expose codex, we test a representative
      // scenario: if a future commission-post includes a codex field, it would
      // be stored via the index signature and read by the Dispatch.
      // For now, verify the no-codex path (draft open is skipped entirely).
      // The openDraftFails option is exercised via integration if codex is set.

      // This test verifies the fail path when scriptorium.openDraft throws.
      // To trigger this path we need a writ with writ.codex set.
      // Since WritDoc has [key: string]: unknown, we test by confirming the
      // Dispatch gracefully handles the no-codex case (draft not attempted).

      const { dispatch, clerk } = setup({
        scriptorium: createFakeScriptorium({ openDraftFails: true }),
      });

      const writ = await clerk.post({ title: 'No codex — draft skip', body: '' });

      // Without a codex on the writ, openDraft is never called even if it would fail
      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.outcome, 'completed'); // no codex → no draft → proceeds to session

      const after = await clerk.show(writ.id);
      assert.equal(after?.status, 'completed');
    });
  });

  // ── Seal / push failure ───────────────────────────────────────────

  describe('next() — seal fails', () => {
    it('fails the writ without abandoning the draft when seal fails', async () => {
      // Seal failure only occurs when a codex is present. Without a codex field
      // on the writ, the seal path is skipped. This test verifies that the
      // no-codex successful path still completes correctly even with a
      // sealFails scriptorium (seal is never called).
      const abandonCalls: string[] = [];
      const scriptorium = createFakeScriptorium({ sealFails: true });
      const trackingScriptorium: ScriptoriumApi = {
        ...scriptorium,
        async abandonDraft(req) {
          abandonCalls.push(req.branch);
        },
      };

      const { dispatch, clerk } = setup({ scriptorium: trackingScriptorium });
      await clerk.post({ title: 'Seal test — no codex', body: '' });

      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.outcome, 'completed'); // no codex — seal never attempted

      // abandonDraft was not called (no codex)
      assert.equal(abandonCalls.length, 0);
    });
  });

  // ── Writ not taken during dry run ─────────────────────────────────

  describe('next() — idempotency', () => {
    it('same writ is returned by two consecutive dry runs', async () => {
      const { dispatch, clerk } = setup();
      const writ = await clerk.post({ title: 'Idempotent check', body: '' });

      const r1 = await dispatch.next({ dryRun: true });
      const r2 = await dispatch.next({ dryRun: true });

      assert.ok(r1);
      assert.ok(r2);
      assert.equal(r1.writId, writ.id);
      assert.equal(r2.writId, writ.id);

      // Still ready after two dry runs
      const after = await clerk.show(writ.id);
      assert.equal(after?.status, 'ready');
    });
  });

  // ── Active writ skipped ───────────────────────────────────────────

  describe('next() — skips non-ready writs', () => {
    it('skips active and terminal writs, finds only ready ones', async () => {
      const { dispatch, clerk } = setup();

      // Create a writ and put it in active state
      const active = await clerk.post({ title: 'Already active', body: '' });
      await clerk.transition(active.id, 'active');

      // Create a completed writ
      const completed = await clerk.post({ title: 'Already completed', body: '' });
      await clerk.transition(completed.id, 'active');
      await clerk.transition(completed.id, 'completed');

      // The only ready writ
      const ready = await clerk.post({ title: 'The ready one', body: '' });

      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.writId, ready.id);
    });
  });

  // ── Git identity environment ──────────────────────────────────────

  describe('next() — git identity environment', () => {
    it('passes writ-scoped GIT_*_EMAIL to the session provider', async () => {
      const { provider, getCapturedConfig } = createSpyFakeProvider();
      const { dispatch, clerk } = setup({ provider });

      const writ = await clerk.post({ title: 'Git identity test', body: '' });

      await dispatch.next();

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.ok(captured!.environment, 'environment should be present');
      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, `${writ.id}@nexus.local`);
      assert.ok(captured!.environment?.GIT_AUTHOR_NAME, 'GIT_AUTHOR_NAME should be present');
    });

    it('preserves Loom role name in GIT_*_NAME while overriding email', async () => {
      const { provider, getCapturedConfig } = createSpyFakeProvider();
      const { dispatch, clerk } = setup({ provider });

      const writ = await clerk.post({ title: 'Name/email split test', body: '' });

      await dispatch.next();

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.equal(captured!.environment?.GIT_AUTHOR_NAME, 'Artificer');
      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, `${writ.id}@nexus.local`);
    });
  });
});

=== CONTEXT FILE: packages/plugins/dispatch/src/types.ts ===
/**
 * The Dispatch — public types.
 *
 * These types form the contract between The Dispatch apparatus and all
 * callers (CLI, clockworks). No implementation details.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */

// ── DispatchApi (the `provides` interface) ───────────────────────────

export interface DispatchApi {
  /**
   * Find the oldest ready writ and execute it.
   *
   * The full dispatch lifecycle:
   *   1. Query the Clerk for the oldest ready writ
   *   2. Transition the writ to active
   *   3. Open a draft binding on the writ's codex (if specified)
   *   4. Summon an anima session with the writ context as prompt
   *   5. Wait for session completion
   *   6. On success: seal the draft, push, transition writ to completed
   *   7. On failure: abandon the draft, transition writ to failed
   *
   * Returns null if no ready writs exist.
   *
   * If the writ has no codex, steps 3/6/7 (draft lifecycle) are
   * skipped — the session runs in the guild home directory with
   * no codex binding.
   */
  next(request?: DispatchRequest): Promise<DispatchResult | null>;
}

// ── Request / Result ─────────────────────────────────────────────────

export interface DispatchRequest {
  /** Role to summon. Default: 'artificer'. */
  role?: string;
  /** If true, find and report the writ but don't dispatch. */
  dryRun?: boolean;
}

export interface DispatchResult {
  /** The writ that was dispatched. */
  writId: string;
  /** The session id (from the Animator). Absent if dryRun. */
  sessionId?: string;
  /** Terminal writ status after dispatch. Absent if dryRun. */
  outcome?: 'completed' | 'failed';
  /** Resolution text set on the writ. Absent if dryRun. */
  resolution?: string;
  /** Whether this was a dry run. */
  dryRun: boolean;
}

=== CONTEXT FILE: packages/plugins/dispatch/src/tools ===
tree b98821d8f6e34359fa506196cb377f8dd47ca090:packages/plugins/dispatch/src/tools

dispatch-next.ts
index.ts

=== CONTEXT FILE: packages/plugins/fabricator/src/fabricator.test.ts ===
/**
 * Fabricator — unit tests.
 *
 * Tests engine design registration from kits and apparatus supportKits,
 * and FabricatorApi.getEngineDesign() lookup. Uses a mock guild() singleton
 * to simulate the plugin environment.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  setGuild,
  clearGuild,
} from '@shardworks/nexus-core';
import type {
  Guild,
  LoadedKit,
  LoadedApparatus,
  StartupContext,
} from '@shardworks/nexus-core';

import {
  createFabricator,
  type FabricatorApi,
  type EngineDesign,
} from './fabricator.ts';

// ── Test helpers ──────────────────────────────────────────────────────

/** Create a minimal valid engine design for testing. */
function mockEngine(id: string): EngineDesign {
  return {
    id,
    async run(_givens, _ctx) {
      return { status: 'completed', yields: null };
    },
  };
}

/** Build a mock LoadedKit with engine contributions. */
function mockKit(id: string, engines: Record<string, unknown>): LoadedKit {
  return {
    packageName: `@test/${id}`,
    id,
    version: '0.0.0',
    kit: { engines },
  };
}

/** Build a mock LoadedApparatus with optional supportKit engines. */
function mockApparatus(
  id: string,
  supportKitEngines?: Record<string, unknown>,
): LoadedApparatus {
  return {
    packageName: `@test/${id}`,
    id,
    version: '0.0.0',
    apparatus: {
      start() {},
      ...(supportKitEngines ? { supportKit: { engines: supportKitEngines } } : {}),
    },
  };
}

/** Wire a mock Guild into the singleton. */
function wireGuild(opts: {
  kits?: LoadedKit[];
  apparatuses?: LoadedApparatus[];
}): void {
  const kits = opts.kits ?? [];
  const apparatuses = opts.apparatuses ?? [];

  const mockGuild: Guild = {
    home: '/tmp/test-guild',
    apparatus<T>(_name: string): T {
      throw new Error('Not implemented in test');
    },
    config<T>(_pluginId: string): T {
      return {} as T;
    },
    writeConfig() {},
    guildConfig() {
      return { name: 'test', nexus: '0.0.0', workshops: {}, plugins: [] };
    },
    kits() { return [...kits]; },
    apparatuses() { return [...apparatuses]; },
  };

  setGuild(mockGuild);
}

/**
 * Build a StartupContext that captures event subscriptions.
 * Returns both the context and a fire() function to trigger events.
 */
function buildTestContext(): {
  ctx: StartupContext;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => void | Promise<void>>>();

  const ctx: StartupContext = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };

  async function fire(event: string, ...args: unknown[]): Promise<void> {
    for (const h of handlers.get(event) ?? []) {
      await h(...args);
    }
  }

  return { ctx, fire };
}

/** Start the Fabricator and return its API and event-firing capability. */
function startFabricator(opts: {
  kits?: LoadedKit[];
  apparatuses?: LoadedApparatus[];
}): { api: FabricatorApi; fire: (event: string, ...args: unknown[]) => Promise<void> } {
  wireGuild(opts);

  const plugin = createFabricator();
  const api = ('apparatus' in plugin ? plugin.apparatus.provides : null) as FabricatorApi;
  assert.ok(api, 'Fabricator must expose provides');

  const { ctx, fire } = buildTestContext();
  if ('apparatus' in plugin) {
    plugin.apparatus.start(ctx);
  }

  return { api, fire };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Fabricator', () => {
  afterEach(() => {
    clearGuild();
  });

  describe('getEngineDesign()', () => {
    it('returns undefined for an unknown engine ID', () => {
      const { api } = startFabricator({});
      assert.equal(api.getEngineDesign('nonexistent'), undefined);
    });

    it('finds an engine registered from a kit', () => {
      const engine = mockEngine('draft');
      const kit = mockKit('my-kit', { draft: engine });
      const { api } = startFabricator({ kits: [kit] });

      const found = api.getEngineDesign('draft');
      assert.ok(found, 'engine should be found');
      assert.equal(found.id, 'draft');
      assert.equal(found, engine);
    });

    it('registers engines from multiple kits', () => {
      const alpha = mockEngine('alpha');
      const beta = mockEngine('beta');
      const { api } = startFabricator({
        kits: [
          mockKit('kit-a', { alpha }),
          mockKit('kit-b', { beta }),
        ],
      });

      assert.equal(api.getEngineDesign('alpha'), alpha);
      assert.equal(api.getEngineDesign('beta'), beta);
    });

    it('last-write-wins for duplicate engine IDs across kits', () => {
      const engine1 = mockEngine('draft');
      const engine2 = mockEngine('draft');
      const { api } = startFabricator({
        kits: [
          mockKit('kit-1', { draft: engine1 }),
          mockKit('kit-2', { draft: engine2 }),
        ],
      });

      assert.equal(api.getEngineDesign('draft'), engine2);
    });

    it('registers engines from apparatus supportKit via plugin:initialized', async () => {
      const engine = mockEngine('implement');
      const app = mockApparatus('my-apparatus', { implement: engine });

      const { api, fire } = startFabricator({});
      assert.equal(api.getEngineDesign('implement'), undefined);

      await fire('plugin:initialized', app);

      const found = api.getEngineDesign('implement');
      assert.ok(found, 'engine should be found after apparatus initialized');
      assert.equal(found.id, 'implement');
      assert.equal(found, engine);
    });

    it('ignores kits fired via plugin:initialized (kits are scanned at startup only)', async () => {
      const engine = mockEngine('late');
      const kit = mockKit('late-kit', { late: engine });

      const { api, fire } = startFabricator({});
      await fire('plugin:initialized', kit);

      // Kits fired after startup are intentionally skipped
      assert.equal(api.getEngineDesign('late'), undefined);
    });

    it('skips entries missing the id field silently', () => {
      const kit = mockKit('messy-kit', {
        noId: { run: async () => ({ status: 'completed', yields: null }) },
      });
      // Should not throw
      const { api } = startFabricator({ kits: [kit] });
      assert.equal(api.getEngineDesign('noId'), undefined);
    });

    it('skips entries missing the run field silently', () => {
      const kit = mockKit('messy-kit', {
        noRun: { id: 'draft' },
      });
      const { api } = startFabricator({ kits: [kit] });
      assert.equal(api.getEngineDesign('draft'), undefined);
    });

    it('skips null and primitive entries silently, keeps valid ones', () => {
      const valid = mockEngine('valid');
      const kit = mockKit('messy-kit', {
        a: null,
        b: 'not-an-engine',
        c: 42,
        d: valid,
      });
      const { api } = startFabricator({ kits: [kit] });

      assert.equal(api.getEngineDesign('valid'), valid);
      assert.equal(api.getEngineDesign('a'), undefined);
    });

    it('ignores a kit with no engines field', () => {
      const kit: LoadedKit = {
        packageName: '@test/no-engines',
        id: 'no-engines',
        version: '0.0.0',
        kit: {},
      };
      // Should not throw
      const { api } = startFabricator({ kits: [kit] });
      assert.equal(api.getEngineDesign('anything'), undefined);
    });

    it('ignores an apparatus with no supportKit', async () => {
      const app = mockApparatus('bare-apparatus');
      const { api, fire } = startFabricator({});
      // Should not throw
      await fire('plugin:initialized', app);
      assert.equal(api.getEngineDesign('anything'), undefined);
    });

    it('ignores an apparatus supportKit with no engines field', async () => {
      const app: LoadedApparatus = {
        packageName: '@test/bare',
        id: 'bare',
        version: '0.0.0',
        apparatus: {
          start() {},
          supportKit: {},
        },
      };
      const { api, fire } = startFabricator({});
      // Should not throw
      await fire('plugin:initialized', app);
      assert.equal(api.getEngineDesign('anything'), undefined);
    });

    it('handles engines from both kits and apparatus supportKits together', async () => {
      const kitEngine = mockEngine('kit-engine');
      const apparatusEngine = mockEngine('apparatus-engine');

      const { api, fire } = startFabricator({
        kits: [mockKit('my-kit', { kitEngine })],
      });
      await fire('plugin:initialized', mockApparatus('my-apparatus', { apparatusEngine }));

      assert.equal(api.getEngineDesign('kit-engine'), kitEngine);
      assert.equal(api.getEngineDesign('apparatus-engine'), apparatusEngine);
    });
  });
});

=== CONTEXT FILE: packages/plugins/fabricator/src/index.ts ===
/**
 * @shardworks/fabricator-apparatus — The Fabricator.
 *
 * Guild engine design registry: scans kit contributions, stores engine designs
 * by ID, and provides the FabricatorApi for design lookup.
 *
 * The EngineDesign, EngineRunContext, and EngineRunResult types live here
 * canonically — kit authors import from this package to contribute engines.
 */

import { createFabricator } from './fabricator.ts';

// ── Engine authoring API ───────────────────────────────────────────────

export type {
  EngineDesign,
  EngineRunContext,
  EngineRunResult,
} from './fabricator.ts';

// ── Fabricator API ────────────────────────────────────────────────────

export type { FabricatorApi } from './fabricator.ts';

// ── Apparatus factory (for tests and direct instantiation) ────────────

export { createFabricator } from './fabricator.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createFabricator();

=== CONTEXT FILE: packages/plugins/spider/src ===
tree b98821d8f6e34359fa506196cb377f8dd47ca090:packages/plugins/spider/src

engines/
index.ts
spider.test.ts
spider.ts
tools/
types.ts

=== CONTEXT FILE: packages/plugins/spider/src/engines ===
tree b98821d8f6e34359fa506196cb377f8dd47ca090:packages/plugins/spider/src/engines

draft.ts
implement.ts
index.ts
review.ts
revise.ts
seal.ts

=== CONTEXT FILE: packages/plugins/spider/src/tools ===
tree b98821d8f6e34359fa506196cb377f8dd47ca090:packages/plugins/spider/src/tools

crawl-continual.ts
crawl.ts
index.ts


## Codebase Structure (surrounding directories)

```
```

=== TREE: ./ ===
.claude
.gitattributes
.github
.gitignore
.nvmrc
LICENSE
README.md
bin
docs
package.json
packages-deprecated
packages
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json

=== TREE: docs/ ===
DEVELOPERS.md
architecture
feature-specs
guides
guild-metaphor.md
in-progress
philosophy.md
reference

=== TREE: docs/architecture/ ===
_agent-context.md
apparatus
clockworks.md
index.md
kit-components.md
plugins.md
rigging.md

=== TREE: docs/architecture/apparatus/ ===
_template.md
animator.md
claude-code.md
clerk.md
dispatch.md
fabricator.md
instrumentarium.md
loom.md
parlour.md
review-loop.md
scriptorium.md
spider.md
stacks.md

=== TREE: packages/plugins/animator/src/ ===
animator.test.ts
animator.ts
index.ts
tools
types.ts

=== TREE: packages/plugins/dashboard/src/ ===
dashboard.ts
html.ts
index.ts
rig-types.ts
server.ts
tool.ts
types.ts

=== TREE: packages/plugins/dispatch/ ===
README.md
package.json
src
tsconfig.json

=== TREE: packages/plugins/dispatch/src/ ===
dispatch.test.ts
dispatch.ts
index.ts
tools
types.ts

=== TREE: packages/plugins/fabricator/src/ ===
fabricator.test.ts
fabricator.ts
index.ts

=== TREE: packages/plugins/spider/ ===
package.json
src
tsconfig.json

=== TREE: packages/plugins/spider/src/ ===
engines
index.ts
spider.test.ts
spider.ts
tools
types.ts

=== TREE: packages/plugins/spider/src/engines/ ===
draft.ts
implement.ts
index.ts
review.ts
revise.ts
seal.ts

=== TREE: packages/plugins/spider/src/tools/ ===
crawl-continual.ts
crawl.ts
index.ts

```
```

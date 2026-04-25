# Cartograph apparatus — vision/charge/piece scaffold

## Intent

Stand up a new framework plugin `@shardworks/cartograph-apparatus` that registers three new writ types (`vision`, `charge`, `piece`) with their companion books and a typed API that enforces ladder invariants. The plugin is the substrate for the future vision-keeper agent and the broader decomposition-ladder feature; this commission ships the scaffold only — no agent runtime, no CLI, no consumers.

## Rationale

The decomposition-ladder design (clicks `c-mod53o6h`, `c-mod53ood`, `c-modee576`, `c-modee5kb`, `c-modee5x4`, `c-modee69x`, `c-modeor2d`) settled on a four-level structure for tracking long-lived patron intent: **vision** (top, patron-owned, long-lived) → **charge** (first decomposition, patron-contract boundary, the unit of patron walkthrough) → **piece** (recursive, internal organization, self-nesting) → **mandate** (existing leaf, where rigs attach). This commission lands the data-and-typed-API layer so downstream commissions (vision-keeper agent, CLI surfaces, Reckoner integration) have a substrate to build on.

## Scope & Blast Radius

**One new package**: `packages/plugins/cartograph/` with the standard plugin shape (Plugin export, `package.json`, `README.md`, `src/index.ts` re-exports, `src/cartograph.ts` apparatus, `src/types.ts`, source-level tests).

**Cross-package contract**: the plugin registers three writ types with the Clerk's writ-type registry via `clerk.registerWritType(...)`, mirroring how the Astrolabe registers `brief`, `piece`, and `observation-set` today. No Clerk-side code changes required — the registry is open for plugin contributions.

**No changes outside the new package** other than:
- `pnpm-workspace.yaml` (if needed for the new package to be discoverable — verify whether the existing glob already covers it).
- `package.json` workspace dependencies if the new package is referenced by name elsewhere — but it should NOT be referenced by anything in this commission. The vision-keeper agent and Reckoner integration are out of scope.

The Clerk's `mandate` writ type registration stays where it is. This commission does not touch mandate's config; ladder invariants for mandate-attaching-to-cartograph-trees are enforced from the cartograph side at typed-API entry, not by Clerk.

## Decisions

| # | Decision | Default | Rationale |
|---|---|---|---|
| D1 | Single plugin (not split) | `@shardworks/cartograph-apparatus` owns writ types + companion books + typed API + agent role file | Click `c-modee69x`. Boundary cost outweighs split's conceptual cleanliness; matches astrolabe precedent. |
| D2 | Companion-book pattern | One companion book per ladder writ type, keyed by writ id (the doc's primary key IS the writ id). Books named `visions`, `charges`, `pieces`. | Click `c-modee576`. Mirrors PlanDoc precedent. The writ stays generic; typed fields live in the companion doc. |
| D3 | Companion doc convention | `VisionDoc`, `ChargeDoc`, `PieceDoc` — `XxxDoc` suffix matching `PlanDoc` | Click `c-modeor2d`. Existing precedent in the codebase. |
| D4 | Ladder edge mechanism | Parent/child via `writ.parentId` (NO new typed link kinds for v0). | Click `c-modee5kb`. Tree-shape concerns are captured by parentId; cross-product DAG edges are deferred to future link-kind work. |
| D5 | Ladder invariants enforcement | Vision plugin's typed API rejects bad parents at create-time. Raw `clerk.create` stays unconstrained — Clerk's writ-type config does NOT carry parentTypes/allowedChildren restrictions. | Click `c-modee5x4`. Closed-world commitments in writ-type config are open-world-incompatible; v0 enforcement lives at the plugin's typed-API surface. Tree-shape registry as a future construct is parked under `c-modou2qv`. |
| D6 | Vision-keeper agent runtime | OUT OF SCOPE for this commission. The scaffold ships a placeholder role-file stub at `packages/plugins/cartograph/vision-keeper.md` documenting "agent runtime lands in a separate commission." | Keeps this commission tightly scoped. |
| D7 | CLI surfaces | OUT OF SCOPE. No `nsg vision`, `nsg charge`, `nsg piece` commands. | Separate commission. |
| D8 | VisionDoc body shape | Vision text lives in `writ.body` for v0 — no `visionRef` field on `VisionDoc`. The companion doc carries typed metadata only (priority, lifecycle stage, owner, etc.). | Click `c-modee576` settled this. Can add a body-pointer non-breakingly later if vision text outgrows the writ body. |
| D9 | Lifecycle coupling | `ProductStage`-style enum on each XxxDoc carries domain-level lifecycle (e.g., `draft \| active \| sunset \| cancelled`). Typed API transitions both `writ.phase` and the doc's stage field together on terminal transitions. No CDC-delete or orphan cleanup; companion doc survives writ's terminal phases. | Click `c-modee576`. |
| D10 | Doc-stage enum | Each doc gets its own stage enum (VisionStage, ChargeStage, PieceStage) — implementer picks the variant set per type, drawing on the companion-doc-stage conclusion. Suggested sets to start: vision: `draft \| active \| sunset \| cancelled`. charge: `draft \| active \| validated \| dropped`. piece: `draft \| active \| done \| dropped`. The implementer may adjust if a different shape reads more naturally. | Stage enums are domain-level, distinct from writ phase. |
| D11 | Plugin dependencies | `requires: ['stacks', 'clerk']` (stacks for the books, clerk for the writ-type registry). No `loom` requirement for v0 because the role file is a stub; once the agent runtime lands, loom moves to required. | Mirrors astrolabe's dependency shape. |

## Acceptance Signal

- `pnpm --filter @shardworks/cartograph-apparatus test` passes with the test suite covering: writ-type registration (the three types appear in `clerk.listWritTypes()` with expected configs), typed-API parent validation (createVision rejects when parentId is set; createCharge rejects when parentId is not a vision; createPiece rejects when parentId is not a charge or piece; positive cases all succeed), companion-book CRUD round-trip (writ id matches doc primary key; doc patches preserve unaffected fields), lifecycle coupling (transitioning writ.phase to a terminal state is reflected in the companion doc's stage field via the typed API).
- `pnpm --filter @shardworks/cartograph-apparatus typecheck` clean.
- `pnpm --filter @shardworks/cartograph-apparatus build` clean.
- The plugin is publishable: `package.json` declares the right exports, the readme describes the apparatus and the three writ types, the role-file stub at `packages/plugins/cartograph/vision-keeper.md` exists and explicitly says "agent runtime ships in a separate commission."
- Adding `"@shardworks/cartograph-apparatus"` to a guild's `plugins` array (in a fresh test guild config) starts cleanly — no startup errors, the three writ types appear in `clerk.listWritTypes()`, the books are visible in stacks.
- A grep for `@shardworks/cartograph-apparatus` across other plugin packages turns up nothing — this commission introduces no new cross-package coupling.

## Existing Patterns

The Astrolabe is the closest precedent for this work. Read in this order:

- `packages/plugins/astrolabe/src/astrolabe.ts` — apparatus shape: how it declares writ types, registers companion-book schemas, exposes the typed API surface, declares dependencies and recommends. The `Plugin` export at the top, the `start()` lifecycle that registers writ types, and the `AstrolabeApi` typed interface are the templates.
- `packages/plugins/astrolabe/src/types.ts` — the `PlanDoc` shape and the `AstrolabeApi` interface. The companion-doc convention is right there.
- `packages/plugins/astrolabe/package.json` — dependency declarations, exports, scripts.
- `packages/plugins/astrolabe/README.md` — what a plugin readme looks like.
- `packages/plugins/clerk/src/clerk.ts` — search for `MANDATE_CONFIG` to see how a writ type is configured (allowedTransitions, terminal states, anyFailure/allSuccess cascade rules). The mandate config is the canonical example to mirror for the three new types.

For ladder invariants, the cleanest implementation pattern is a small validator function called at the top of each `createVision` / `createCharge` / `createPiece` method. The validator looks up the parent via `clerk.show(parentId)` and verifies the parent's type matches the allowed set for the child. Failure produces a descriptive error.

## What NOT To Do

- Do not build the vision-keeper agent runtime. The role file is a placeholder; the prompt, tools, and dispatch wiring are all out of scope for this commission.
- Do not add CLI commands (`nsg vision`, `nsg charge`, `nsg piece`) — that's a separate later commission.
- Do not add Oculus pages for the new writ types. The existing writs page handles them via the type-vocabulary helper that already classifies arbitrary writ types.
- Do not modify Clerk to enforce ladder invariants on the registry side. Per `c-modee5x4`, raw `clerk.create` stays unconstrained; enforcement lives in cartograph's typed API only.
- Do not add link kinds for cross-product DAG edges. Per `c-modee5kb`, parent/child via `parentId` is the v0 edge mechanism; typed link kinds are deferred until concrete cross-product use cases arrive.
- Do not seed example visions, charges, or pieces into any guild — first-product authoring is parked under `c-mod53p9w` / `c-mod53rbz`.
- Do not change Astrolabe's existing writ-type registrations (`brief`, `piece`, `observation-set`). Note: Astrolabe ALSO registers a writ type called `piece` today (atomic-step-of-mandate sense). With the cartograph `piece` (recursive ladder node sense), TWO different `piece` writ types would conflict in the registry. Verify this collision and resolve it by **renaming Astrolabe's existing piece writ type** if it exists in the registry. The Spider-side execution-step rename (`b553e49`) covered the spider-side execution semantics; if Astrolabe still registers a `piece` writ type, this commission is the right place to chase down the registry-side rename to `step` or whatever the renamed identifier is. Verify by reading `packages/plugins/astrolabe/src/astrolabe.ts` for the `clerk.registerWritType` calls; if astrolabe's `piece` registration still exists, rename it to `step` (matching the execution-layer rename) and update consumers.
- Do not add fields to the existing mandate writ type config or Clerk's mandate registration. The mandate stays as-is; it just becomes attachable under cartograph trees by virtue of mandate's existing `parentId` mechanism.
- Do not invent ladder invariants beyond what the design clicks settled. The four rules are: vision has no parent; charge.parentId must be a vision; piece.parentId must be a charge or piece; mandate.parentId must be a charge or piece (mandate-side enforcement isn't this plugin's responsibility — Clerk's mandate config doesn't constrain parents, and that stays).

<task-manifest>
  <task id="t1">
    <name>Create plugin package scaffolding</name>
    <files>packages/plugins/cartograph/package.json, packages/plugins/cartograph/tsconfig.json, packages/plugins/cartograph/README.md, packages/plugins/cartograph/src/index.ts, packages/plugins/cartograph/vision-keeper.md (stub)</files>
    <action>Stand up a new TypeScript package at packages/plugins/cartograph/ matching the astrolabe package layout (package.json with exports, scripts, dependencies on @shardworks/nexus-core, @shardworks/stacks-apparatus, @shardworks/clerk-apparatus, plus the standard dev dependencies; tsconfig extending the workspace base; README documenting the apparatus and the three writ types it registers; src/index.ts re-exporting from src/cartograph.ts and src/types.ts; vision-keeper.md as a placeholder role file explicitly stating that the agent runtime ships in a separate later commission). Verify the package is discoverable in the workspace (check pnpm-workspace.yaml glob coverage) and that pnpm install completes cleanly.</action>
    <verify>cd packages/plugins/cartograph && cat package.json && pnpm --filter @shardworks/cartograph-apparatus typecheck</verify>
    <done>Package scaffolding exists, dependencies install, typecheck passes against an empty src/cartograph.ts.</done>
  </task>
  <task id="t2">
    <name>Define types — writ types, companion docs, API interface</name>
    <files>packages/plugins/cartograph/src/types.ts</files>
    <action>Define the typed shapes: VisionDoc, ChargeDoc, PieceDoc (with id matching the writ id, plus a stage enum per doc per D10, plus typed metadata fields the doc carries). Define VisionStage, ChargeStage, PieceStage enums. Define the CartographApi interface exposing createVision, createCharge, createPiece, plus read/list/patch surface for each doc type (mirror the astrolabe API shape — get/list/patch by writ id, with reasonable filters). Keep the surface minimal — anything not load-bearing for the scaffold goes in a later commission.</action>
    <verify>pnpm --filter @shardworks/cartograph-apparatus typecheck</verify>
    <done>types.ts compiles cleanly; the API interface is the contract that src/cartograph.ts will implement in t4.</done>
  </task>
  <task id="t3">
    <name>Resolve astrolabe piece-writ-type collision</name>
    <files>packages/plugins/astrolabe/src/astrolabe.ts (if astrolabe still registers a 'piece' writ type)</files>
    <action>Read packages/plugins/astrolabe/src/astrolabe.ts and check whether astrolabe registers a writ type named 'piece' via clerk.registerWritType. If it does, rename that registration to 'step' (matching the spider-side execution-layer rename in commit b553e49) and update any consumers in astrolabe's source and tests. If astrolabe does not register a 'piece' type, this task is a no-op — verify and document.</action>
    <verify>grep -n "registerWritType" packages/plugins/astrolabe/src/astrolabe.ts && pnpm --filter @shardworks/astrolabe-apparatus test</verify>
    <done>No registry collision exists between astrolabe's writ types and cartograph's planned 'piece' registration. Astrolabe tests pass.</done>
  </task>
  <task id="t4">
    <name>Implement the apparatus — register writ types, expose typed API with ladder enforcement</name>
    <files>packages/plugins/cartograph/src/cartograph.ts, packages/plugins/cartograph/src/index.ts</files>
    <action>Implement the cartograph apparatus following the astrolabe Plugin shape. start() registers the three writ types via clerk.registerWritType (mandate-shape: new → open → completed, allowedTransitions, terminal states, no allowSuccess/anyFailure cascade for v0 — match what astrolabe does for its 'brief' type). start() also opens the three companion books (visions, charges, pieces) via stacks.openBook and stores handles for the typed API methods. Implement createVision (rejects parentId, creates writ + companion doc atomically), createCharge (validates parent is vision-type, creates writ + companion doc atomically), createPiece (validates parent is charge or piece, creates writ + companion doc atomically). Lifecycle-coupling: implement a transition helper that updates both writ.phase and the doc's stage field together when called. Read/list/patch methods round-trip the companion docs by writ id.</action>
    <verify>pnpm --filter @shardworks/cartograph-apparatus build && pnpm --filter @shardworks/cartograph-apparatus typecheck</verify>
    <done>cartograph.ts compiles, builds, and exports the Plugin. Typed-API methods exist with the contracts from types.ts.</done>
  </task>
  <task id="t5">
    <name>Test the apparatus end-to-end</name>
    <files>packages/plugins/cartograph/src/cartograph.test.ts</files>
    <action>Add unit tests covering the acceptance criteria: writ-type registration (three types in clerk.listWritTypes() with expected configs); typed-API parent validation (positive and negative cases for each create method, with descriptive error messages on rejection); companion-book CRUD round-trip (create, read, patch, list); lifecycle coupling (transition writ to terminal phase via the typed API and verify the doc's stage field moves in lockstep). Use the in-memory Stacks backend and mock Clerk fixture pattern from astrolabe's test setup.</action>
    <verify>pnpm --filter @shardworks/cartograph-apparatus test</verify>
    <done>All cartograph tests pass; coverage spans the four acceptance criteria from the brief.</done>
  </task>
  <task id="t6">
    <name>End-to-end smoke test in a guild</name>
    <files>(none — this is verification)</files>
    <action>Verify the plugin works in a real guild by constructing a minimal guild.json config that declares cartograph as a plugin, instantiating the guild via the standard test scaffolding (or running a quick CLI smoke if simpler), and confirming: (a) startup is clean, (b) clerk.listWritTypes() shows vision/charge/piece, (c) the typed API can be invoked through the apparatus handle, (d) the books are queryable through stacks.</action>
    <verify>pnpm -w typecheck</verify>
    <done>Workspace typechecks; the cartograph package is built and ready for downstream consumers (vision-keeper agent runtime commission, CLI commission) to depend on.</done>
  </task>
</task-manifest>
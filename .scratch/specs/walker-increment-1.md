# Walker Increment 1 — Core, Fabricator, Clockwork Engines

Status: **Ready**

Complexity: **8**

Codex: nexus

## Authoritative Spec

The complete Walker design is at `docs/architecture/apparatus/walker.md`. The Fabricator design is at `docs/architecture/apparatus/fabricator.md`. This commission implements a subset — read both specs in full before starting.

---

## What already exists

- **The Stacks** — book storage, CDC (Phase 1 cascade + Phase 2 notification), `watch()` API. Fully operational.
- **The Clerk** — writ lifecycle, status transitions, query API. Fully operational.
- **The Scriptorium** — draft binding API (`openDraft`, `seal`, `abandonDraft`). Fully operational.
- **The Animator** — session launch and recording. Fully operational (session output/transcript capture is landing separately — not needed for this increment).
- **The Instrumentarium** — kit-contribution scanning pattern (the Fabricator follows the same model). Fully operational.
- **Plugin/apparatus infrastructure** — `requires`, `provides`, `supportKit`, kit/supportKit contribution scanning. All operational in nexus-core and Arbor.

---

## What to build

Two new packages, wired together:

### 1. The Fabricator (`@shardworks/fabricator-apparatus`)

A thin engine design registry. See `docs/architecture/apparatus/fabricator.md` for the full spec.

- **`EngineDesign` interface** — `id`, `run(givens, context)`. Exported from this package.
- **`EngineRunContext`** — `{ engineId: string, upstream: Record<string, unknown> }`. Exported from this package.
- **`EngineRunResult`** — `{ status: 'completed', yields: unknown } | { status: 'launched', sessionId: string }`. Exported from this package.
- **`FabricatorApi`** — `getEngineDesign(id: string): EngineDesign | undefined`.
- **Kit scanning** — `consumes: ['engines']`. Scan kit and supportKit contributions at startup via `plugin:initialized`, collecting engine designs into a `Map<string, EngineDesign>`. Follow the Instrumentarium's pattern for reactive kit-contribution scanning.
- **No support kit** — no books, no tools. Pure in-memory registry.
- **No guild.json config** needed.

### 2. The Walker (`@shardworks/walker-apparatus`)

The rig execution engine. See `docs/architecture/apparatus/walker.md` for the full spec.

**Data model:**
- `Rig` interface — `id`, `writId`, `status`, `engines[]`
- `EngineInstance` interface — `id`, `designId`, `status`, `upstream`, `givensSpec`, `yields`, `error?`, `sessionId?`, `startedAt?`, `completedAt?`
- `rigs` book in supportKit (with appropriate indexes)

**Walk function:**
- `WalkerApi` with `walk(): Promise<WalkResult | null>`
- `WalkResult` type with all four variants
- Priority ordering: collect > run > spawn
- `assembleGivensAndContext()` — givens from givensSpec only, upstream on context escape hatch
- Yield serialization validation (JSON-serializable check before storing)

**Static graph spawning:**
- `spawnStaticRig(writ, config)` — creates the five-engine pipeline from Walker config
- Queries the Clerk for ready writs with no existing rig

**Clockwork engine execution (inline):**
- When `design.run()` returns `{ status: 'completed', yields }` — store yields, mark engine completed, check for rig completion

**Quick engine execution (launch only — collection in this increment too):**
- When `design.run()` returns `{ status: 'launched', sessionId }` — store sessionId, mark engine `running`
- Collect step: read session record from sessions book by `engine.sessionId`, check for terminal status, populate yields

**CDC handler:**
- Phase 1 cascade on `rigs` book
- On rig → `completed`: call `clerk.transition(writId, 'completed', ...)` with seal yields
- On rig → `failed`: call `clerk.transition(writId, 'failed', ...)` with error info

**Engine failure:**
- Engine `failed` → rig `failed` (same transaction) → CDC fires → writ transitions
- Draft NOT abandoned on failure

**Operational tools:**
- `walk` tool — single step, returns WalkResult
- `walkContinual` tool — polling loop with configurable `pollIntervalMs`

**Configuration:**
- `guild.json["walker"]` — `role`, `pollIntervalMs`, `buildCommand`, `testCommand`
- Defaults: role=`"artificer"`, pollIntervalMs=`5000`

### 3. Engine implementations (this increment)

Only the two clockwork engines are fully implemented. The three quick engines are **stubs** that return `{ status: 'completed', yields: mockYields }` so the full pipeline can be tested end-to-end without the Animator.

**`draft` engine (real):** Opens a draft binding via the Scriptorium. Returns `DraftYields`. See the spec for the full implementation.

**`seal` engine (real):** Seals the draft binding via the Scriptorium. Returns `SealYields`. See the spec for the full implementation.

**`implement` engine (stub):** Returns `{ status: 'completed', yields: { sessionId: 'stub', sessionStatus: 'completed' } }`.

**`review` engine (stub):** Returns `{ status: 'completed', yields: { sessionId: 'stub', passed: true, findings: 'Stub review — no findings.', mechanicalChecks: [] } }`.

**`revise` engine (stub):** Returns `{ status: 'completed', yields: { sessionId: 'stub', sessionStatus: 'completed' } }`.

All five engines are contributed via the Walker's supportKit `engines` field. The Fabricator scans them at startup.

---

## What to validate

Tests should cover:

- **Fabricator:** kit scanning collects engine designs; `getEngineDesign` returns registered designs; unknown IDs return undefined
- **Walker lifecycle:** spawn rig from ready writ → walk through all five engines (with stubs) → rig completes → CDC transitions writ to completed
- **Priority ordering:** collect before run, run before spawn
- **Engine readiness:** engine only runs when upstream is completed
- **Clockwork execution:** yields stored, engine marked completed in same walk call
- **Quick engine launch + collect:** sessionId stored on engine, collect step reads session record, populates yields (test with a mock session in the sessions book)
- **Failure propagation:** engine failure → rig failure → writ transition to failed
- **Yield serialization:** non-JSON-serializable yields cause engine failure
- **givens/context assembly:** givens contain only givensSpec values, context.upstream contains upstream yields
- **Walk returns null:** when no work available

---

## What is NOT in scope

- Real quick engine execution (implement, review, revise) — those are stubs. Increments 2 and 3 make them real.
- Prompt assembly, mechanical checks, findings extraction
- Reviewer role registration
- Dynamic rig extension, origination, capability resolution
- Engine timeouts
- Concurrent rig processing

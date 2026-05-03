# Periodic tick for the Reckoner — X021 baseline
_Verbatim plan extracted from production guild for X021 baseline (planId w-moiy8hkv-dfb884cac01b)._

---

# Inventory — Periodic tick for the Reckoner

## Scope and blast radius

This commission is **internal to the Reckoner apparatus** plus a
soft (kit-contribution) edge with the Clockworks. No other apparatus
imports the Reckoner's CDC code path, so the removal blast radius is
narrowly contained inside `packages/plugins/reckoner/src/**`.

Two cross-cutting touches outside that tree:

1. **`@shardworks/clockworks-apparatus` kit surface** — the Reckoner
   becomes a new consumer of two existing kit types: `relays` (for
   the `reckoner.tick` handler) and `standingOrders` (for the
   `@every 60s` entry). Both are already-shipped substrates from the
   sibling commissions `w-moix4pe8` (kit-standing-orders) and the
   `relays` kit type that pre-dates them. The Reckoner contributes
   through its own `apparatus.supportKit` block — no Clockworks code
   changes required. Indirect dependency declaration: the Reckoner
   should add `recommends: ['clockworks']` to its apparatus descriptor
   so the dependency relation is visible to Arbor's topo sort and
   readers (concurrent doc updates needed in
   `docs/architecture/apparatus/reckoner.md` Dependencies block).

2. **Behavioral change visible to operators / petitioners** — held
   petition latency moves from "approved on the next CDC update of the
   writ" (≈ms after `setWritExt` returns) to "approved on the next
   tick after the petition is in `new`" (≤60s). This is documented
   non-negotiable in the brief; only relevant here as a doc-touch in
   the apparatus README.

## Affected files (Reckoner package)

- `packages/plugins/reckoner/src/reckoner.ts` — the heart of the
  change. Currently 1416 lines:
  - **Removed sections**: the `stacks.watch<WritDoc>('clerk',
    'writs', …)` subscription at the bottom of `start()` (lines
    1357–1362); the `handleWritsChange` function (lines 1111–1130)
    including the re-firing gate (D14 in current code); the
    `runCatchUpScan` function (lines 1146–1169); the call to
    `runCatchUpScan()` from the `phase:started` handler (line 1349);
    test-hook surface entries `handleWritsChange` and `runCatchUpScan`
    on `ReckonerTestHooks` (interface lines 250–256, hook-object lines
    1375–1376).
  - **Modified sections**: `runScheduler` (lines 906–1104) — currently
    takes a single `(writ, ext, now)` triple and builds
    `candidates: [writ]`. The brief prescribes a batch shape — the tick
    builds one `SchedulerInput` for the whole candidate set per fire.
    `considerWrit` (lines 795–876) — the brief says "becomes the
    per-writ branch invoked from the tick loop or its logic folds into
    the tick handler directly — implementer's call" (D5 in this plan).
    `start()` body — the `phase:started` handler stops calling
    `runCatchUpScan`. `apparatus.supportKit` — gains a `relays:
    [reckonerTickRelay]` slot and a `standingOrders: [{ schedule:
    '@every 60s', run: 'reckoner.tick' }]` slot.
  - **Untouched but adjacent**: `resolveActiveTargetPhase` (the
    type-aware target-phase resolver) is reused verbatim by the tick's
    approve path. `alreadyConsidered` (the `(writId,
    writUpdatedAt)` dedupe lookup) is reused verbatim. `resolveConfig`
    / `resolveSchedulerConfig` / `resolveActiveScheduler` are all
    reused verbatim. `buildReckoningRow` is reused with one new
    optional param (`tickEventId`) when present.

- `packages/plugins/reckoner/src/tick.ts` — **new file** holding the
  `createReckonerTickRelay()` factory and the pure tick-evaluation
  helper. Mirrors the
  `packages/plugins/clockworks/src/summon-relay.ts` /
  `packages/plugins/vision-keeper/src/decline-relay.ts` pattern:
  pure `relay()` definition plus an exported handler-body helper that
  takes its dependencies (clerk, stacks, reckoningsBook, registry,
  activeScheduler, resolveSchedulerConfig, resolveConfig,
  resolveActiveTargetPhase) by injection so unit tests can drive it
  without Clockworks. The `buildReckoner()` closure threads its state
  into the relay factory at apparatus boot time. Anchored in
  reckoner.ts as long as it stays small (~150 lines); separating to a
  sibling file follows the established pattern.

- `packages/plugins/reckoner/src/reckoner-cdc.test.ts` (937 lines) —
  **must be replaced**. Every test in this file asserts CDC-driven
  behavior (`hooks.handleWritsChange`, `setWritExt` Phase 2 dispatch
  triggering accept paths, the re-firing gate at D14). With CDC gone,
  none of those entry points exist. The behavioral cases the file
  enumerates (skip-not-in-new, skip-no-ext, disabled-source skip,
  unregistered-strict decline, unregistered-non-strict approve,
  registered-source approve, ext-restamp re-evaluation, CDC re-delivery
  idempotency, startup catch-up, withdrawal-mid-flight, type-aware
  target-phase resolution) all need re-expressing through the tick
  path. Most still apply (phase gate, ext gate, registered-source
  approve, idempotency, withdrawal-mid-flight, type-aware target);
  three change semantics or disappear (disabled-source skip changes
  meaning per the brief — see decisions; ext-restamp re-evaluation gate
  is gone with CDC; "startup catch-up" becomes "first tick after start
  picks up pre-existing held writs"). Recommended layout: replace
  with `reckoner-tick.test.ts` covering the surviving / changed cases
  via a `hooks.runTick(syntheticTimerEvent)` entry point.

- `packages/plugins/reckoner/src/reckoner-scheduler.test.ts` (942
  lines) — **most tests survive** but the entry point shifts from
  `fix.reckoner.petition(...)` triggering CDC dispatch to
  `hooks.runTick(...)` invocations. Specific tests that drive the
  scheduler error paths (validateConfig throw, evaluate throw,
  multi-decision per writ id, stranger writId, approve / defer /
  decline outcome mapping, weight threading) all need the entry to
  switch from "petition then observe immediate dispatch" to "petition
  then runTick then observe outcome". Some assertions (e.g. the defer
  test currently asserts "no row, no transition") may need to flip
  if D17 (defer-writes-row) is selected.

- `packages/plugins/reckoner/src/integration.test.ts` (288 lines) —
  asserts the same end-to-end accept flow through the public
  `petition()` helper. The setWritExt Phase 2 dispatch path no longer
  drives the auto-approve; the test must either run a tick after the
  petition lands, or assert the writ stays in `new` until the tick
  fires. The two existing test bodies need updating; both are short.

- `packages/plugins/reckoner/src/index.ts` — no changes expected.
  The `Scheduler` / `SchedulerInput` / `SchedulerDecision` /
  `CapacitySnapshot` / `HeldWrit` types are already exported.

- `packages/plugins/reckoner/src/types.ts` — no changes expected.
  `ReckoningDoc.tickEventId` is already declared (line 308; with
  comment that says "always absent on v0 rows" — concurrent doc
  updates needed: the comment should now say "stamped from the
  triggering `clockworks.timer` event id when the consideration was
  triggered by a tick; always absent on CDC-driven considerations
  which v0 no longer ships").

- `packages/plugins/reckoner/src/reckoner.test.ts` (not opened) —
  scope holds the pre-existing kit-registry tests (petitioner-source
  validation, seal lifecycle, etc.). These do not exercise the CDC
  handler and should pass unchanged.

- `packages/plugins/reckoner/src/schedulers/always-approve.ts` — no
  changes. The default scheduler keeps its shape; the only difference
  is that `evaluate` will now be handed a multi-element `candidates`
  array per tick rather than the per-call single-element array.

- `packages/plugins/reckoner/package.json` — no changes expected
  (kit contributions don't require new dependency declarations; the
  `relays` and `standingOrders` kit types live on the existing
  `@shardworks/clockworks-apparatus` package which is already
  resolvable through the existing dep graph).

- `packages/plugins/reckoner/README.md` — concurrent doc updates
  needed. The "Phase 2 CDC handler" subsection in the package summary
  must be rewritten to describe the tick. The "60s latency" trade
  should be visible. No deep restructure.

## Affected files (docs)

- `docs/architecture/apparatus/reckoner.md` — concurrent doc updates
  needed:
  - Top "v0 scope" callout still says "no CDC handler, no Lattice
    pulse emission, and no Reckonings book" — already wrong since the
    follow-on commissions shipped; the tick commission tightens it
    further by replacing CDC with a tick. Section needs a v1-ish
    rewrite.
  - `## Dependencies` block — add `recommends: ['clockworks']`
    (concurrent inline edit by this commission).
  - `## What the Reckoner does NOT do (in v0)` — remove "No CDC
    observer" line; replace with "No operator-configurable tick
    cadence" (brief calls this out and parks it as future work in
    `c-moixb74x`).
  - `## Schedulers` section — the "Per-evaluation config flow" /
    "Outcome mapping" / "Failure modes" sub-sections were written
    around the per-call CDC model; they need re-wording for the
    per-tick model (validateConfig throw skips the whole tick, not
    one writ; evaluate throw skips the tick; "decision carries a
    writId not in the candidate set" wording stays valid; etc.). The
    outcome-mapping table still applies.

- `docs/architecture/petitioner-registration.md` — only the sections
  that reference the CDC handler explicitly need a re-word. Most of
  the contract surface (Workflow 1 / Workflow 2, ext shape, registry
  semantics) is unchanged. Concurrent doc updates needed; spot-edit
  rather than restructure.

- `docs/architecture/reckonings-book.md` — the `tickEventId` section
  (lines 352–386) currently says "v0 always absent because the v0
  handler is CDC-only." That comment is wrong post-tick. The doc's
  prescription (stamp the triggering `clockworks.timer` event id on
  tick-driven considerations) becomes the actual behavior for the
  first time. Concurrent doc updates needed.

- `docs/architecture/clockworks.md` — the example block at line
  291 (`{ "schedule": "@every 30s", "run": "reckoner-tick" }`) is
  out-of-sync in two ways: relay name is `reckoner.tick` (dot, not
  hyphen) and the cadence is 60s in this commission. Pure example
  drift; concurrent doc updates needed if we touch the file, but
  not part of the touched set otherwise.

## Key types and interfaces (read-points, not copied verbatim)

- `Scheduler<TConfig>`, `SchedulerInput<TConfig>`, `SchedulerDecision`,
  `CapacitySnapshot`, `HeldWrit` — `packages/plugins/reckoner/src/types.ts`,
  ~340–460. Already shipped by the registry commission. The tick
  builds one `SchedulerInput` per fire; capacity is `{}` per the v0
  stub.
- `ReckoningDoc` (incl. `tickEventId?: string`) —
  `packages/plugins/reckoner/src/types.ts`, ~277–338. The optional
  `tickEventId` field is what the tick stamps on every row written.
- `ReckonerExt`, `Priority`, `ComplexityTier` — same file, ~24–138.
  Reused verbatim.
- `ReckoningOutcome` enum (`'accepted' | 'deferred' | 'declined' |
  'no-op'`) — same file, ~215. The current Reckoner emits only
  `accepted` and `declined`; if D17 (defer-writes-row) goes through,
  this commission becomes the first writer of `deferred` rows in tree.
- `ReckoningDeclineReason` enum
  (`'malformed' | 'duplicate' | 'policy_violation' | 'source_banned' |
  'source_unregistered' | 'other'`) — same file, ~225. The disabled-
  source path may newly emit `source_banned` (currently unused) per
  D2.
- `RelayDefinition`, `RelayHandler`, `RelayContext`, `GuildEvent` —
  `packages/plugins/clockworks/src/relay.ts`. The tick is a
  `RelayDefinition`; the handler signature is
  `(event: GuildEvent | null, context: RelayContext) => void |
  Promise<void>`. The tick reads `event.id` for `tickEventId`.
- `StandingOrder` —
  `packages/plugins/clockworks/src/types.ts`, ~116. The kit
  contribution is one of these: `{ schedule: '@every 60s', run:
  'reckoner.tick' }`.
- `ClockworksKit.standingOrders?: StandingOrder[]` and
  `ClockworksKit.relays?: RelayDefinition[]` — same file, ~505–541.
  The Reckoner's apparatus.supportKit fills both slots (alongside the
  existing `books`, `tools` if any, `events` if any, and `schedulers`
  slot already populated).
- `WritDoc`, `WritPhase`, `WritTypeConfig` — Clerk surface; the tick
  reuses `clerk.transition`, `clerk.show` (indirect via the reads),
  and `getWritTypeConfig` (already used by `resolveActiveTargetPhase`).

## Adjacent patterns

- **Stdlib relay co-located with apparatus** — Both Clockworks's
  `summon-relay.ts` and vision-keeper's `decline-relay.ts` are
  contributed via `apparatus.supportKit.relays`. The Reckoner's
  `reckoner.tick` follows the same factory pattern, inlined below
  verbatim from `decline-relay.ts` (the narrower of the two —
  closer in shape to what the tick handler needs). **Apply this
  shape identically to `tick.ts`; do not Read either source file
  for the pattern.**

  ```ts
  // Source: packages/plugins/vision-keeper/src/decline-relay.ts (excerpt)
  import type { GuildEvent, RelayDefinition } from '@shardworks/clockworks-apparatus';
  import { relay } from '@shardworks/clockworks-apparatus';

  /**
   * Build the relay's `RelayDefinition`. Exported so the apparatus boot path
   * can wire it into `supportKit.relays`, and so unit tests can drive the
   * handler directly.
   */
  export function createDeclineRelay(): RelayDefinition {
    return relay({
      name: DECLINE_RELAY_NAME,
      description:
        'Logs a line whenever a vision-keeper.snapshot writ transitions into cancelled.',
      handler: (event, _context) => {
        const entry = matchVisionKeeperDecline(event);
        if (entry === null) return;
        const reason = entry.resolution ?? '(no resolution recorded)';
        console.log(
          `[vision-keeper] decline-feedback: writ ${entry.id} (source=${VISION_KEEPER_SOURCE}) was declined — ${reason}`,
        );
      },
    });
  }
  ```

  The summon-relay variant of the same shape (516 lines, more
  complex because it does writ-binding, prompt hydration, and
  circuit-breaking) wraps the same `relay({ name, description,
  handler })` call but with an `async` handler and richer
  validation. The reckoner-tick handler is closer to the
  decline-relay shape: a synchronous body that consults the
  closure for state and dispatches per-writ work — no animator
  invocation, no template hydration. The factory wrapper above
  is what to copy.
- **Closure-scoped apparatus state shared with relay handler** — the
  Reckoner's tick handler needs `clerk`, `stacks`, `reckoningsBook`,
  `registry`, `schedulerRegistry`, `activeScheduler`, `resolveConfig`,
  `resolveSchedulerConfig`, `resolveActiveTargetPhase`,
  `alreadyConsidered`, `buildReckoningRow`. All these live in the
  `buildReckoner()` closure today. Two options for sharing them with
  a sibling-file `tick.ts`: (a) expose a small "tick context"
  parameter object the closure constructs and hands to the tick
  factory; (b) keep the tick logic in `reckoner.ts` directly. The
  summon-relay precedent uses option (a) — it lives in a sibling file
  and reaches for state via `guild()` rather than via a passed-in
  context. The Reckoner's tick reaches for state that is not on the
  guild API surface (the registry maps, the activeScheduler handle,
  the `alreadyConsidered` lookup), so option (a) — small context
  object — is the natural fit.
- **`apparatus.supportKit.standingOrders`** — no in-tree consumer
  yet; the kit-standing-orders commission shipped the substrate but
  the only sample call sites are in `clockworks.test.ts` /
  `dispatcher.test.ts` /
  `scheduler-integration.test.ts`. The Reckoner's contribution is
  the **first apparatus to ship a default standing order** (per the
  sibling commission's brief). The pattern is: declare the array on
  `apparatus.supportKit.standingOrders` exactly like
  `apparatus.supportKit.relays` and `apparatus.supportKit.events`.
- **In-tick dedupe with the existing `(writId, writUpdatedAt)`
  identity** — the Reckoner's existing per-action idempotency uses
  this pair. The tick consults `alreadyConsidered` per writ before
  invoking the scheduler so a tick that re-evaluates an
  unchanged-since-last-considered writ is a no-op. This matches the
  Sentinel's `alreadyEmitted` pattern — same shape.
- **Per-source `orderIndex` / `source` on standing-order entries** —
  the kit-standing-orders commission's `SourcedStandingOrder` shape
  carries source attribution into dispatcher / scheduler error
  messages. The Reckoner's contribution will surface as `source =
  'reckoner'` in those messages because it's the contributing plugin
  id. No Reckoner-side work; visible only in operator-facing error
  text on misconfiguration.

## Existing context

- The brief's design click `c-moiw5wkv` is concluded (sealed). It
  prescribes the relay name (`reckoner.tick`), the kit-contribution
  path, the hard-coded `@every 60s` schedule (D-5), the per-tick
  fixed sequence (D-6), and the "tick replaces CDC entirely" rule
  (D-7). No live siblings.
- `c-moixb74x` is the parked future-improvement for operator-
  configurable tick cadence — out of scope here.
- The Reckoner's `reckoner-cdc.test.ts` and `integration.test.ts` are
  the load-bearing behavioral test surfaces. The cdc test file is
  almost entirely scaffolding around CDC-driven entry points and
  re-firing-gate semantics that disappear with this commission.
- The `reckonings-book.md` doc is the contract surface for the
  `Reckonings` row shape; `tickEventId` was reserved for exactly
  this scenario.

## Doc/code discrepancies

(All the following are in files this commission will already touch,
so they are surfaced here as **concurrent doc updates needed**, not
lifted as observations.)

- `docs/architecture/apparatus/reckoner.md` top callout still says
  "v0 ships the contract surface only — no CDC handler, no Lattice
  pulse emission, and no Reckonings book". That has been wrong for
  multiple commissions. The tick commission either leaves it (it's
  out of touch radius) or catches up the callout block when editing
  Dependencies / Schedulers sections.
- The `tickEventId?: string` field in `types.ts` (line 308) carries a
  comment ending with "The v0 handler is CDC-only, so this field is
  always absent on v0 rows." The tick commission flips that — the
  field is now stamped on every tick-driven row.
- The Reckoner README (lines 41–58) describes the Phase 2 CDC
  handler in detail. After this commission the handler is gone; the
  description should describe the tick.
- The example in `clockworks.md` line 291 uses `reckoner-tick` (with
  hyphen) as the relay name. The brief's relay name is
  `reckoner.tick` (with dot). Out-of-touch-radius drift; concurrent
  edit if we land in clockworks.md, otherwise let the next commission
  that touches the doc fix it.


---

## Scope

### S1



### S2



### S3



### S4



---

## Decisions

### D1

**Options:**
- `reckoner.tick`: Dotted form, mirrors brief verbatim and the scheduler/petitioner id grammar.
- `reckoner-tick`: Hyphenated form (used in the out-of-date `clockworks.md` example block at line 291).

**Recommended:** `reckoner.tick`. Brief pre-empts: "Add a `reckoner.tick` relay handler." Dotted form is the brief's verbatim spelling and matches the apparatus's other contributed-id grammars.

**Selected:** `reckoner.tick` (patron confirm: #13 — dotted form matches the apparatus's existing contributed-id grammar precedent.)

### D2

**Options:**
- `silent-skip-carry-forward`: Preserve the current per-action behavior — debug log only, no row, no transition. Diverges from the brief's prescription; petitioners would never see a Reckonings record for a disabled-source rejection.
- `decline-row-no-transition`: Write a `declined` Reckonings row but leave the writ in `new`. Lets disabled-source act as a quiet hold the operator can lift later by removing the source from disabledSources (next tick re-evaluates and may approve).
- `decline-row-and-cancel`: Write a `declined` Reckonings row carrying `declineReason: 'source_banned'` and the source name in `remediationHint`, transition the writ to `cancelled` (mirroring the unregistered-strict decline path).

**Recommended:** `decline-row-and-cancel`. Brief explicitly prescribes a decline row on the disabled-source gate. Matching the unregistered-strict decline path (decline row + transition to cancelled) keeps the two source-gate failure modes symmetric; `source_banned` is the type's purpose-built decline reason for exactly this case. Diverges from current per-action silent-skip but the brief overrides precedent.

**Selected:** `decline-row-and-cancel` (patron confirm: #13 — unregistered-strict decline path set the source-gate failure precedent (decline row + cancel); symmetry across source gates follows from the first live writer.)

### D3

**Options:**
- `no-row-carry-forward`: Preserve the current per-action behavior — defer is silent. Existing tests pass; the brief's "row only" wording is read as the active path's row vs. transition contrast.
- `row-with-deferReason-other`: Write a `deferred` row carrying `deferReason: 'other'`, `deferNote: <decision.reason>`, and `firstDeferredAt`/`lastDeferredAt` set to the consideredAt timestamp (mirrors the decline path's use of `'other'` + `remediationHint`). Other defer-metadata fields (deferUntil, deferSignal, deferCount) stay absent.
- `row-with-deferReason-other-and-count`: Same as `row-with-deferReason-other` but also tracks `deferCount` by reading the writ's prior deferred-row count from the book and incrementing. More work; surfaces a reasonable counter for operators.

**Recommended:** `row-with-deferReason-other`. Brief explicitly says "outcome recorded as a Reckonings row only" for defer. `deferReason: 'other'` plus the decision's reason in `deferNote` mirrors the decline path's `declineReason: 'other'` + `remediationHint` mapping byte-for-byte, so the row schema stays consistent across outcome variants. `deferCount` adds a per-row read against the book — a real cost for v0 with no consumer asking for it; defer until a real consumer surfaces.

**Selected:** `row-with-deferReason-other` (patron confirm: #18 — deferCount has no second consumer asking for it; defer the abstraction slot.)

### D4

**Options:**
- `sibling-tick-ts`: New file `packages/plugins/reckoner/src/tick.ts` exporting `createReckonerTickRelay()` and an exported pure-helper `runReckonerTick(deps)` for unit-testability. The Reckoner's closure threads its registry maps / activeScheduler / book handles into the relay factory at apparatus boot.
- `fold-into-reckoner-ts`: Keep tick logic inline inside `buildReckoner()`. The closure has direct access to all the state; no parameter object needed. File grows by ~150–200 lines.

**Recommended:** `sibling-tick-ts`. Mirrors the established stdlib-relay pattern (summon-relay.ts, decline-relay.ts). The pure-helper export gives the test suite a deterministic entry point that doesn't require booting Clockworks. reckoner.ts is already large; adding the tick to it makes the file harder to navigate. The minor ergonomic cost (a small dependency-injection context object) is worth the file-organization win.

**Selected:** `sibling-tick-ts` (patron confirm: #13 — summon-relay.ts and decline-relay.ts established the sibling-file precedent for stdlib relay handlers.)

### D5

**Options:**
- `recommends-clockworks`: Add `recommends: ['clockworks']` to the apparatus descriptor. Documents the soft dependency, gives Arbor's topo sort a hint, and lets readers see the relation. Apparatus boots fine without Clockworks (held petitions just never get evaluated).
- `requires-clockworks`: Add `requires: ['clockworks']`. Forces Clockworks to be installed; held petitions never sit unevaluated. But cross-apparatus required dependency for what is conceptually an integration point would tighten the Reckoner's installable footprint without earning operator value.
- `no-declaration`: Leave `requires`/`recommends` unchanged. The kit-contribution mechanism flows through `ctx.kits('relays')` regardless of declared deps, so the apparatus still registers its relay. Operators get no signal that Clockworks matters.

**Recommended:** `recommends-clockworks`. Brief is silent. Three Defaults: extend the API at the right layer — declaring the soft dependency is the natural way to surface the integration without forcing operator footprint. Mirrors Clockworks's own `recommends: ['animator', 'loom']` precedent for relay-handler dependencies. The Reckoner still boots cleanly without Clockworks installed (the relay just never fires).

**Selected:** `recommends-clockworks` (patron confirm: #13 — Clockworks's own `recommends: ['animator', 'loom']` set precedent for declaring soft relay-handler dependencies.)

### D6

**Options:**
- `stamp-when-event-id-present`: Read `event?.id` in the tick handler. When non-empty string, stamp every Reckonings row this tick with `tickEventId: event.id`. When absent (test paths driving the handler with `event = null`), omit `tickEventId` from the rows.
- `always-stamp-with-fallback`: Stamp `tickEventId` with `event?.id ?? 'unknown-tick'` so every tick-driven row carries a non-null tick id. Loses the doc's distinction between scheduled-tick rows (real id) and CDC-driven rows (absent), but CDC is being removed so the distinction collapses anyway.
- `do-not-stamp`: Skip the `tickEventId` field on rows for now; let a follow-on commission add it once a downstream consumer asks. The field stays declared in the schema; rows just don't populate it.

**Recommended:** `stamp-when-event-id-present`. The Reckonings doc reserves `tickEventId` for exactly this scenario (the comment in `types.ts` line 304–308 says "absent on v0 rows" because v0 was CDC-only). Stamping when present and omitting when absent matches the doc's prescription byte-for-byte. The fallback option pollutes rows with synthetic ids that have no joinable counterpart in `clockworks/events`. Skipping entirely leaves the field's existing reservation unfulfilled and forces a follow-on commission for a one-line change.

**Selected:** `stamp-when-event-id-present` (patron confirm: #2 — synthesizing an 'unknown-tick' fallback is silent fallback that pollutes rows with non-joinable ids; absence is meaningful.)

### D7

**Options:**
- `dedupe-pre-evaluate`: Filter the candidate set against `alreadyConsidered` before building `SchedulerInput`. The scheduler only sees writs that need consideration. Repeated ticks against unchanged writs short-circuit before paying scheduler cost; matches the existing per-action sequence.
- `dedupe-pre-write`: Pass every held writ to evaluate; dedupe at row-write time so the row write is a no-op for writs already considered at their current updatedAt. Scheduler sees a polluted candidate set (writs whose decisions already exist), but its global view is technically complete.

**Recommended:** `dedupe-pre-evaluate`. Matches the carry-forward intent the brief signals ("Existing per-action idempotency check (`writId` × `updatedAt`) carries forward"). Aligns with the registry commission's "Dedupe before paying the scheduler cost" pattern. A scheduler that sees a candidate set polluted with already-decided writs would emit decisions that the row-write layer then silently discards — wasted work and confusing to authors of priority-walk-style schedulers down the road.

**Selected:** `dedupe-pre-evaluate` (patron confirm: #2 — pre-write dedupe has the scheduler emit decisions that get silently discarded, hiding drift the patron needs to see.)

### D8

**Options:**
- `silent-skip-with-defense`: Keep the `if (!activeScheduler) return;` guard at the top of the tick handler. Skips silently if a tick somehow fires pre-seal; production never trips the branch but test paths can drive it without firing phase:started.
- `fail-loud`: Throw a `[reckoner] tick: activeScheduler not resolved — phase:started has not fired` error at handler entry. Catches misconfiguration / test-fixture bugs immediately.
- `no-guard`: Remove the guard entirely. Lean on the implicit ordering invariant (Clockworks starts after Reckoner's phase:started). Crashes with a TypeError if the invariant breaks, which is also fail-loud — just a worse message.

**Recommended:** `silent-skip-with-defense`. Belt-and-suspenders against an unanticipated ordering bug; harmless overhead. Matches the existing per-call pattern. Test paths that drive the relay directly without firing phase:started get a deterministic no-op rather than a TypeError. Three Defaults says fail-loud, but pre-seal in production is impossible through the standing-order entry path; the only realistic trigger is test fixtures, where a silent-skip is more useful (lets tests assert the pre-seal contract).

**Selected:** `fail-loud` (patron override: #2 — silent-skip-with-defense is exactly the silent fallback that hides ordering drift; fail-loud catches misconfiguration immediately, and tests can assert the throw.)

### D9

**Options:**
- `carry-forward`: Same shape as the per-call path: filter-and-warn on stranger writIds (apply only the in-scope decisions); fail-loud-skip the entire tick on any multi-decision-per-writ. The whole tick produces no rows for any writ when the multi-decision rule trips.
- `isolate-failures`: Filter-and-warn on stranger writIds (carry-forward). On multi-decision-per-writ, skip just that writ (no row, no transition for that one), and continue applying decisions for sibling writs.
- `fail-loud-on-stranger-too`: Both stranger writIds and multi-decision-per-writ fail-loud-skip the entire tick. Tighter contract but throws away batch progress on misbehaviors that the per-call path tolerates.

**Recommended:** `carry-forward`. Brief silent. The existing per-call semantics are documented and tested; the tick should behave identically so scheduler authors can rely on the same contract regardless of evaluation cadence. Fail-loud-skip on multi-decision-per-writ matches the existing per-call path and is the safer choice when the scheduler signals confusion about its own decision set — better to write nothing than to apply ambiguous decisions. `isolate-failures` would diverge from established semantics with no observed problem driving the change.

**Selected:** `carry-forward` (patron confirm: #13 — the per-call path's filter-and-warn / fail-loud-skip semantics are documented and tested precedent; tick should match so scheduler authors see one contract.)

### D10

**Options:**
- `early-return`: Detect empty candidate set after the held-writs query. Skip the scheduler call entirely. No Reckonings rows; the tick returns silently.
- `call-evaluate-with-empty-array`: Build a `SchedulerInput` with `candidates: []` and call evaluate anyway. The scheduler returns no decisions; no rows get written; the result is observationally identical but pays a needless scheduler call cost.

**Recommended:** `early-return`. Brief pre-empts: "writes nothing — no Reckonings rows, no errors." Early-return is cheaper, matches the no-op contract more obviously, and keeps the scheduler from being invoked with an input that may surface as a peculiar shape (some scheduler implementations might not gracefully handle an empty candidates array).

**Selected:** `early-return` (patron confirm: No principle speaks — confirming the primer.)

### D11

**Options:**
- `hook-runTick`: Add a `hooks.runTick(event?: GuildEvent | null)` test-only hook that drives the tick handler directly with a synthetic event id (or null). Mirrors the existing `runCatchUpScan` / `handleWritsChange` pattern: tests can exercise every behavioral case without booting Clockworks.
- `hook-callRelayHandler`: Expose the registered relay handler directly via a hook (`hooks.getTickRelay()`). Tests invoke `relay.handler(syntheticEvent, syntheticContext)`. More work in tests; less encapsulation.
- `boot-clockworks-fixture`: Build a fixture that boots Clockworks alongside Reckoner and lets the scheduler pass fire the tick. Most realistic but slow and brittle; mirrors `clockworks/scheduler-integration.test.ts` only for one-off integration coverage.

**Recommended:** `hook-runTick`. Mirrors the existing in-package hook pattern and gives tests a one-line entry to the tick handler with deterministic event-id stamping (or null for the no-event-id branch). Boot-Clockworks should still be exercised by one integration test (`integration.test.ts` already mirrors the petition→consideration→row flow) but the broad behavioral matrix runs through the hook for speed and isolation.

**Selected:** `hook-runTick` (patron confirm: #13 — `runCatchUpScan` / `handleWritsChange` established the in-package test-hook precedent for driving handlers without booting upstream apparatuses.)

---

## Observations

### obs-1 — Reckoner held-writ query is type-agnostic on the literal phase 'new'

The brief prescribes "held petitions are writs in their initial-equivalent phase carrying `ext.reckoner`" and tells the implementer to "use the same query shape today's `runCatchUpScan` uses." Today's query in `packages/plugins/reckoner/src/reckoner.ts` lines 1149–1152 is a literal `where: [['phase', '=', 'new']]` against `clerk/writs`. This works for the `mandate` writ type and for any plugin-registered type that happens to name its initial-classification state `'new'` (the integration test's `task` type does), but breaks for any future writ type that uses a non-`'new'` initial state. The two phrases in the brief disagree on this point: "initial-equivalent phase" suggests the query should iterate Clerk's writ-type registry and union the initial-classification phases per type; "the same query shape today's runCatchUpScan uses" prescribes the literal. The brief picks the latter for this commission, but the disagreement is a hidden bug waiting on the first non-`'new'`-initial-phase writ type to land.

A correct query would either (a) iterate `clerk.listWritTypes()` collecting every state with `classification === 'initial'` and union the phase names into the where clause, or (b) move to a per-type loop calling `clerk.list({ type, phase })` for each declared initial state. Option (b) is closer to the existing apparatus's idiomatic Clerk usage; option (a) requires a single `find` call and is closer to the existing direct-read shape.

This is a real cross-cutting design question (Clerk's writ-type registry vs. Reckoner's held-writ query semantics) and a latent hazard (introducing a writ type with a non-`'new'` initial state would silently exclude its held petitions from every tick), not addressable inline by this commission's artificer because the brief explicitly carries forward the literal-phase query. Lift to a follow-on mandate so a curator can decide whether to harden the query before any non-`'new'`-initial-phase writ type ships.

### obs-2 — Disabled-source decline path needs `source_banned` reason and resolution-string contract

D2 in this plan settles that the disabled-source gate produces a decline row in the tick (carrying `declineReason: 'source_banned'`) and transitions the writ to `cancelled`, mirroring the unregistered-strict path. Two contract points need explicit pinning that the brief does not call out:

1. **Resolution string format.** The unregistered-strict path uses `[reckoner] declined: source 'X' is not registered (enforceRegistration: true).` (reckoner.ts line 841). The disabled-source path needs a parallel string — e.g. `[reckoner] declined: source 'X' is in disabledSources.` — so operators searching `clerk/writs.resolution` for declined-by-source can grep both kinds with one regex. Decision: same prefix shape, different reason clause.

2. **Behavioral envelope around hot-edited disabledSources.** Today's per-call CDC handler reads `disabledSources` per call so an operator can hot-edit the list and see the effect on the next CDC update. After the tick switch, the same hot-edit semantics carry forward via the per-tick re-read. But there is a subtle semantics difference: an operator who adds `vision-keeper.snapshot` to `disabledSources` mid-tick now sees existing `vision-keeper.snapshot` held writs cancelled on the next tick, where today they sit silently in `new` until the operator removes them. The brief signals this as a desired behavior change ("A held petition whose source becomes disabled mid-flight gets a decline row on the next tick"), but the operator-visible difference — mass-cancellation by config edit — is worth surfacing as a deliberate contract point in the apparatus doc and observable to tests.

This is a real DRY/consolidation opportunity (two source-gate decline paths sharing a resolution-string template + symmetric Reckonings row construction) AND a real cross-cutting design question (the operator-visible "hot-edit cancels existing held writs" behavior). Both addressable inside this commission's scope, but worth a curator look in case the patron wants the disabled-source path to remain less destructive (decline-no-cancel, the alternative D2 option) or to require a different reason taxonomy (e.g. distinguish `source_banned` from `source_disabled_for_now`).

---

## Specification

# Periodic tick for the Reckoner

## Intent

Switch the Reckoner from CDC-driven per-writ-update evaluation to a
periodic tick. Add a `reckoner.tick` relay handler that evaluates every
currently-held petition through the configured scheduler in one batch
on each fire, kit-contribute a standing order at `@every 60s` targeting
that relay, and remove the existing CDC evaluation surface entirely.

## Rationale

The CDC-driven model evaluates one writ per update and cannot give a
scheduler the global candidate-set view that priority-walk and any
capacity-aware scheduler beyond v0 needs. The tick is the canonical
path the registry commission (`w-moiy7bmo`) was shaped against; it
unifies pre-existing held writs and newly-arrived ones through one
evaluation surface. The visible cost is held-petition latency: the v0
always-approve scheduler now approves on the next tick (≤ 60s) instead
of on the writ's CDC update (≈ms after `setWritExt`). That trade is
accepted in the originating brief — the next-scheduler value depends
on the global-view path being canonical.

## Scope & Blast Radius

This commission lives **inside the Reckoner apparatus**
(`packages/plugins/reckoner/src/**`) plus a kit-contribution surface to
`@shardworks/clockworks-apparatus` that uses already-shipped substrates
(the `relays` kit type and the `standingOrders` kit type from
`w-moix4pe8`). No Clockworks code changes are required.

Cross-cutting concerns the implementer must handle, named by concern
rather than by file:

- **Reckoner core source** is partially rewritten. The CDC subscription,
  startup catch-up scan, per-writ-update entry, and the test-surface
  hooks for those paths must all disappear. The active scheduler
  resolution, source/disabled gates, dedupe lookup, type-aware target-
  phase resolution, and Reckonings row construction are reused; the
  shape of the call to the active scheduler shifts from per-writ to
  per-tick batch.
- **Apparatus kit contribution** gains a `relays` slot (the new
  `reckoner.tick` relay) alongside its existing `events`/`books`/
  `schedulers` slots, and a new `standingOrders` slot carrying
  `{ schedule: '@every 60s', run: 'reckoner.tick' }`. The Reckoner
  becomes the first apparatus shipping a default standing order.
- **Apparatus dependency declaration** gains `recommends: ['clockworks']`
  to surface the soft dependency to readers and Arbor's topo sort. The
  Reckoner still boots without Clockworks installed (the relay simply
  never fires).
- **Behavioral test surface** must be re-expressed end-to-end against
  the tick path. The existing `reckoner-cdc.test.ts` is built on entry
  points that no longer exist; every behavioral case the brief
  enumerates must be exercised through the tick. Some scheduler-level
  tests in `reckoner-scheduler.test.ts` survive but their entry shifts
  from "petition then observe immediate dispatch" to "petition then
  drive a tick." The integration test must run a tick after petitioning
  to observe the approve flow.
- **Documentation drift** in four docs must be corrected concurrent
  with the code change: the Reckoner architecture doc (top callout,
  Dependencies block, "What the Reckoner does NOT do" list, Schedulers
  section), the Reckonings book doc (`tickEventId` section currently
  says "always absent on v0"), the petitioner-registration doc (any
  CDC-handler references), and the Reckoner README (Phase 2 CDC
  description). The `tickEventId` field comment in `types.ts` also
  needs updating. Treat doc drift as part of the commission, not
  follow-on work.
- **Out-of-radius drift** in `docs/architecture/clockworks.md` line ~291
  uses `reckoner-tick` (hyphen) where this commission ships
  `reckoner.tick` (dot). Fix it if the file is otherwise touched;
  otherwise let it ride.

Verify the full code blast radius with a grep across the monorepo for
`handleWritsChange`, `runCatchUpScan`, `considerWrit`, and the
`stacks.watch('clerk', 'writs')` subscription before declaring the CDC
removal complete.

## Decisions

| #   | Decision                                                                         | Default                                                                                                                                                                       | Rationale                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Relay name in the Clockworks registry                                            | `reckoner.tick` (dotted form)                                                                                                                                                 | Matches the apparatus's existing contributed-id grammar (scheduler ids, petitioner sources). Originating brief uses this spelling verbatim.                                 |
| D2  | Disabled-source gate behavior in the tick                                        | Write a `declined` Reckonings row carrying `declineReason: 'source_banned'` and the source name in `remediationHint`; transition the writ to its cancelled target phase.      | Symmetric with the unregistered-strict source-gate decline path. `source_banned` is the type's purpose-built reason for exactly this case.                                  |
| D3  | Scheduler `defer` outcome handling                                               | Write a `deferred` Reckonings row carrying `deferReason: 'other'` and the decision's reason in `deferNote`; no transition. Other defer-metadata fields stay absent.           | Mirrors the decline path's `'other'` + `remediationHint` mapping byte-for-byte. `deferCount`/`deferUntil`/`deferSignal` await a real consumer.                              |
| D4  | Tick relay file location                                                         | New sibling file `packages/plugins/reckoner/src/tick.ts` exporting a relay factory plus a pure handler-body helper for unit tests.                                            | Mirrors the established stdlib-relay pattern (`summon-relay.ts`, `decline-relay.ts`). Pure helper gives tests a deterministic entry without booting Clockworks.             |
| D5  | Apparatus dependency declaration                                                 | Add `recommends: ['clockworks']` to the Reckoner's apparatus descriptor.                                                                                                      | Documents the soft dependency, surfaces the relation to readers and Arbor's topo sort. Mirrors Clockworks's own `recommends: ['animator', 'loom']`.                         |
| D6  | `tickEventId` stamping on Reckonings rows                                        | Stamp `tickEventId` from the triggering `clockworks.timer` event id when present; omit the field when absent (e.g. test paths driving the handler directly with `null`).     | Matches the Reckonings book doc's reservation byte-for-byte. Synthesizing a fallback would pollute rows with non-joinable ids; absence is meaningful.                       |
| D7  | Dedupe placement                                                                 | Filter the candidate set against the `(writId, writUpdatedAt)` dedupe lookup **before** building `SchedulerInput`. Already-considered writs never reach the scheduler.        | Carries forward the existing per-call sequence. Pre-write dedupe would have the scheduler emit decisions the row-write layer silently discards, hiding drift.               |
| D8  | Pre-seal tick behavior (`activeScheduler` not yet resolved)                      | **Throw** at handler entry (`[reckoner] tick: activeScheduler not resolved — phase:started has not fired`). Tests can assert the throw.                                       | Patron override (#2 — silent-skip is exactly the silent fallback that hides ordering drift). Production never trips it; test fixtures get a deterministic loud signal.      |
| D9  | Stranger writIds and multi-decision-per-writ from the scheduler                  | Filter-and-warn on stranger writIds (apply only in-scope decisions). Fail-loud-skip the **entire tick** on any multi-decision-per-writ — no rows for any writ in that tick.   | Identical to the per-call semantics scheduler authors already rely on. Skipping the tick on multi-decision is safer than applying ambiguous decisions.                      |
| D10 | Empty candidate set                                                              | Early-return after the held-writs query when the set is empty. Skip the scheduler call. No rows; no errors.                                                                   | Brief-prescribed behavior: "writes nothing — no Reckonings rows, no errors." Cheaper and avoids handing schedulers a peculiar empty-array input shape.                      |
| D11 | Test entry point for driving the tick handler                                    | Add a `hooks.runTick(event?: GuildEvent \| null)` test-only hook that invokes the tick handler directly with a synthetic event id (or null).                                  | Mirrors the `runCatchUpScan` / `handleWritsChange` precedent for in-package handler hooks. Boot-Clockworks is reserved for the integration test only.                       |

The originating brief also pins four design points the implementer
must follow as written — these are not choices, they are constraints:

- **Schedule** is hard-coded `@every 60s` in the kit contribution. No
  `reckoner.tickSchedule` config knob in this commission.
- **CDC removal is total.** The `clerk/writs` subscription, the
  `runCatchUpScan` startup pass, and the per-writ-update entry into
  `considerWrit` all disappear. The tick is the only path that drives
  scheduler evaluation.
- **Per-fire sequence is fixed:** resolve active scheduler →
  re-read+validate `reckoner.schedulerConfig` (validateConfig throw =
  fail-loud, skip the tick) → query held petitions (initial-phase writs
  carrying `ext.reckoner`, using the same query shape today's
  `runCatchUpScan` uses) → apply source/disabled gates (failing writs
  produce decline rows and skip the scheduler call) → build
  `SchedulerInput { candidates, capacity, now, config }` with the v0
  capacity stub → call `evaluate` → apply each decision (approve →
  transition to active target via `resolveActiveTargetPhase`, decline →
  transition to cancelled target, defer → no transition) → append one
  Reckonings row per writ considered.
- **Standing order has no `id` field**, per the additive-merge model
  from the kit-standing-orders commission. Operators can append their
  own standing orders but cannot disable or override this one.

## Acceptance Signal

1. `pnpm -w typecheck` and `pnpm -w lint` pass with zero new warnings.
2. `pnpm -w test --filter @shardworks/reckoner-apparatus` passes,
   including new tick-driven tests for: empty-candidate ticks, first
   tick after start picking up pre-existing held writs, evaluate-throw
   isolation (apparatus stays up, no rows written), disabled-source
   mid-flight decline+cancel, repeated-tick idempotency, type-aware
   target-phase resolution, withdrawal-mid-flight, defer outcome
   writes a row with no transition, fail-loud on pre-seal tick.
3. `grep -r "handleWritsChange\|runCatchUpScan\|stacks.watch.*clerk.*writs" packages/plugins/reckoner/src/`
   returns no matches.
4. `grep -r "reckoner-tick\|reckoner\.tick" packages/ docs/` shows the
   relay name spelled `reckoner.tick` everywhere except in source
   strings the implementer deliberately leaves alone.
5. The Reckoner integration test petitions a writ, fires one tick,
   and observes the approve transition + Reckonings row with a
   populated `tickEventId`.
6. The four affected docs (Reckoner architecture, Reckonings book,
   petitioner-registration, Reckoner README) read accurately for the
   tick model — no remaining "v0 ships no CDC handler" or "v0 always
   absent" wording.

## Existing Patterns

- **Stdlib relay co-located with apparatus, contributed via supportKit.**
  `packages/plugins/clockworks/src/summon-relay.ts` and
  `packages/plugins/vision-keeper/src/decline-relay.ts` are the templates.
  Both define `relay({ name, description, handler })` in a sibling file
  and are wired through their owning apparatus's `supportKit.relays`
  slot. The Reckoner's tick relay should follow the same shape.
- **Closure-scoped state shared with a sibling-file relay handler.**
  The Reckoner's tick handler needs access to state that lives in the
  `buildReckoner()` closure (registry maps, the resolved active
  scheduler, `alreadyConsidered`, the Reckonings book handle, the
  config/scheduler-config resolvers, `resolveActiveTargetPhase`,
  `buildReckoningRow`). Prefer a small dependency-injection context
  object the closure constructs and passes into a relay-factory call —
  the pure helper exported alongside the factory takes the same
  context object so unit tests can drive it without booting Clockworks.
- **`alreadyConsidered((writId, writUpdatedAt))` dedupe.** The Sentinel
  uses an analogous `alreadyEmitted` lookup; the per-call CDC path in
  the Reckoner uses this exact one. Reuse it verbatim, called per writ
  before the candidate set is handed to the scheduler.
- **Kit-contributed standing orders** were shipped by `w-moix4pe8` but
  no apparatus consumes them yet. The kit-side test files
  (`clockworks.test.ts`, `dispatcher.test.ts`,
  `scheduler-integration.test.ts`) are the only sample call sites; the
  contribution shape is `apparatus.supportKit.standingOrders =
  [{ schedule, run }]`.
- **Scheduler outcome → Reckonings row mapping**, including the
  `'other'` + `remediationHint` pattern, is already established in the
  per-call `runScheduler`. The defer-outcome row construction
  (D3) follows the same template, swapping `declineReason` for
  `deferReason` and `remediationHint` for `deferNote`.
- **In-package test-only hooks** (`ReckonerTestHooks`) currently expose
  `handleWritsChange` and `runCatchUpScan`. Both go away; `runTick`
  takes their place using the same pattern.

## What NOT To Do

- **Do not ship an operator-configurable tick cadence.** No
  `reckoner.tickSchedule` knob. The schedule is hard-coded `@every 60s`
  in the kit contribution. Future improvement is parked.
- **Do not ship a tick disable / pause mechanism.** Operators have no
  config-side way to suspend the tick in this commission.
- **Do not extend `CapacitySnapshot`.** It remains the v0 stub from the
  registry commission; capacity-tracking lands when a capacity-aware
  scheduler does.
- **Do not support multi-scheduler dispatch in one tick.** One active
  scheduler per Reckoner instance.
- **Do not emit new framework events on tick.** The auto-wired
  Clockworks book events on `reckoner/reckonings` continue to fire as
  they do today; no new emissions from this commission.
- **Do not generalize the held-writ query** to iterate Clerk's writ-type
  registry for non-`'new'` initial phases. The brief explicitly carries
  forward the existing literal-phase query shape; the type-agnostic
  generalization is observed and lifted as a separate concern.
- **Do not fold the disabled-source path into the unregistered-strict
  helper** if it requires changing the unregistered-strict resolution-
  string format. Build the disabled-source decline using the same shape
  but with its own resolution-string template.
- **Do not retain `runScheduler`'s per-writ candidate construction.**
  The tick builds one `SchedulerInput` for the whole candidate set per
  fire — the per-writ `candidates: [writ]` shape is being replaced, not
  preserved.

<task-manifest>
  <task id="t1">
    <name>Add the reckoner.tick relay and standing-order kit contribution</name>
    <files>packages/plugins/reckoner/src/tick.ts (new); packages/plugins/reckoner/src/reckoner.ts (apparatus.supportKit additions, recommends declaration)</files>
    <action>Create the new sibling-file relay following the summon-relay.ts / decline-relay.ts pattern. Define the relay factory and a pure handler-body helper that accepts a dependency context (clerk, stacks, reckoningsBook, registry, activeScheduler accessor, config/scheduler-config resolvers, resolveActiveTargetPhase, alreadyConsidered, buildReckoningRow). Wire the relay into apparatus.supportKit.relays and add a single standing-order entry to apparatus.supportKit.standingOrders with schedule '@every 60s' and run 'reckoner.tick' (no id field). Add `recommends: ['clockworks']` to the apparatus descriptor. The handler must throw fail-loud when activeScheduler is unresolved (D8); early-return on empty candidate set (D10); dedupe candidates against alreadyConsidered before building SchedulerInput (D7); stamp tickEventId from event.id when present, omit when absent (D6). Do not yet implement decision application or row writing — that belongs in t2.</action>
    <verify>pnpm -w typecheck</verify>
    <done>The new file exists, the apparatus exports the kit contribution, types check, and the relay is reachable through apparatus boot. No production behavior wired yet.</done>
  </task>

  <task id="t2">
    <name>Implement tick-side scheduler invocation, gates, and decision/row application</name>
    <files>packages/plugins/reckoner/src/tick.ts; packages/plugins/reckoner/src/reckoner.ts (any helper exposure needed by the tick); packages/plugins/reckoner/src/types.ts (only if a type adjustment is needed for the deferred-row path)</files>
    <action>Inside the tick handler, complete the per-fire sequence: resolve activeScheduler; re-read and validate reckoner.schedulerConfig (fail-loud-skip on validateConfig throw); query held petitions using the same find-by-phase shape today's runCatchUpScan uses, then filter to those with ext.reckoner; apply source/disabled gates inline — for each writ failing the gate, write a Reckonings decline row and transition to the cancelled target phase. Disabled-source rows carry declineReason 'source_banned' and the source name in remediationHint (D2); unregistered-strict rows preserve their existing reason and resolution-string format. After dedupe, build one SchedulerInput { candidates, capacity, now, config } with the v0 capacity stub, then call evaluate inside a try/catch that fail-loud-skips the entire tick on throw (no rows). Filter-and-warn on stranger writIds; fail-loud-skip the whole tick on multi-decision-per-writ (D9). Apply each decision: approve → transition to active target via resolveActiveTargetPhase; decline → transition to cancelled target; defer → no transition. Append one Reckonings row per writ considered, mirroring the per-call shape; defer rows use deferReason 'other' with the decision's reason in deferNote (D3); tickEventId stamped per D6.</action>
    <verify>pnpm -w typecheck && pnpm -w lint</verify>
    <done>The tick handler implements the full per-fire sequence end-to-end. Source gates, scheduler call, decision application, and row writing all flow through the new path.</done>
  </task>

  <task id="t3">
    <name>Remove the CDC evaluation surface</name>
    <files>packages/plugins/reckoner/src/reckoner.ts (the stacks.watch subscription, handleWritsChange, runCatchUpScan, runCatchUpScan call from phase:started, ReckonerTestHooks entries for the removed handlers); any sibling helpers used only by those paths</files>
    <action>Delete the CDC observer and its catch-up scan entirely. Remove the ReckonerTestHooks entries that exposed the CDC handler and the catch-up scan. Replace the test-hook surface with a `runTick(event?: GuildEvent | null)` hook that invokes the tick handler's pure helper directly (D11). If runScheduler's per-writ shape is no longer reachable after this removal, drop or refactor it; the tick owns scheduler invocation now. Audit the file for any leftover references to the removed paths (imports, comments, dead code) and clean them up. Do not leave shim functions behind — every consumer should reach the tick path or nothing.</action>
    <verify>pnpm -w typecheck && grep -rn "handleWritsChange\|runCatchUpScan\|stacks.watch.*clerk.*writs\|considerWrit" packages/plugins/reckoner/src/</verify>
    <done>The grep returns no matches (or only matches the implementer deliberately re-uses inside the tick path under different names). Typecheck passes. The Reckoner has exactly one evaluation entry: the tick.</done>
  </task>

  <task id="t4">
    <name>Refresh the Reckoner test surface against the tick path</name>
    <files>packages/plugins/reckoner/src/reckoner-cdc.test.ts (replace, likely renamed to reckoner-tick.test.ts); packages/plugins/reckoner/src/reckoner-scheduler.test.ts (entry-point shifts); packages/plugins/reckoner/src/integration.test.ts (insert tick fire after petition); packages/plugins/reckoner/src/reckoner.test.ts (verify still passes)</files>
    <action>Replace the CDC test file. The new behavioral matrix exercises every case the brief enumerates, all driven through hooks.runTick: empty-candidate ticks (no rows, no errors); first tick after start picking up pre-existing held petitions; evaluate-throw isolation; disabled-source mid-flight producing a decline+cancel; repeated-tick idempotency at unchanged updatedAt; type-aware target-phase resolution; withdrawal-mid-flight; defer outcome writing a row with no transition; pre-seal tick throwing fail-loud. In reckoner-scheduler.test.ts, shift every "petition then observe immediate dispatch" entry to "petition then runTick then observe outcome". Flip the existing defer-test assertion to expect a deferred row with deferReason 'other' (D3 changes the prior "no row" assertion). In integration.test.ts, insert a runTick call after the petition and assert the approve transition and Reckonings row with a populated tickEventId. Verify reckoner.test.ts (the kit-registry tests) still passes unchanged.</action>
    <verify>pnpm -w test --filter @shardworks/reckoner-apparatus</verify>
    <done>All Reckoner package tests pass. The new tick test file covers the brief's behavioral cases. Scheduler tests and the integration test drive their flows through the tick path.</done>
  </task>

  <task id="t5">
    <name>Update affected documentation and the tickEventId field comment</name>
    <files>docs/architecture/apparatus/reckoner.md; docs/architecture/reckonings-book.md; docs/architecture/petitioner-registration.md; packages/plugins/reckoner/README.md; packages/plugins/reckoner/src/types.ts (the tickEventId comment); docs/architecture/clockworks.md (only the example-block drift, if touched)</files>
    <action>Rewrite the Reckoner architecture doc's top callout, Dependencies block (add recommends: ['clockworks']), "What the Reckoner does NOT do" list (remove "No CDC observer", add "No operator-configurable tick cadence"), and Schedulers section (per-tick semantics for validateConfig throw, evaluate throw, decision application). Rewrite the Reckonings book doc's tickEventId section to describe the populated-when-event-id-present rule (D6) and remove the "v0 always absent" claim. Spot-edit the petitioner-registration doc to remove or rephrase any CDC-handler references. Rewrite the Reckoner README's Phase 2 CDC handler subsection to describe the tick. Update the tickEventId field comment in types.ts to reflect the new "stamped from the triggering clockworks.timer event id when triggered by a tick" semantics. If clockworks.md is otherwise touched, fix the reckoner-tick → reckoner.tick spelling drift in its example block; otherwise leave it alone.</action>
    <verify>grep -rn "no CDC handler\|always absent on v0\|reckoner-tick" docs/ packages/plugins/reckoner/</verify>
    <done>The grep returns no stale claims. The four docs and the type comment read correctly for the tick model. Documentation drift is closed concurrent with the code change.</done>
  </task>

  <task id="t6">
    <name>End-to-end verification</name>
    <files>none (verification only)</files>
    <action>Run the full repo typecheck, lint, and test suite. Run the audit greps from the Acceptance Signal section to confirm CDC removal is total and the relay name is spelled consistently. Boot the Reckoner with and without Clockworks installed (via existing fixture patterns) to confirm boot succeeds in both cases — without Clockworks, the tick simply never fires.</action>
    <verify>pnpm -w typecheck && pnpm -w lint && pnpm -w test</verify>
    <done>The full repo is green. Audit greps return clean. The acceptance signal items are all satisfied.</done>
  </task>
</task-manifest>

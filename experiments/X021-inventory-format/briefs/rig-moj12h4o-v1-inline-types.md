# Periodic tick for the Reckoner

## Intent

Switch the Reckoner from CDC-driven per-writ-update evaluation to a
periodic tick. Add a `reckoner.tick` relay handler that evaluates every
currently-held petition through the configured scheduler in one batch
on each fire, kit-contribute a standing order at `@every 60s` targeting
that relay, and remove the existing CDC evaluation surface entirely.

## Type signatures (inlined)

The following type definitions are inlined verbatim from source at codex SHA b92dc905. **Do not Read these source files** (`packages/plugins/clockworks/src/types.ts`, `packages/plugins/clockworks/src/relay.ts`, `packages/plugins/reckoner/src/types.ts`) for the types listed below — the definitions here are authoritative for this commission.

### Clockworks relays + standing-orders surface

```ts
/**
 * Runtime context handed to a relay's handler alongside the event.
 *
 * Only carries values that are not already obtainable from `event` or
 * from the `guild()` singleton. Notably:
 *   - `home` is included because it is a common handler need and the
 *     handler may run in a context where calling `guild()` is awkward.
 *   - `params` carries the standing order's optional `with:` block so a
 *     single relay can be reused by multiple orders with different
 *     configuration.
 */
export interface RelayContext {
  /** Absolute path to the guild home directory. */
  home: string;
  /**
   * Parameters from the standing order's `with:` block. Empty object when
   * the order did not declare one.
   */
  params: Record<string, unknown>;
}

/**
 * The relay handler signature.
 *
 * `event` is nullable because the dispatcher exposes a direct-invocation
 * surface (no triggering `GuildEvent`) alongside the standing-order path.
 * Authors should treat `event` as possibly-null and guard accordingly.
 *
 * May be sync or async — the dispatcher always awaits. Signals failure by
 * throwing; return values are not consumed.
 *
 * **Idempotency contract.** Handlers MUST be safe to invoke more than
 * once for the same triggering event. The Clockworks dispatch sweep
 * (read-pending → invoke → patch-processed) is not atomic across
 * processes, so when callers overlap (e.g. the unattended daemon and a
 * manual `nsg clock run`, or a process restart mid-replay) the same
 * event may be handed to a relay's handler again. Side effects must
 * tolerate this — guard externally-observable work with a dedupe
 * identity carried on the event payload, mirror the Sentinel's
 * `pulse.context` pattern (see
 * `docs/architecture/apparatus/sentinel.md`), or shape the handler so
 * a second invocation is a no-op. The contract is qualitative: design
 * for "may run more than once", not for a specific bound.
 */
export type RelayHandler = (
  event: GuildEvent | null,
  context: RelayContext,
) => void | Promise<void>;

/**
 * A fully-defined relay — the return type of `relay()`.
 *
 * Registered by the Clockworks under `name`; looked up by the dispatcher
 * (future task) via `resolveRelay(name)` and invoked as
 * `handler(event, context)`.
 */
export interface RelayDefinition {
  /** Relay name — registration key. Any non-empty string is accepted. */
  readonly name: string;
  /**
   * Optional human-readable description. Not consumed by the dispatcher;
   * reserved for future CLI / observability surfaces.
   */
  readonly description?: string;
  /**
   * The handler. See `RelayHandler` for the signature contract — `event`
   * is nullable to accommodate direct invocation.
   */
  readonly handler: RelayHandler;
}

```

### Clockworks: standing-order shape and kit slots

```ts
/**
 * A standing order — a registered response to an event or schedule.
 *
 * A standing order names exactly one trigger (either `on:` for an
 * event-driven order or `schedule:` for a time-driven order) and
 * exactly one relay to invoke (`run:`), with an optional parameter
 * object (`with:`) handed to the relay as `RelayContext.params`.
 *
 * Per commission decision D1 the TypeScript type leaves both `on:`
 * and `schedule:` optional — the canonical-shape XOR rule (exactly
 * one of `on:`/`schedule:` must be present) lives in the
 * standing-order validator. The same module is the load-time owner
 * for ruling out earlier sugar forms (`summon:`, `brief:`,
 * flat-spread params), unknown top-level keys, and invalid `with:`
 * shapes.
 */
export interface StandingOrder {
  /**
   * Event name to subscribe to — exact match against `EventDoc.name`.
   * Mutually exclusive with `schedule:`; exactly one must be present.
   */
  on?: string;
  /**
   * Time-trigger expression. Either `@every <N><s|m|h>` or a standard
   * 5-field unix cron expression. Mutually exclusive with `on:`;
   * exactly one must be present. The validator parse-checks the value
   * at guild.json load time using the shared schedule parser, so
   * malformed expressions fail loud at boot rather than at first fire.
   */
  schedule?: string;
  /** Name of the relay to invoke when the order fires. */
  run: string;
  /**
   * Optional parameter object passed through to the relay handler as
   * `RelayContext.params`. Plain object only; null, arrays, and
   * primitives are rejected by the validator.
   */
  with?: Record<string, unknown>;
}

/**
 * Kit contribution interface for plugins that extend the Clockworks.
 *
 * Plugins contribute relays — named event-handler functions resolved by
 * the dispatcher via a standing order's `run:` field — by exporting a
 * kit whose `relays` field is an array of `RelayDefinition` values
 * produced by the `relay()` factory.
 *
 * Inherits `requires` / `recommends` from the framework `Kit` base so a
 * kit can declare that its relay handlers depend on other apparatuses
 * being installed.
 *
 * @example
 * ```typescript
 * import { relay } from '@shardworks/clockworks-apparatus';
 *
 * export default {
 *   recommends: ['nexus-clockworks'],
 *   relays: [
 *     relay({
 *       name: 'log-event',
 *       handler: async (event) => { console.log(event.name); },
 *     }),
 *   ],
 * } satisfies ClockworksKit;
 * ```
 */
export interface ClockworksKit extends Kit {
  /**
   * Relay handlers contributed under the `relays` kit type. Optional —
   * a `ClockworksKit` may carry only `requires` / `recommends` from the
   * framework base, in which case it is a metadata-only contribution.
   */
  relays?: RelayDefinition[];
  /**
   * Event declarations contributed under the `events` kit type. Either
   * a flat record of event-name → `EventSpec`, or a pure function of
   * the `StartupContext` returning the same record. Plugin-declared
   * events are framework-owned; operator-defined events live in
   * `guild.json` under `clockworks.events`. The Clockworks merges both
   * layers at `start()` and consults the merged set per call to
   * `validateSignal`.
   */
  events?: EventsKitContribution;
  /**
   * Default standing orders contributed under the `standingOrders` kit
   * type. Each entry is a {@link StandingOrder} with the same canonical
   * shape as `guild.json` `clockworks.standingOrders` — every kit
   * contribution is validated through the shared standing-order
   * validator at apparatus boot.
   *
   * Kit-contributed orders are layered with operator-defined orders
   * additively (`[...kit, ...operator]`) at dispatch time. There is no
   * id, no override, no disable, no collision detection — identical
   * entries simply produce two dispatches.
   *
   * Kit contributions are sealed at apparatus `start()`; operators
   * editing `guild.json` continue to hot-edit the operator layer
   * without restart, but updating a kit-contributed default requires
   * an apparatus restart (matching the existing schedule-table
   * lifecycle).
   */
  standingOrders?: StandingOrder[];
}

```

### Reckoner: scheduler-input shape (the tick builds one of these per fire)

```ts
/**
 * A held writ — a writ in `new` phase carrying `ext.reckoner`.
 *
 * Vocabulary alias for `WritDoc` used at scheduler-input read sites
 * to make intent explicit. There is no runtime invariant beyond what
 * the apparatus already guarantees at the call site (phase + ext
 * gates run before the scheduler is invoked); the alias is purely
 * documentary so a reader of `SchedulerInput` knows the candidate
 * shape without chasing back through the rule sequence.
 */
export type HeldWrit = WritDoc;

/**
 * Forward-compatible capacity slot threaded into `SchedulerInput`.
 *
 * Empty in v0 — the slot exists so the scheduler interface does not
 * have to grow a new positional argument when a future commission
 * adds capacity tracking (concurrent-active counts, per-source
 * quotas, queue-depth observations). Schedulers that do not consume
 * capacity simply ignore the field.
 */
export interface CapacitySnapshot {
  /** Reserved for future capacity-tracking commissions. v0 ships no fields. */
  [key: string]: unknown;
}

/**
 * The outcome a scheduler emits for a held writ. Mirrors the three
 * substantive Reckonings outcomes:
 *
 * - `'approve'` — drive the writ out of `new` to its type's active
 *   target and append an `accepted` Reckonings row.
 * - `'defer'`   — leave the writ in `new`. No transition, no row
 *   in v0 (deferred rows require richer reason metadata than the
 *   `SchedulerDecision` shape declares).
 * - `'decline'` — drive the writ to `cancelled` with the decision's
 *   `reason` recorded as the resolution string and append a
 *   `declined` Reckonings row carrying `declineReason: 'other'` plus
 *   the reason in `remediationHint`.
 */
export type SchedulerOutcome = 'approve' | 'defer' | 'decline';

/**
 * One scheduler decision targeting one held writ.
 *
 * `writId` identifies the candidate; `outcome` selects the
 * disposition; `reason` is a human-readable lineage string the
 * apparatus persists alongside the decision (resolution string for
 * declines, `remediationHint` for declined Reckonings rows, or a
 * grep-able marker on accepted rows). `weight` is an optional
 * scheduler-emitted score the apparatus threads onto the resulting
 * Reckonings row when present.
 */
export interface SchedulerDecision {
  /** The held writ this decision applies to. Must match a candidate from the input. */
  writId: string;
  /** The scheduler's selected outcome. */
  outcome: SchedulerOutcome;
  /** Human-readable lineage. Persisted on Reckonings rows where applicable. */
  reason: string;
  /** Optional scheduler-emitted weight. Threaded through to the Reckonings row when present. */
  weight?: number;
}

/**
 * Argument shape for `Scheduler.evaluate()`.
 *
 * The Reckoner samples `now` once at the call boundary so the row id
 * and `consideredAt` stay consistent within a single consideration
 * (D33). `config` is the validated, scheduler-narrowed view of the
 * `reckoner.schedulerConfig` block — the apparatus runs
 * `validateConfig` immediately before each `evaluate` call (D17) so
 * each invocation sees the freshest config.
 */
export interface SchedulerInput<TConfig = unknown> {
  /** The held writs the scheduler is being asked to consider. */
  candidates: readonly HeldWrit[];
  /** Forward-compatible capacity slot. Empty in v0. */
  capacity: CapacitySnapshot;
  /** Sampling timestamp from the apparatus call boundary. */
  now: Date;
  /** Validated config slice — narrowed by `Scheduler.validateConfig` when present. */
  config: TConfig;
}

/**
 * A scheduler — pluggable selection policy contributed via the
 * `schedulers` kit-contribution type.
 *
 * Each registered scheduler declares an `id` of the form
 * `{contributingPluginId}.{kebab-suffix}`, a human-readable
 * `description`, an `evaluate` function that takes a
 * `SchedulerInput` and returns one or more `SchedulerDecision`s, and
 * an optional `validateConfig` narrower the apparatus calls per
 * evaluation when the operator has supplied a `reckoner.schedulerConfig`
 * block. The Reckoner resolves a single active scheduler at startup
 * from `guild.json reckoner.scheduler` (defaults to
 * `reckoner.always-approve` when unset).
 *
 * Schedulers reach for shared guild state (Stacks book handles, Clerk
 * helpers) via `guild()` rather than constructor injection — the
 * direct-instance shape mirrors Fabricator's `EngineDesign` registry
 * precedent.
 */
export interface Scheduler<TConfig = unknown> {
  /** Fully-qualified id of the form `{pluginId}.{kebab-suffix}`. */
  id: string;
  /** Human-readable description of the scheduling policy. */
  description: string;
  /** Run the policy against the candidate set and emit decisions. */
  evaluate(input: SchedulerInput<TConfig>): Promise<readonly SchedulerDecision[]>;
  /**
   * Optional config narrower. Called per evaluation immediately
   * before `evaluate`; throws are caught by the apparatus, logged
   * fail-loud, and skip the call without writing a row or
   * transitioning the writ.
   */
  validateConfig?(raw: unknown): TConfig;
}

```

### Reckoner: row shape (with tickEventId)

```ts
/**
 * Outcome enum for a Reckonings record. v0 of the CDC handler emits
 * only `'accepted'` (after a successful `new → active` transition) and
 * `'declined'` (after a `new → cancelled` transition driven by the
 * source-unregistered + `enforceRegistration: true` rule). The other
 * two values are reserved for future commissions.
 *
 * See: docs/architecture/reckonings-book.md §"Outcome enum".
 */
export type ReckoningOutcome = 'accepted' | 'deferred' | 'declined' | 'no-op';

/**
 * One row in the Reckonings book — the Reckoner's evaluation journal.
 *
 * Every meaningful consideration produces one record. A record
 * with `outcome: 'accepted'` corresponds to a `new → active` phase
 * transition; `'declined'` to a `new → cancelled` transition; the
 * other two outcomes are reserved for future commissions.
 *
 * The flat optional layout (every reason field at the top level)
 * intentionally trades type-purity for index-friendliness — the
 * architecture doc notes the iff-outcome invariant is writer-enforced
 * by the Reckoner and consumer types decode against a discriminated
 * union. See `docs/architecture/reckonings-book.md` §"Record body".
 */
export interface ReckoningDoc {
  /** Index signature required to satisfy the Stacks `BookEntry` constraint. */
  [key: string]: unknown;
  /** Unique id (`rk-<base36_ts>-<hex>`). Sortable by creation time. */
  id: string;
  /** The Clerk writ this record is about (the held petition). */
  writId: string;
  /**
   * Forward-compatible extension to the contract shape: the
   * triggering writ's `updatedAt` value, captured at consideration
   * time. Used for the `(writId, writUpdatedAt)` dedupe identity
   * (D6/D23). Not declared in `reckonings-book.md`'s illustrative
   * schema; the doc's "every meaningful field named and filterable"
   * ethos justifies storing it as a top-level field rather than
   * burying it under a context blob.
   */
  writUpdatedAt: string;
  /** Lean projection: `ext.reckoner.source`. */
  source: string;
  /** Lean projection: `ext.reckoner.priority.visionRelation`. */
  visionRelation: ReckoningVisionRelation;
  /** Lean projection: `ext.reckoner.priority.severity`. */
  severity: ReckoningSeverity;
  /** Outcome enum — drives the discriminated-union reason fields. */
  outcome: ReckoningOutcome;
  /**
   * Triggering Clockworks event id, when the consideration was
   * triggered by a scheduling tick. Absent for considerations
   * triggered by a CDC event on `clerk/writs`. The v0 handler is
   * CDC-only, so this field is always absent on v0 rows.
   */
  tickEventId?: string;
  /** ISO timestamp when the Reckoner completed this consideration. */
  consideredAt: string;
  // ── Outcome-keyed reason metadata (flat optionals, writer-enforced) ──
  /** Populated iff `outcome === 'declined'`. */
  declineReason?: ReckoningDeclineReason;
  /** Optional remediation hint accompanying a decline. */
  remediationHint?: string;
  /** Populated iff `outcome === 'deferred'`. */
  deferReason?: ReckoningDeferReason;
  /** Optional defer-until ISO timestamp. */
  deferUntil?: string;
  /** Optional defer wake-up event pattern. */
  deferSignal?: string;
  /** Running deferral counter for this writ. */
  deferCount?: number;
  /** First-seen-as-deferred ISO timestamp. */
  firstDeferredAt?: string;
  /** Most-recent deferral ISO timestamp. */
  lastDeferredAt?: string;
  /** Optional freeform short note on a deferral. */
  deferNote?: string;
  /**
   * Optional scheduler-emitted weight projected onto the row when a
   * `SchedulerDecision` carried one. Forward-compatible with
   * future weighted-priority schedulers; absent for the v0
   * always-approve scheduler. The Reckoner's row writer threads the
   * value through verbatim — no normalization, no defaulting.
   */
  weight?: number;
}

```

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

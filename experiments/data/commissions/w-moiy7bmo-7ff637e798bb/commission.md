# Scheduler kit-contribution registry for the Reckoner

## Intent

Add a kit-static scheduler registry to the Reckoner. Plugins (including
the Reckoner's own kit) contribute `Scheduler` implementations under a
new `schedulers` kit type; the Reckoner walks contributions at start,
validates id grammar, seals the registry at `phase:started`, and
resolves a single active scheduler via `guild.json reckoner.scheduler`.
Replaces today's hardcoded `evaluateScheduler` stub with a
registry-resolved call. The CDC-driven evaluation flow stays in place
for now — only the scheduler-resolution mechanism changes.

## Motivation

Today's Reckoner has a hardcoded private `evaluateScheduler` function
that always returns `'accepted'` (a v0 stub). The Reckoner's design
assumes pluggable schedulers — different selection policies
(always-approve, priority-walk, future cost-aware schedulers) plug in
via kit contributions, with the operator picking one per guild. This
brief lays the substrate.

The first concrete consumer beyond the always-approve default is the
Reckoner's own tick relay (separate brief, depending on this one) — but
the registry itself is independent of any specific consumer. Standing
up the registry first lets the tick brief focus purely on the
tick-specific concerns (relay handler, kit-contributed standing order,
CDC removal).

## Non-negotiable decisions

### Scheduler interface — direct-instance, no factory wrapper

Schedulers are contributed as direct instances (mirroring Fabricator's
EngineDesign pattern), not as factories. They reach for state and
services via `guild()` at evaluate time — no DI from Reckoner core. The
shape:

    interface Scheduler<TConfig = unknown> {
      id:           string;       // {pluginId}.{kebab-suffix}
      description:  string;
      evaluate(input: SchedulerInput<TConfig>): Promise<readonly SchedulerDecision[]>;
      validateConfig?(raw: unknown): TConfig;
    }

    interface SchedulerInput<TConfig> {
      candidates: readonly HeldWrit[];
      capacity:   CapacitySnapshot;
      now:        Date;
      config:     TConfig;
    }

    interface SchedulerDecision {
      writId:  string;
      outcome: 'approve' | 'defer' | 'decline';
      reason:  string;
      weight?: number;
    }

`TConfig` is a TypeScript ergonomic; core stores schedulers as
`Scheduler<unknown>` and trusts each scheduler's `validateConfig` to
produce its expected shape.

`CapacitySnapshot` is a stub for v0 (empty type or a single placeholder
field). Future commissions fill in real slot/budget tracking when a
capacity-aware scheduler ships.

Source: c-moisx6fx.

### Registry lifecycle — kit-static, sealed at start

Mirrors the Reckoner's existing petitioner-registry pattern. Plugins
contribute via a new `schedulers` kit type (an array of `Scheduler`
instances). The Reckoner walks `ctx.kits('schedulers')` at start;
id grammar `{pluginId}.{kebab-suffix}` is validated; duplicate-id is
fail-loud naming both contributing kits; the registry is sealed at
`phase:started`.

Per-plugin-load-cycle framing applies — kits don't hot-reload. Default
schedulers contributed by the Reckoner's own kit are treated identically
to user-contributed ones.

Source: c-moisx6fx.

### Default scheduler — `reckoner.always-approve` ships in this commission

Always-approve is the v0 default, contributed by the Reckoner's own
kit. Its `evaluate` returns one `outcome: 'approve'` decision per
candidate writ; no `validateConfig` (any value accepted-and-ignored).

`reckoner.priority-walk` is **out of scope** for this commission — its
design uses the priority-dimension surface and warrants its own brief.
This commission ships exactly one default scheduler.

Source: c-moisx6fx.

### Selector resolution — `guild.json reckoner.scheduler`

At `phase:started`, after registry seal:

1. Read `reckoner.scheduler` from `guild.json`.
2. Unset/absent → default to `reckoner.always-approve`. Logged at info.
3. Set but unregistered → fail-loud at startup, listing all registered ids.
4. Resolved scheduler reference cached for the duration of the seal.

Source: c-moisx6fx.

### Per-call config flow — re-read per evaluation

On each call into the scheduler (today: per CDC update; future: per tick):

1. Re-read `reckoner.schedulerConfig` from `guild.json` (matches the
   existing `resolveConfig` re-read pattern).
2. If the resolved scheduler defines `validateConfig`, call it. Throw →
   log fail-loud and skip the evaluation.
3. Validated config goes into `SchedulerInput.config`; `evaluate` is
   called.

`schedulerConfig` typing at the Reckoner core surface is `unknown` —
opaque pass-through. Validation lives entirely inside each scheduler's
`validateConfig`. No central schema registry; schedulers choose their
own validation library.

Source: c-moisx6fx.

### Failure modes — all fail-loud where shown

| Failure | Behavior |
|---|---|
| Duplicate scheduler id across kits | hard error at startup, names both kits |
| `reckoner.scheduler` references unregistered id | hard error at startup, lists registered ids |
| `validateConfig` throws | log fail-loud, skip the evaluation |
| `evaluate` throws | log fail-loud, skip the evaluation; no decisions applied, no Reckonings rows written |
| `evaluate` returns decisions for non-candidate writ ids | log + ignore those decisions |
| `evaluate` returns multiple decisions for one writ id | log fail-loud, skip the evaluation |

Source: c-moisx6fx.

### CDC-driven evaluation continues unchanged

The existing CDC handler keeps driving evaluation per writ update; only
the call-site swaps from the hardcoded `evaluateScheduler` to the
registry-resolved scheduler. The `considerWrit` rule sequence
(skip / disabled / source-check / scheduler-evaluate) stays.
Tick-driven evaluation is a separate commission that depends on this
one.

In the v0 always-approve world, the Reckoner's observable behavior is
unchanged — every held petition gets approved on its CDC update — but
the resolution mechanism is now extensible.

Source: c-moisx6fx, c-moiw5wkv (downstream consumer).

## Out of scope

- **Tick-driven evaluation.** Separate commission; depends on this one
  plus the Clockworks kit-contributed standing-orders substrate.
- **`reckoner.priority-walk` scheduler.** Separate brief.
- **Multi-scheduler dispatch within one Reckoner instance.** Layered
  routing is future work.
- **Lifecycle hooks beyond `evaluate` + `validateConfig`.** No
  `onTickStart` / `onApprove` / etc.
- **Async scheduler initialization.** Direct-instance pattern has no
  init step; lazy-init on first evaluate is allowed but no central
  support.
- **Hot-reloading schedulers.** Kit-static seal means swap requires
  apparatus restart.
- **Real `CapacitySnapshot` content.** Stub for v0; fill in when a
  capacity-aware scheduler lands.

## References

- **c-mod99ris** — Reckoner design parent.
- **c-moisx6fx** — design click for this commission (sealed).
- **c-moiw5lvp** — umbrella for the tick-registration follow-on.
- **c-moiw5wkv** — tick relay brief that depends on this commission.
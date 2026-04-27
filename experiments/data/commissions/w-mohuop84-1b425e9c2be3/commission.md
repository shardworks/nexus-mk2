# Events kit infrastructure and validator replacement

## Intent
Introduce a plugin-contributable events kit (`supportKit.events`) on the Clockworks plugin, replacing today's hardcoded `RESERVED_EVENT_NAMESPACES` const + `guild.json`-only declaration model. Plugins declare their event vocabulary via the kit; Clockworks merges plugin contributions with `guild.json` overrides into a single authoritative set; the signal validator and CLI both consume it through `ClockworksApi`. The CLI's hand-mirrored validator copy is removed; the framework CLI keeps its plugin-package-free discipline by going through the running guild's apparatus API.

## Motivation
Today event names are governed by an 8-entry hardcoded const that lives in two places (canonical in the Clockworks signal-validator module, hand-mirrored in the framework CLI's signal command), with operator-only declarations in `guild.json clockworks.events`. New plugins claiming a prefix have to either edit the hardcoded const or declare events one-by-one in `guild.json`. Type comments in the Clockworks types module promise that "framework events are declared by the plugins that produce them" but no such mechanism exists. Symptoms include namespace gaps for the `book.` and `reckoning.` prefixes (a current spoofing vector against framework CDC events), repeated observation-set surfacings of the same drift, and the test-asserted lockstep maintenance burden between the canonical const and the CLI mirror.

This commission delivers the foundation that the rest of the events redesign depends on; subsequent commissions migrate per-plugin emit sites onto it.

## Non-negotiable decisions

### Kit shape: flat map, static or function (click `c-mog0gsbb`)
The events kit contribution is `Record<string, EventSpec> | ((ctx: StartupContext) => Record<string, EventSpec>)`. No wrapper field. `EventSpec` carries `description?: string` and reserves a future `schema?` field shape. Function-form contributions must be pure — read from `ctx`, return data — invoked once during Clockworks `start()` after `requires:` deps have started. No `namespaces` / prefix-claim channel for v0.

### Merged set with `guild.json` override (click `c-mog0gsq0`)
Clockworks walks `ctx.kits('events')` at start, evaluates function contributions, builds the union of plugin declarations. Then merges in `guild.json clockworks.events` with **replacement semantics on name collision** — `guild.json` entries override plugin entries' metadata. Each merged entry carries a tag identifying its source: plugin id, or `'guild.json'`. Plugin-declared status persists for emit-authority purposes — operators redefining metadata do not gain emit authority on a plugin-owned name.

### Validator collapses to merged-set check + framework-owned check
Replace the current three-layer validator (reserved-namespace check, writ-lifecycle pattern check, must-be-declared-in-`guild.json` check) with two checks:
1. **Name-in-merged-set check.** Reject if the name is not in the merged kit + `guild.json` set.
2. **Framework-owned check.** Reject if the name is plugin-declared. Operator-original (`guild.json`-only) names are allowed.

The `JSON.stringify` payload-serializability check stays in `emit()`. Framework plugin emit sites do not go through the validator (advisory-only per click `c-mog4iwo1`).

### `ClockworksApi` exposes the validator
Add a method on `ClockworksApi` (e.g., `validateSignal(name: string): void` throwing on rejection, or `listEvents()` returning the merged set with source tags) that the framework CLI's `nsg signal` command consumes via the running guild's apparatus resolution. Delete the hand-mirrored validator and reserved-namespace const from the CLI signal command; the CLI calls into Clockworks at runtime.

### Hardcoded `emitter` on unprivileged surfaces
The anima `signal` tool sends `emitter: 'anima'`; the `nsg signal` CLI sends `emitter: 'operator'`. Neither accepts a caller override. Remove the optional `emitter` parameter from the tool's params schema.

### Delete the canonical const
After the validator and CLI migration, delete `RESERVED_EVENT_NAMESPACES` from the canonical Clockworks signal-validator module along with its hand-mirrored copy. The merged kit set replaces it entirely.

## Behavioral cases the design depends on
- A plugin contributing a static map of event names is reachable via `ClockworksApi`'s validator after Clockworks starts; calling validate on an undeclared name throws.
- A plugin contributing a function-form events kit has its function evaluated exactly once at boot; the returned map is merged into the validator set.
- A `guild.json clockworks.events` declaration with the same name as a plugin declaration overrides the plugin's metadata in the merged set, but the entry remains tagged as plugin-declared for emit-authority purposes.
- An anima signal tool emit attempt on a plugin-declared name fails (framework-owned).
- An anima signal tool emit attempt on a `guild.json`-only name succeeds.
- An anima signal tool emit attempt on an undeclared name fails.
- The framework CLI's `nsg signal` command resolves Clockworks at runtime and validates against the same merged set the anima tool sees — no hand-mirrored validator state exists.

## Out of scope
- Per-plugin events kit declarations themselves — those land in C2-C5.
- Compile-time / build-time / runtime enforcement of declaration-emission coupling for framework plugin emit sites (advisory-only per click `c-mog4iwo1`).
- Payload schema validation — `EventSpec` reserves the field shape, but no schema-validation runtime arrives in this commission.
- The bridge plugin and the writ-lifecycle generalization — those land in C3 and C2.
- Migration of existing emit sites to the new naming — those land in C2-C5.

## References
- Design root: click `c-mog0glxx` (kit-events redesign).
- Resolved subclicks: `c-mog0gsbb` (kit shape), `c-mog4iwo1` (advisory enforcement), `c-mog0gsq0` (`guild.json` override semantics), `c-mog0gt4l` (CLI consumption), `c-mog0gtja` (migration mechanics).
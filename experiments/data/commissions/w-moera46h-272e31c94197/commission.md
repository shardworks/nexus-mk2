# Cartograph CLI commands

## Intent

Add CLI subcommands for the three cartograph writ types (vision, charge, piece) so the patron can author and inspect ladder structure from the command line. The CLI surface is the patron's primary v0 entry point for vision authoring (the vision-keeper agent runtime is still in the future), and it's the plumbing surface the eventual Oculus pages will compose against.

## Motivation

The cartograph apparatus scaffold (writ `w-moepkalv-0ead1599bc23`) ships the typed API surface — `createVision`, `createCharge`, `createPiece`, plus read/list/patch operations on the companion books — but does not surface those as CLI commands. Without a CLI, the patron has no immediate way to author ladder structure: Oculus pages don't exist yet for these types, and direct programmatic invocation of the typed API requires writing throwaway scripts. Adding CLI subcommands closes the v0 authoring loop and lets patrons start using the ladder structure the moment the scaffold lands.

The vision-keeper agent runtime is a separate later commission; this CLI commission is for *direct patron use* via the command line, not for any agent.

## Non-negotiable decisions

- **The cartograph CLI is the patron-facing v0 authoring surface.** The patron must be able to create a vision, attach charges to it, attach pieces under charges, navigate and inspect the structure, and transition lifecycle stages — all from the command line.
- **Match the existing CLI patterns.** The framework's CLI registers top-level subcommand groups per plugin (e.g. `nsg writ`, `nsg click`, `nsg session`, `nsg plan`, `nsg signal`, `nsg clock`). Cartograph follows the same convention; the planner picks whether the three writ types each get their own top-level subcommand (`nsg vision`, `nsg charge`, `nsg piece`) or whether they nest under a single `nsg cartograph` group. The framework's prior choice — where each conceptual entity gets its own top-level subcommand — is the planner's default to honor unless there's a clear reason against.
- **Use the typed API.** All CLI operations route through the typed surface from the cartograph apparatus (`createVision`, `createCharge`, `createPiece`, plus read/list/patch). Do not bypass the typed enforcement to call `clerk.create` directly — ladder invariants must hold for CLI-driven authoring just as they do for programmatic consumers.
- **Subcommand operations cover at minimum**: create (with required parent linkage where applicable), show (single record by id), list (with appropriate filters per type), patch (update fields on the companion doc). Stage transitions (vision draft → active → sunset/cancelled, etc.) — the planner decides whether these flow through `patch` or get a dedicated `transition` operation.
- **Output formatting follows existing conventions.** Plugin subcommands today expose `--format text|json`. The cartograph CLI does the same. Text format is the default human-readable output; json format is for scripting.
- **The CLI lives in the cartograph package.** Subcommand registrations are contributed from `packages/plugins/cartograph/` via the existing CLI plugin contribution mechanism (mirror what astrolabe does for its `nsg plan` and adjacent subcommands; mirror what clerk does for `nsg writ`).

## Out of scope

- Vision-keeper agent runtime. This is patron CLI only; the agent is a separate later commission.
- Oculus pages for vision/charge/piece. The existing writs page already classifies arbitrary writ types via the type-vocabulary helper; visualization of the ladder is a separate concern.
- Reckoner integration. This commission does not surface petition-emit operations or any Reckoner-bound functionality through the CLI.
- Modifying the cartograph typed API itself — the surface should be sufficient for CLI use; if it isn't, the implementer flags it as an observation rather than expanding the typed API as part of this commission.
- Cross-product CLI operations (linking pieces across multiple visions, etc.). The cross-product DAG-edge work is parked under `c-mod53rpa`.
- CLI commands for the existing mandate writ type. Mandate authoring already has CLI surfaces (commission-post, etc.); this commission does not add or alter those.

## References

- Source click: `c-mod53o6h` (decomposition-ladder design, fully resolved at the parent level). The CLI is the patron-facing surface for the design that click captured.
- Cartograph scaffold writ: `w-moepkalv-0ead1599bc23`. This commission depends on it via `spider.follows` — CLI implementation cannot proceed until the scaffold lands the typed API.
- Existing CLI patterns: `nsg writ`, `nsg click`, `nsg plan`, `nsg session`, `nsg clock` — read these for the subcommand-group registration shape and the `--format text|json` convention.
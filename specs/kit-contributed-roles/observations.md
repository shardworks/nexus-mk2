# Observations — Kit-Contributed Roles

## Refactoring Opportunities (Skipped for Scope)

1. **Kit-consumption pattern gap for non-first-starting apparatus.** The Instrumentarium, Fabricator, and Spider all use the same pattern: scan `guild().kits()` + subscribe to `plugin:initialized`. This works because all three have `requires: []` and start before any other apparatus. The pattern silently breaks for apparatus that start later (like the Loom with `requires: ['tools']`) — they miss `plugin:initialized` events from apparatus that already started. The architecture docs show a more robust pattern (`[...guild().kits(), ...guild().apparatuses()]`), but no implementation follows it. A future commission could standardize all consuming apparatus to scan both `kits()` and `apparatuses()`, or Arbor could replay missed `plugin:initialized` events during each apparatus's `start()`.

2. **The Loom currently does not use `StartupContext`'s `on()` at all.** The `start()` parameter is `_ctx: StartupContext` (underscore-prefixed, unused). This commission changes that by subscribing to `plugin:initialized`. Minor but worth noting: the unused parameter naming will change.

## Suboptimal Conventions Followed for Consistency

3. **Git identity derivation for qualified names produces ugly display names.** `My-kit.artificer` is the result of applying `charAt(0).toUpperCase() + slice(1)` to `my-kit.artificer`. A smarter derivation (extract the roleName part after the dot, capitalize it) would look better. But the brief doesn't mention this and changing the derivation just for kit roles would be inconsistent. Noted for a future pass that improves git identity derivation holistically — possibly supporting an explicit `displayName` field on role definitions.

## Doc/Code Discrepancies

4. **`docs/architecture/kit-components.md` — stale role gating section.** The "Role gating" section describes a pre-Loom role model where roles have a `tools` array and `instructions` file path. The current system uses `loom.roles` with permission grants, not tool name lists. This section should be either updated to describe the current Loom-based model or removed and replaced with a reference to `docs/architecture/apparatus/loom.md`.

5. **Legacy fields in test mocks.** Tests in `loom.test.ts`, `animator.test.ts`, and `parlour.test.ts` include `roles: {}`, `workshops: {}`, and `baseTools: []` in mock `GuildConfig` objects. These fields don't exist in the current `GuildConfig` type. The tests work because they cast with `as never`, but the stale fields are confusing. A cleanup commission could remove them.

## Potential Risks

6. **Permission scoping is advisory, not enforced at tool-call time.** The Loom validates kit role permissions at registration time (dropping undeclared references) and passes the validated permissions to the Instrumentarium. But nothing prevents a kit from modifying its role data after registration, and the Instrumentarium doesn't re-validate. This is the same trust model as guild-defined roles — the validation is a startup sanity check, not a runtime enforcement boundary. Worth noting but not a concern for this commission.

7. **Role name collisions with dots.** If a guild defines a role named `my-kit.artificer` (with a dot) in `loom.roles`, it shadows the kit-contributed role from the `my-kit` plugin. This is exactly the override mechanism described in requirement 5 — not a bug. But it means guild authors could accidentally shadow kit roles by choosing dotted role names. The convention (guild roles are unqualified, kit roles are qualified) makes this unlikely in practice.

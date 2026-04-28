# Rename `spider.follows` to `depends-on` and establish Clerk's link-kind naming primacy

## Intent

The dependency-link relationship "B is blocked until A reaches a terminal-success phase" is fundamental to writ-graph structure, not Spider-internal. Multiple operators read it (Spider gates dispatch on it today; the Reckoner will gate consideration on it next) and one writes it from outside Spider (Astrolabe's observation-lift). Today the kind is named `spider.follows` and contributed by the Spider plugin's kit, with Clerk's link-kind validator enforcing a mandatory `{pluginId}.{suffix}` prefix on every kind id.

This commission moves the kind to `depends-on` (no prefix) and contributes it from the Clerk plugin. The validator gets a carve-out: the Clerk plugin — and only the Clerk plugin — may contribute kind ids without the prefix. Every other plugin still must prefix. The carve-out codifies a broader principle: foundational plugins that own a substrate get the unique privilege of contributing unprefixed names within that substrate. Clerk owns the writ graph, so Clerk owns the unprefixed link-kind namespace.

Along the way: every `spider.follows` reference in code, comments, tests, resolution messages, and existing data in the guild's link store migrates to `depends-on`.

## Motivation

- The Reckoner is about to start reading dependency links during petition consideration. With `spider.follows` named into Spider, every cross-plugin reader either imports a Spider-internal constant or hardcodes a string from another plugin's namespace — both are layering smells.
- Astrolabe already creates `spider.follows` links (the observation-lift engine attaches dispatch-precedence edges). Astrolabe writing into Spider's namespace is the worse smell than the read-side coupling.
- The relationship is genuinely framework-level. Naming it `depends-on` makes that legible; namespacing it under Clerk makes the ownership match the substrate.

## Non-negotiable decisions

### Clerk gets a naming carve-out for unprefixed link kinds

The Clerk plugin's link-kind registration validator currently rejects any kind id that isn't of the form `{pluginId}.{kebab-suffix}` with the prefix matching the contributing plugin. Modify this so contributions from `pluginId === 'clerk'` may use either the prefixed form (`clerk.X`) **or** an unprefixed kebab-case form (`X`). All other plugins are unchanged: prefix is required, prefix must match contributing plugin.

The carve-out is hardcoded to `'clerk'` — not a generic "primacy plugin" config. A future second-foundational-plugin case revisits the design.

The existing duplicate-id rule continues to apply across the whole registry: a Clerk contribution of `depends-on` collides with any future contribution of the same id from any plugin, and the existing collision check rejects it.

Source: c-moiwnzw6.

### `depends-on` is a Clerk-contributed link kind

Add `depends-on` to the Clerk plugin's `supportKit.linkKinds`. Description: *"The source writ depends on the target: the source cannot be dispatched, considered for petition acceptance, or otherwise advanced until the target reaches a terminal phase. Consumers define their own policy for what each terminal phase means."*

This is the only unprefixed kind contributed in this commission. `supersedes`, `related`, etc. are not added — they wait for concrete demand.

### `spider.follows` is fully retired

Spider's `linkKinds` contribution drops the `spider.follows` entry. Spider's gate-evaluation code (the outbound-link reader, the cycle-detection walk, the resolution-message text) reads `depends-on` instead. All Astrolabe call sites that create `spider.follows` links migrate to `depends-on`. The test fixture's `spider.follows` registration goes with it.

No alias, no transitional period.

### One-shot data migration

A migration finds every `WritLinkDoc` row where `kind === 'spider.follows'` and patches it to `kind === 'depends-on'`. Idempotent: a second run is a no-op because the rows it would touch no longer exist. Runs once per guild on first deploy of this commission, automatically — no operator intervention.

Implementation owner is the Clerk plugin (since Clerk owns the link-store schema). Apparatus startup hook, dedicated migration kit-contribution, or one-shot CLI is the implementer's call.

### Doc updates

The Clerk plugin's architecture/readme docs document the carve-out and the principle ("the Clerk plugin contributes link kinds without a plugin prefix because it owns the writ graph itself; this primacy is exclusive to Clerk"). The Spider plugin's architecture docs note that the dispatch-precedence edge is now a framework-level kind read from the Clerk-contributed registry, not Spider-private.

## Scenarios that must hold

- A non-Clerk plugin attempting to contribute a kind id `'depends-on'` (or any unprefixed kind) is rejected at startup with the existing prefix error.
- The Clerk plugin contributing `'depends-on'` succeeds; the kind appears in `clerk.listKinds()` with `ownerPlugin: 'clerk'`.
- The Clerk plugin contributing `'clerk.something'` (prefixed form) also succeeds — both forms allowed for Clerk specifically.
- `clerk.link(a, b, label, 'depends-on')` succeeds; `clerk.link(a, b, label, 'spider.follows')` fails with the unknown-kind error.
- Spider's existing dispatch-gate behavior is preserved end-to-end: a writ with an outbound `depends-on` edge to a non-terminal target stays gated; a `failed` target cascades to `stuck`; cycles fail-loud with "Cycle detected in depends-on graph"; diamonds resolve cleanly.
- Astrolabe's observation-lift creates `depends-on` edges in both flat and group modes; behavior is otherwise unchanged.
- Existing `spider.follows` links in the guild's link store are reachable as `depends-on` after migration; consumers reading the link kind see the new value.
- Duplicate-id rejection works across the namespace (a future contribution colliding with `depends-on` is rejected).

## Out of scope

- **Reckoner consumption of `depends-on`.** The dependency-aware consideration logic (sibling click c-moiwnmoc) is a separate commission. This commission only renames; the Reckoner still considers writs without consulting depends-on edges.
- **Other unprefixed kinds.** No `supersedes`, `related`, etc. added now.
- **Generic primacy-plugin config.** The carve-out is hardcoded to `'clerk'`.
- **Label standardization.** The kind is what changes; labels stay caller-controlled.
- **Out-of-repo doc updates.** Handled separately post-dispatch — they live outside the framework repo.
- **Backfill of dead `spider.follows` strings in committed git history, old session transcripts, etc.** Live code, comments, and data only.

## References

- Parent click: c-moiwnzw6 — rename + Clerk-namer-primacy principle.
- Sibling click: c-moiwnmoc — Reckoner dependency-aware consideration; consumes the new kind. Out of scope here.
- Sibling click: c-moiwnb9i — `reckoner.petition()` helper; orthogonal.
- Resolved parent: c-moivk7pd — lifecycle-interactions umbrella that surfaced this work.
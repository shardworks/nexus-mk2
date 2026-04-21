# Delete `astrolabe.generatedWritType` now — not after the old rig retires

I want `AstrolabeConfig.generatedWritType` gone in this commission. Inline the literal `'mandate'` at the spec-publish read-site and drop the field from `packages/plugins/astrolabe/src/types.ts`. The brief frames this as a follow-up "after the two-phase-planning rig is retired" — I'm rejecting that framing (#39). The cleanup condition has already been met; we're just not acting on it.

## Reframe

The reason to wait would be: a real consumer is using the override today and would break on deletion. The brief tells me the opposite — *no guild sets this value; it has been vestigial since landing.* A config field with zero real consumers isn't load-bearing on the old rig; the old rig is getting `'mandate'` via the default and has always been. Deleting the field and inlining `'mandate'` is a no-op for the two-phase-planning rig's observable behavior.

So the sequencing claim ("retire old rig first, then delete the ghost") is backwards. The field is safe to delete **independent of** the multi-rig refactor, because nothing is riding on it. Tying the cleanup to a retirement milestone is exactly the kind of "keep the old thing around a little longer" that I reject by default (#1, #38).

## Reader and decision

The reader is a framework maintainer opening `packages/plugins/astrolabe/src/types.ts` to understand Astrolabe's configuration surface. The decision it informs: *"what can a guild configure about spec-publishing behavior?"* Frequency: every time someone touches this file or writes docs describing Astrolabe config. Today the answer includes a misleading option ("you can set `generatedWritType`") that has never had a real user. I want the answer to match reality (#22).

## Scope

**In:**
- Remove `generatedWritType?: string` from `AstrolabeConfig` in `packages/plugins/astrolabe/src/types.ts`.
- In `spec-publish`, replace `guildConfig().astrolabe?.generatedWritType ?? 'mandate'` with the literal `'mandate'`. The two-phase-planning rig path keeps working because it was already resolving to `'mandate'` via the default.
- Delete any tests that exist solely to exercise the override (they test a capability we're removing).
- Remove any doc references — README, JSDoc, config examples, generated schema if one exists — that mention `generatedWritType`.

**Out:**
- Retiring `astrolabe.two-phase-planning` itself. That's a separate cleanup, gated on the multi-rig refactor being the default. I want these decoupled — the ghost field is a local fix, the rig retirement is a migration.
- Deprecation warnings, compat shims, or "ignore the field gracefully if a config sets it." If a stray config somewhere *did* set this value, I'd rather it fail loud on the unknown key than be silently dropped (#2). Since the brief says no guild sets it, there's nothing to warn about anyway.
- Introducing a replacement extension point (e.g., "configurable writ type for spec-publish"). The literal is correct; any future need earns its way back with a real second consumer (#18).

## How it works

This is code deletion, not a feature. The shape:

1. `AstrolabeConfig` in `types.ts` loses the field. If that was the only optional field, the interface shrinks or collapses — fine either way; I care about the type reflecting truth, not about preserving an "object-shaped config" that holds nothing (#5 applies when the object is acquiring fields, not when it's the last resident leaving).
2. `spec-publish` reads `'mandate'` directly. No `guildConfig()` lookup at this call site for this purpose.
3. The `astrolabe.two-phase-planning` rig path still produces mandates via spec-publish; nothing about its observable behavior changes.
4. The combined rig path was already unreached for this config; no change.

If the type-change ripples into a plugin surface or extension contract I don't know about, surface it in the plan — I'd rather hear "this was a de-facto extension point for X" than have the deletion silently preserved.

## Assumptions I made

- The brief's claim is accurate: **no guild, anywhere in the sanctum, the framework tests, or example guilds, sets `astrolabe.generatedWritType`.** Planner should grep to verify before deleting.
- The only read-site is `spec-publish`. If there's a second reader, it also gets the literal.
- `AstrolabeConfig` is currently exported — the type-level removal is a breaking change to downstream typing even if no one sets the field. In Mk 2.1 we don't carry compat for this (#10); the type break is acceptable and expected.
- There's no generated JSON schema or config validator that knows about `generatedWritType` independently of the TS type. If there is, it gets updated in the same commit.

## Deferred questions

- **Grep result:** planner should confirm zero set-sites in `/workspace/nexus-mk2`, `/workspace/nexus`, and `/workspace/vibers` before the edit. If a set-site exists, pause and surface it — my framing assumes none.
- **Tests on the override path:** if there are tests asserting `generatedWritType` overrides `'mandate'`, they should be deleted, not rewritten. Confirm none are actually testing a downstream invariant that would survive the override being gone.
- **Other vestigial Astrolabe config fields:** while the planner is in there, is `generatedWritType` the only ghost, or is `AstrolabeConfig` carrying other zero-consumer fields? Not asking them to fix those in this commission, but I want a note if there are more — that's a different conversation about Astrolabe's config surface as a whole.

Clockworks's `supportKit.events` function form runs inside Clockworks's `start()`. Any plugin that registers writ types via `clerk.registerWritType` from its OWN `start()` AND is topologically ordered AFTER Clockworks (i.e. it `requires:` Clockworks) will be missed by the snapshot. The Clerk's registry seals at the framework's `phase:started`, but Clockworks has already built its kit by then.

In the current codebase no plugin requires Clockworks AND registers a writ type, so the gap is theoretical. As the plugin ecosystem grows it becomes real.

Mitigations to consider in a follow-up:

- Subscribe to `phase:started` via `ctx.on()` and rebuild the merged set then. Reopens the validator-readiness gate but addresses the gap.
- Document the constraint: 'plugins that register writ types must `requires:` Clockworks-upstream, not Clockworks-downstream.'
- Move writ-lifecycle declaration to the Clerk's own `supportKit.events` (function form), removing the topology issue — the Clerk owns the registry and seals it at `phase:started`. This is a cleaner home for the declaration than Clockworks; the brief chose Clockworks for 'cross-plugin domain' reasons but the Clerk is closer to the source of truth.

Not a bug today — a seam to surface.
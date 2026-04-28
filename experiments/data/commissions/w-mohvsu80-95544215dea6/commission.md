C1 introduces function-form contributions for the first time in the codebase — no existing kit type accepts a `(ctx) => T` value. The existing kit-author docs (`docs/architecture/plugins.md`, `docs/architecture/kit-components.md`) describe contributions as static data only.

After C1 lands, third-party plugin authors will want a worked example showing when to use static-form vs function-form (introspection of writ types, walking other kits to derive event names). The C3 `clockworks-stacks-signals` plugin will be the canonical worked example, but a small section in `docs/architecture/clockworks.md` or a new `docs/guides/authoring-events-kits.md` would help authors pick the right form.

Not in C1's scope (the architecture doc is owned by sibling commissions per a similar pattern in the schedule-standing-orders C1). Worth a follow-up pass after C3 lands and there's a real example to point at.

**Files**: `docs/architecture/plugins.md`, `docs/architecture/clockworks.md`, possibly a new `docs/guides/authoring-events-kits.md`.
**Action**: After C3, write a function-form kit-author guide using `clockworks-stacks-signals` as the worked example.
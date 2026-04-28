Lifted from the planning run of "Clockworks event surface migration" (w-mohuowyh-b662db03ccff). Each numbered observation below is a draft mandate ready for curator promotion.

1. Audit guild.json templates and bundles for legacy commission.* and schedule.* standing orders
2. Consider renaming `commissionId` payload field to `rootWritId` once commission.* is gone
3. Surface a startup gap: writ types registered after Clockworks start are missed by the events kit snapshot
4. Stale `_plan/` directory at repo root carries pre-existing planning files from a different commission
5. Deprecation warning when guild.json references deleted event names
6. Loop-guard probe relies on a hardcoded SOF event-name string — consider hoisting to a constant
7. Heads-up: `book.*` validator gap persists post-C2 — closed only when C3 lands the bridge plugin

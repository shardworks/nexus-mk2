The rig read tools disagree on response shape:

- `packages/plugins/spider/src/tools/rig-list.ts` returns `RigView[]` (enriched via `enrichRigViews`).
- `packages/plugins/spider/src/tools/rig-show.ts` returns `RigView` (enriched via `enrichRigView`).
- `packages/plugins/spider/src/tools/rig-for-writ.ts` returns plain `RigDoc | null`.

The `RigView` extras (`costSummary`, `engineCosts`, joined `writTitle`) are documented as dashboard-facing (see `packages/plugins/spider/src/types.ts` L154-L179). Callers that want a per-writ rig *and* the derived summary today have to call `rig-for-writ` and then `rig-show` for the enrichment — a pointless second hop.

Options for follow-up:
- Change `rig-for-writ.ts` to call `enrichRigView(rig)` (reuse `../rig-view.ts`), matching `rig-show`.
- Or: document the intentional asymmetry in the tool instructions and types so callers know which endpoint gives which shape.

Impact on the current change: none — the astrolabe cost panel does its own session fan-out and ignores `costSummary`. But the moment another caller wants to render a cost badge from a per-writ lookup, this inconsistency will bite.
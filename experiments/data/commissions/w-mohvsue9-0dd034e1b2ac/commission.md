D9 picks `validateSignal(name)` as the only consumer-surface method on `ClockworksApi`. A future inspector tool (e.g., a `nsg events list` command, or an Astrolabe events kit per `c-mog0gtja`'s C5 ladder) will want a way to enumerate the merged set.

Additive: ship a `listEvents(): MergedEventEntry[]` (or `getEvent(name): MergedEventEntry | undefined`) method later without breaking the C1 surface. The merged-set Map is closure-scoped and accessible; exposing a snapshot is a small change.

Not in C1 scope (Three Defaults #3 — don't inflate API surface ahead of demand). Surfaced so the C5 (Astrolabe events kit) commission knows the surface is available to add.

**Files**: `packages/plugins/clockworks/src/types.ts` (`ClockworksApi`), `packages/plugins/clockworks/src/clockworks.ts` (closure-scoped merged-set Map).
**Action**: When a consumer (operator inspector, Astrolabe events kit) demands enumerate-the-set capability, add `listEvents()` to `ClockworksApi`.
**Where:** `packages/plugins/reckoner/src/reckoner.ts:1147-1170` (the `runCatchUpScan` helper).

**What:** The catch-up scan reads `clerk/writs` directly:

```typescript
const writsBook: ReadOnlyBook<WritDoc> = stacks.readBook<WritDoc>('clerk', 'writs');
const candidates = await writsBook.find({
  where: [['phase', '=', 'new']],
  orderBy: ['createdAt', 'asc'],
});
```

This is decision D12 (now resolved by an explicit comment in the code at lines 1141-1146) — the team chose direct book reads to bypass `clerk.list()`'s implicit `type='mandate'` filter. The Reckoner's gating helper proposed in this plan (decision D8 in this plan) takes the same path for reading dependency targets.

**Why this is a cross-cutting consolidation opportunity:** Both Reckoner reads and Spider reads of `clerk/writs` are direct-book reads, bypassing Clerk's API. This is a recurring pattern across plugins that need to query writs by criteria Clerk's listing API does not expose (Spider, Reckoner, and likely the future staleness diagnostic). A consolidated `clerk.findWrits(query)` or `clerk.tryShow(writId): WritDoc | undefined` would let plugins query through the apparatus without the implicit-filter trap.

**Suggested follow-up:** Add a non-throwing fetch (`clerk.tryShow`) and a query-by-phase (`clerk.findWrits({ phase, type? })`) to ClerkApi. The named consumers would be Reckoner (catch-up scan, dependency check), Spider (gate evaluator), and the future staleness diagnostic. This keeps writ-read logic inside Clerk, where it belongs, and removes the direct-book pattern from N plugins.
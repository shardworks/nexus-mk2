`packages/plugins/clockworks/src/types.ts` (lines 52-55) declares:

```typescript
export type StandingOrder =
  | { on: string; run: string }
  | { on: string; summon: string; prompt?: string }
  | { on: string; brief: string };
```

Per concluded click `c-modgto1o`, the canonical form is `{ on, run, with? }` only. The `summon` and `brief` variants are dropped; summon becomes `run: 'summon-relay'` with role in `with:`. This type will need to change to:

```typescript
export type StandingOrder = {
  on: string;
  run: string;
  with?: Record<string, unknown>;
};
```

Likely lands in task 4 (dispatcher) where standing orders are first consumed at runtime. Surface it here so task 4's implementer doesn't miss the type refresh. The `ClockworksConfig.standingOrders?: StandingOrder[]` field currently has no readers, so the change is backwards-compatible at the persistence layer.
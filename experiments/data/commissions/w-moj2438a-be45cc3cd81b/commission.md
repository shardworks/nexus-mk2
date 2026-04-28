**Where:** `packages/plugins/spider/src/spider.ts:2472`.

**What:** Spider's gate evaluator hardcodes the released-phase set:

```typescript
const TERMINAL_SUCCESS_PHASES = new Set(['completed', 'cancelled']);
```

This works for the mandate writ type and any plugin-contributed type that happens to use the same phase names, but fails silently for plugin-contributed types whose terminal-success phases use different names — the gate stays held forever even though the dependency is structurally resolved.

**Why this is a real bug:** A plugin-contributed writ type whose terminal-success state is named e.g. `'shipped'` (with attrs `['success']`) would be classified as 'non-terminal blocker' by Spider's `evaluateGate`, holding the dependent writ in `gated` indefinitely.

**Why this matters now:** This commission is teaching the Reckoner to read the same `depends-on` graph but classify via writ-type-config attrs (per the brief). Spider's hardcoded names create a divergence: a dependency target Spider classifies as 'non-terminal' could be classified as 'cleared' by the Reckoner, leading to acceptance-without-dispatch — the Reckoner accepts the dependent (deps cleared by attrs), but Spider then refuses to dispatch (deps not cleared by phase names).

**Suggested follow-up:** Refactor Spider's `evaluateGate` to use the same writ-type-config attrs classification (`terminal + (success-attr OR cancelled-attr)` for cleared; `terminal + failure-attr` for failed). This aligns the two consumers' definitions of 'cleared' and removes the hidden phase-name coupling.
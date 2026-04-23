`packages/plugins/astrolabe/src/astrolabe.ts:270-271` declares:

```typescript
requires: ['stacks', 'clerk'],
recommends: ['spider', 'loom', 'fabricator', 'oculus', 'ratchet', 'animator'],
```

But Astrolabe contributes a `rigTemplates` entry (`plan-and-ship` at `astrolabe.ts:321-323`) and a `rigTemplateMappings` entry (`astrolabe.ts:325-327`) that only make sense if Spider is present — those are Spider APIs. If Spider is not loaded, Astrolabe's kit contributions are consumed by nothing (`collectStartupWarnings` at `guild-lifecycle.ts:266-` emits an advisory about unconsumed contributions). That's the current compromise, but it means topological order between Astrolabe and Spider is sibling order, not dependency order — which is exactly why any "dependent wins" tie-breaker needs Astrolabe to escalate `spider` from `recommends` to `requires`. The follow-up commission for this observation would be: audit plugins whose kit contributions are semantically Spider-scoped, and make `requires: ['spider']` the contract for them.
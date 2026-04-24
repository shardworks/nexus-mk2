`packages/framework/core/src/guild-config.ts:13-17` currently types StandingOrder as:
```
type StandingOrder =
  | { on: string; run: string }
  | { on: string; summon: string; prompt?: string }
  | { on: string; brief: string };
```

But `docs/architecture/clockworks.md` §Canonical form says every standing order has one canonical form: `{ on, run, ...params }` where additional keys are passed as `RelayContext.params`. The type should allow arbitrary additional keys (`[k: string]: unknown` or similar), and the `run` form specifically should permit params like `environment`, `dryRun`, etc. The example in clockworks.md `{ on: 'deploy.requested', run: 'deploy', environment: 'staging', dryRun: true }` is invalid under the current type.

Recommend widening when task 2 (relay SDK) lands — the relay SDK's `params` contract needs this type to be ambient. Also applies to the `summon` form which takes `maxSessions`. Not blocking the skeleton.
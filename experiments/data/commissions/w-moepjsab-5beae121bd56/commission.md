The JSDoc `@example` block on `ClockworksKit` in `packages/plugins/clockworks/src/types.ts:396` shows `recommends: ['nexus-clockworks']`, which is the same stale-plugin-id defect this docs-fix mandate targets. Source-code defect, not architecture-doc, so explicitly out of brief scope (D6 selected `doc-only`).

Fix: change L396 in `packages/plugins/clockworks/src/types.ts` to `recommends: ['clockworks']` to match the actual derived id (and consistent with the rest of `clockworks.ts` source which uses short ids throughout, e.g. `requires: ['stacks', 'clerk']` at L295).

Trivial single-line edit, no test impact — the example string is illustrative only. Worth landing as a tiny follow-up so authors who copy-paste the JSDoc example get correct guidance.
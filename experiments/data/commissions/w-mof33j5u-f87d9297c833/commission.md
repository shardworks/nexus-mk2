The `EngineRetryConfig` and `EngineRetryBackoffConfig` interfaces are declared in two places with identical shapes:

- `packages/plugins/fabricator/src/fabricator.ts` lines 62–85 (canonical, exported from `@shardworks/fabricator-apparatus`).
- `packages/plugins/spider/src/types.ts` lines 363–389 (mirror, re-exported from `@shardworks/spider-apparatus`).

The spider-side copy is documentation — it points at `validateEngineRetryConfig` (which lives in fabricator) and is structurally identical. Two copies will inevitably drift; one will gain a field the other lacks, and a kit author importing from the wrong package will silently get the older shape. This commission does not introduce the duplication, but it adds a third reader of the type (the override block) which inherits the drift risk.

Follow-up: have spider-apparatus re-export the type from fabricator-apparatus rather than re-declaring it. Remove the duplicate interface declaration, change the spider-apparatus index to `export type { EngineRetryConfig, EngineRetryBackoffConfig } from '@shardworks/fabricator-apparatus'`. Verify no consumer imports the spider copy expecting a structurally distinct type.
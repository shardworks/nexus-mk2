`docs/guides/building-engines.md` (line 25) and `docs/reference/core-api.md` (lines 15-30) document `engine()` as a factory exported from `@shardworks/nexus-core`:

```typescript
import { engine } from '@shardworks/nexus-core';

export default engine({
  name: 'my-engine',
  handler: async (event, { home, params }) => { ... }
});
```

But no such export exists. `packages/framework/core/src/index.ts` does not export `engine`, and `packages/plugins/fabricator/src/fabricator.ts` defines only an `EngineDesign` interface — no factory. The docs are aspirational or stale.

Options downstream:
- Implement `engine()` in nexus-core now to match docs (symmetric with the incoming `relay()`).
- Rewrite docs to describe the current EngineDesign interface contract.
- Deprecate the engine() terminology if engines will be folded into relays (unlikely given the architecture's engine/relay distinction).

No action needed for this commission; `relay()` does not depend on engine().
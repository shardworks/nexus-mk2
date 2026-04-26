## What

`packages/plugins/cartograph/src/cartograph.ts:77-111` declares three `WritTypeConfig` constants — `VISION_CONFIG`, `CHARGE_CONFIG`, `PIECE_CONFIG` — that are byte-identical six-state mandate-clone shapes differing only in the top-level `name` field. Lines 77-87 (vision), 89-99 (charge), 101-111 (piece) form three near-copies of the same 11-line state array.

## Suggested follow-up

Replace with a small factory:

```ts
function makeCartographConfig(name: 'vision' | 'charge' | 'piece'): WritTypeConfig {
  return {
    name,
    states: [
      { name: 'new',       classification: 'initial',  allowedTransitions: ['open', 'cancelled'] },
      { name: 'open',      classification: 'active',   allowedTransitions: ['stuck', 'completed', 'failed', 'cancelled'] },
      { name: 'stuck',     classification: 'active',   attrs: ['stuck'],     allowedTransitions: ['open', 'failed', 'cancelled'] },
      { name: 'completed', classification: 'terminal', attrs: ['success'],   allowedTransitions: [] },
      { name: 'failed',    classification: 'terminal', attrs: ['failure'],   allowedTransitions: [] },
      { name: 'cancelled', classification: 'terminal', attrs: ['cancelled'], allowedTransitions: [] },
    ],
  };
}

export const VISION_CONFIG = makeCartographConfig('vision');
export const CHARGE_CONFIG = makeCartographConfig('charge');
export const PIECE_CONFIG  = makeCartographConfig('piece');
```

Benefits: 30 lines collapse to 15; constants stay individually exportable for the existing test assertions; future state-machine evolution touches one place. Acknowledged risk: if the three types ever genuinely diverge (e.g., piece adds an extra state), the factory is the wrong shape — at that point the dedup unwinds naturally.
Four kit-merge registries in the framework today use three different collision policies, and the inconsistency is the root cause of the hazard this brief calls out. If D3 is left at `spider-only`, the rest of these remain latent bugs of exactly the same shape the brief flags:

- `packages/plugins/clerk/src/clerk.ts:181-215` — `writTypes`: warn + first-registered-wins. Structurally identical to the brief's subject. Test at `packages/plugins/clerk/src/clerk.test.ts:2503-2533` codifies the warn-and-first-wins contract.
- `packages/plugins/spider/src/spider.ts:743-781` — `blockTypes`: silent last-wins via `this.types.set(value.id, value)`. No warning, no throw. Arguably *worse* than the subject of this brief — operators get zero signal.
- `packages/plugins/fabricator/src/fabricator.ts:130-164` — engine designs: silent last-wins. Same quiet last-wins as blockTypes.
- `packages/plugins/clerk/src/clerk.ts:217-280` — `linkKinds`: already throws on duplicate. Proves the pattern is viable.

A follow-up commission could audit these sites and apply whichever rule this commission settles on. The point is: this is not a Spider-specific bug, and a Spider-specific fix leaves the framework's merge policy incoherent.
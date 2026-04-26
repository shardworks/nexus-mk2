## What

The three `transitionVision` / `transitionCharge` / `transitionPiece` methods (`packages/plugins/cartograph/src/cartograph.ts:290-347`, `419-472`, `544-597`) duplicate ~55 lines each of identical logic:

- `txWritsBook.get(id)` + not-found throw
- `clerk.getWritTypeConfig(writ.type)` + unregistered-type throw
- `config.states.find` for current phase + invariant throw
- `currentState.allowedTransitions.includes(request.phase)` check + descriptive error
- `config.states.find` for target phase + invariant throw
- `targetState.classification === 'terminal'` + writ-patch construction (phase, updatedAt, conditional resolvedAt, conditional resolution)
- `txWritsBook.patch(id, writPatch)`
- `tx<X>Book.patch(id, { stage, updatedAt })`

Only the per-type companion book handle (`txVisionsBook` vs `txChargesBook` vs `txPiecesBook`) and the stage-enum TypeScript type vary. The runtime values pass through unchanged.

## Suggested follow-up

Extract a private helper inside `createCartograph()`:

```ts
async function performTransition<TStage extends string>(
  txWritsBook: Book<WritDoc>,
  txCompanionBook: Book<{ id: string; stage: TStage; updatedAt: string; [k: string]: unknown }>,
  id: string,
  request: { phase: WritPhase; stage: TStage; resolution?: string },
): Promise<...> { /* shared logic */ }
```

Each `transitionX` then becomes a 4-line wrapper that opens the transaction and calls `performTransition`. Cuts ~150 lines, prevents drift if (e.g.) the resolvedAt convention evolves and only one of three sites is updated.
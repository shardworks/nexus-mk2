## What

`cartograph.patchVision` / `patchCharge` / `patchPiece` (in `packages/plugins/cartograph/src/cartograph.ts:283-288`, `412-417`, `537-542`) accept `Partial<Omit<<X>Doc, 'id'>>` and pass `fields` straight through to `book.patch(id, fields)`. Because `<X>Doc` carries `stage`, the structural shape lets a caller pass `{ stage: 'sunset' }` and silently bypass `transitionVision`'s phase/stage coupling — the writ row's `phase` stays untouched while the companion doc's `stage` advances.

The `types.ts` JSDoc on every `<X>Doc.stage` field (lines 33-35, 78-79, 117-118) declares `transitionX` the only sanctioned mutator. That contract is documented but not enforced by the typed API.

## Why this commission can't fix it

The CLI commission addresses this at the CLI tool layer only (D5: `<type>-patch` Zod schema omits `--stage`, so Commander rejects it as an unknown flag). Typed-API consumers — other plugins, integration tests, future agents calling the apparatus directly — still slip through.

The brief explicitly forbids modifying the cartograph typed API in this commission ('the surface should be sufficient for CLI use; if it isn't, the implementer flags it as an observation rather than expanding the typed API as part of this commission').

## Suggested follow-up

Add a runtime guard inside each `patchX` that throws when `'stage' in fields`, citing `transitionX` as the sanctioned path. Pure addition; no signature change. The new guard mirrors the `createVision` parentId guard already in place at lines 226-231.
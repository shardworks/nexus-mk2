`packages/plugins/cartograph/src/cartograph.ts:255-285` (and the analogous `createCharge` / `createPiece` blocks below it) bypasses `clerk.post()` entirely — the writ row and companion doc are written inside cartograph's own transaction so both commit under one boundary. The `codex` field is taken straight from the request and elided when undefined. A typed caller of `createVision({ title, body })` can therefore still produce a writ with `codex: undefined`.

This bug class is parallel to the present commission's, not addressed by it. Vision-typed writs are not currently dispatched by the `plan-and-ship` rig template (`packages/plugins/astrolabe/src/astrolabe.ts:368-374` only maps `mandate`), so the symptom is latent today — but adding a future rig template for vision/charge/piece would resurface it.

Follow-up actions:

- Apply the same default-or-throw rule inside cartograph's createX methods, or factor a shared `resolveCodex()` helper out of the clerk tool handler and reuse it in cartograph.
- Or: gate cartograph's createX methods on a non-empty codex (fail-loud) and let the cartograph CLI tools/REST handlers carry the defaulting policy.
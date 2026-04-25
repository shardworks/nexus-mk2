The brief for this commission and several in-tree comments reference an Astrolabe writ type called `piece`, but the code at `packages/plugins/astrolabe/src/astrolabe.ts:401` registers `name: 'step'`. The stale reference also lives in `packages/plugins/astrolabe/src/tools.test.ts:80` ("astrolabe's start() now calls `clerk.registerWritType(...)` for piece and observation-set"). Either the rename from `piece` to `step` was incomplete (briefs and comments not updated) or the rename was intentional and the briefs/comments are simply stale.

Follow-up: grep the repo for `piece` in writ-type-adjacent contexts (`grep -rn '\bpiece\b' packages/ docs/`) and either (a) update remaining references to `step`, or (b) revert the type name back to `piece` if that was always the canonical intent. This commission's integration test will use the actual registered name (`step`) regardless; this observation is purely about the textual reconciliation.

Files to audit:
- `packages/plugins/astrolabe/src/tools.test.ts:80` (comment)
- This brief's body (writ w-modz6sxd)
- Any other writ bodies / docs that mention `piece` in a writ-type sense
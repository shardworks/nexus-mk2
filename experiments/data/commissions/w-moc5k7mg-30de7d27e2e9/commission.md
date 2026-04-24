`packages/plugins/clerk/pages/writs/writs-hierarchy.test.js` still carries three D20 comments asserting the detail view stays direct-children-only:

- Line 11 (file header): `- Children table rendering in the detail view (still direct-children\n *   only — see D20).`
- Line 231 (docstring on the extracted `renderDetail`): `* The detail view stays direct-children-only (D20).`
- Line 675 (describe block): `describe('Children table rendering in detail view (D20: still direct-children only)', ...)`

Commit `8aaa5bd` (`feat(clerk): render deep descendants in writs detail view`) already broke that invariant; the current `renderDetail` in `index.html` (lines ~1086–1092, 272–277 of the extracted mirror) renders `writ._descendantTree` when present and only falls back to direct children when it is absent. The tests themselves still pass because they exercise the fallback path via `_fullChildren`, but the comments mislead readers about current behavior.

Suggested follow-up: rewrite the three comments so they describe the current two-mode behavior (deep-descendant rendering when `_descendantTree` is present, direct-children fallback otherwise) and drop the stale D20 qualifier. Out of scope here because the present mandate is narrowly about the `fetchChildrenForRoots` / `childrenMap` sweep.
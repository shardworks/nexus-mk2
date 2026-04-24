`packages/plugins/clerk/src/tools/writ-tree.ts` renders the writ tree with the same pattern as `click-tree.ts` (status glyphs, short ids) and the same blind spot: no link info inline. The Clerk supports the same set of cross-substrate link types; mandate writs can also accumulate supersedes-like references that are invisible in the tree view.

The commission narrows to Ratchet/clicks by design — the writs skill may not yet formalize supersedes as the canonical correction pattern the way the clicks skill does. But the symmetry is worth a follow-up: if supersedes becomes canonical for writs too, the same rendering pattern belongs on the Clerk side.

Affected file: `packages/plugins/clerk/src/tools/writ-tree.ts` plus the Clerk's equivalent of `buildTree`/`renderMarkdown` in `clerk.ts`.
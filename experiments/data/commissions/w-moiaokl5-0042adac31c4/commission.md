`packages/plugins/clerk/src/types.ts:199-216` declares `codex?: string` on `PostCommissionRequest`. The current brief asserts that `clerk.post`'s API has codex 'required at the API layer' — which doesn't match the type. Today, the optionality is what enables parent-codex inheritance.

The present commission deliberately leaves `clerk.post()` unchanged per the brief's 'What NOT to do'. But the doc/code drift is real and worth surfacing to a future curator: either tighten the type (and provide an explicit channel for the parent-inheritance path, e.g. accept `parentId` and infer codex within `clerk.post`) or update the brief's mental model.

Follow-up actions to consider:

- Decide whether `clerk.post`'s API surface should be tightened to require either `codex` or `parentId` (with inheritance) so the type system enforces the bug class.
- Or: amend the brief and the inline JSDoc on `PostCommissionRequest.codex` to say 'optional; resolved upstream by the commission-post tool or via parent-codex inheritance'.
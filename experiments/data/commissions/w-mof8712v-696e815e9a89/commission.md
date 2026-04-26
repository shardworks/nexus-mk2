Several call sites pass `draft: true` (or `draft: false`) to `clerk.post(...)` even though `PostCommissionRequest` (in `packages/plugins/clerk/src/types.ts`) has no such field — TypeScript's structural extra-key forgiveness on object literals lets the unrecognized field through, and `clerk.post()` silently drops it.

Known offenders:
- `packages/plugins/clockworks/src/integration.test.ts` L194 (`{ draft: true }`)
- Any test that copy-pasted the `{ draft: true }` idiom from the old API

Hazard: if `draft` is ever re-introduced with a different meaning (e.g. as a tag, a flag for some unrelated feature), these stale fields will silently activate the new behavior. Today they are benign — the writ lands in `new` regardless because that is the initial state of the mandate type.

Follow-up commission: grep the workspace for `clerk.post(.*draft:` and decide whether to (a) add `draft?: never` (or similar) to `PostCommissionRequest` to make the stale field a TypeScript error, or (b) remove the stale fields from the call sites.

For restore-to-green, leave the stale fields in place — cleaning them up is out of scope per the brief's 'don't refactor' guidance. This observation captures the cleanup so it doesn't get lost.
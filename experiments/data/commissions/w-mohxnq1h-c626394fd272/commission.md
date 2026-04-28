The writ-lifecycle observer continues to populate a `commissionId` field on every event payload, derived by walking `parentId` to the root. After C2 the `commission.*` event family is gone and the term 'commissionId' carries less weight — the field is structurally `the id of the topmost ancestor writ', regardless of type.

A rename to `rootWritId` (or `rootId`) would:

- Decouple the field's name from the deleted concept.
- Match the actual semantic (works for any writ type, not just mandates).
- Make subscribers' code self-documenting.

The rename touches every emitter (writ-lifecycle observer payload), every documented payload shape (event-catalog.md table, README), and any in-tree subscriber that reads `payload.commissionId`. C2 keeps the field name to honor the brief's explicit preservation; the rename is a follow-up cleanup.
The current mandate (`w-moc1s8sd-838e71857109`, phase `open`) describes a cleanup that has already been performed on main in commit `d0614513` (`feat(clerk): writs page renders deep descendants with overflow + 100-row default`). That commit's body explicitly states: *"Removes the dead childrenMap / fetchChildrenForRoots fan-out path. The detail view's per-parent writ-list call is left untouched per D20."*

Verified state:
- `grep` for `fetchChildrenForRoots` across the repo: one hit, a docstring line in `buildDescendantTree()` (handled by the scope of this plan).
- `grep` for `childrenMap`: zero hits.
- `loadWrits()` already uses `/api/writ/tree`.

After the S1 docstring edit lands, this mandate has no further live work. Suggested follow-up: close the mandate (completed) once the draft is merged, and cite commit d0614513 together with the follow-up sweep as the resolution.

This is informational, not a separate commission candidate — the observation-lift engine may still draft a child writ; a curator can drop it if they prefer to close the mandate directly.
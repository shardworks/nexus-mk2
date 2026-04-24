The commission body points to `docs/architecture/apparatus/ratchet.md:383` for the stale open question; the actual location is line **411** (line 383 is part of the Mutability Rules section, unrelated). It also cites `packages/plugins/ratchet/src/ratchet.ts:194` as the `generateId('c', 6)` call site; the actual line is **197**.

These drifts are minor and don't block the intended edit, but they'd mislead any reader who trusted the citations. Likely cause: line numbers captured at brief-authoring time drifted as the files evolved between that snapshot and when the brief landed.

Possible follow-up: a brief-authoring convention that prefers symbol anchors (file + function name, or file + nearest heading) over raw line numbers, since line numbers decay fast on active docs/code.
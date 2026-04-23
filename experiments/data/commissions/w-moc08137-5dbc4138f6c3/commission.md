`docs/architecture/apparatus/astrolabe.md` line 144 ends with:

> Sage roles carry permissions to read/write the Astrolabe's books, create patron-input requests, and post writs to the Clerk (for the final generated writ).

The parenthetical reason — `(for the final generated writ)` — is stale: no sage role posts a final generated writ in the current rig. The `clerk:write` permission is still needed (e.g. `astrolabe.observation-lift` uses `clerk.post` for draft child briefs), but not for that reason.

Suggested replacement: either drop the parenthetical entirely or rephrase to describe the actual use (draft child-writ creation during observation-lift, historical final-writ posting for any custom rig a guild wires).
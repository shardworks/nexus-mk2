Three architecture docs reference the dropped `summon:` sugar form:

- `docs/architecture/index.md` L128: `{ "on": "writ.workspace-ready", "summon": "artificer", "prompt": "..." }` in the guild.json shape example.
- `docs/architecture/apparatus/clerk.md` L881–882: `{ "on": "mandate.open", "summon": "artificer", "prompt": "..." }` in a standing-order example.
- `docs/architecture/apparatus/animator.md` L586: prose reads 'when a standing order fires `summon: "role"`, the relay calls `animator.summon()`'.

Clerk.md L881 also uses `mandate.open` rather than `mandate.ready` for the writ-lifecycle event — the catalog name is `mandate.ready` (open is a phase, not an event suffix).

Follow-up commission should walk these three files, rewrite the standing-order shapes to canonical form, and tighten the writ-lifecycle event names. Each is small enough (one-to-three lines) that a single commission can handle them.
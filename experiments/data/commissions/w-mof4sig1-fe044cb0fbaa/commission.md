After this rename lands, the package at `packages/plugins/<new-id>/` (e.g. `sentinel`) will continue to register plugin id `reckoner` at runtime (the brief preserves `RECKONER_PLUGIN_ID = 'reckoner'` and the `reckoner.*` trigger-type prefix as part of behavior preservation).

When the new Reckoner core (the petition-scheduler at `c-mod99ris`) lands, it will also claim plugin id `reckoner`. Two plugins claiming the same plugin id cannot be installed in the same guild — one of them will fail to register.

The brief's strategy explicitly defers this conflict to the eventual subsume commission: the new Reckoner core will absorb the queue-observer's behavior, eliminating the duplicate plugin id. Until that lands, operators who want both behaviors must use *only* the renamed queue-observer; they cannot install the new Reckoner alongside it.

This is a known, accepted asymmetry. Worth flagging as a follow-up so the subsume commission's scope reminds the implementer to:

- Audit `packages/plugins/<new-id>/src/types.ts` `RECKONER_PLUGIN_ID = 'reckoner'`
- Audit the trigger-type constants `'reckoner.writ-stuck'`, `'reckoner.writ-failed'`, `'reckoner.queue-drained'` in the same file
- Audit `packages/plugins/<new-id>/src/reckoner.ts` `apparatus.requires` and any `pulse.source` stamping

Not a bug, just a substrate-state worth tracking.
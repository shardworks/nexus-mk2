This commission writes `writ.ext['surveyor']` via `clerk.setWritExt(writId, 'surveyor', payload)` even though the `surveyor` plugin does not yet exist anywhere in the tree (`grep ext\['surveyor'\]` returns no hits today). The brief explicitly authorizes this: 'clerk.setWritExt(slotKey, ...) is plugin-keyed and accepts any plugin id at write time. The future substrate will read these values when it lands.'

The pattern — writing to a typed ext slot before its owner ships — is genuinely useful for staged rollouts (a producer commission lands first, the consumer commission lands later, and writs accumulate metadata that is inert in the meantime). It will recur. But it has trade-offs worth surfacing as a cross-cutting concern:

1. The slot key (`'surveyor'`) is a string both sides must agree on, but with no shared typed constant the agreement is informal until the surveyor commission lands and either (a) imports a constant from this commission or (b) defines its own and trusts the value matches.

2. Clerk's setWritExt validation is empty for the value parameter (`The value is opaque — the Clerk does not validate sub-slot contents`). A producer that writes a malformed shape silently can poison the slot for the future consumer.

3. Operators reading writs today see ext['surveyor'] populated but no apparatus consuming it — potentially confusing in oculus / writ-show output.

A cross-cutting commission could either (a) document this 'producer-first' pattern in `docs/architecture/petitioner-registration.md` or `docs/architecture/apparatus/clerk.md` with the reckoner+vision-keeper precedent and the new cartograph+surveyor split, or (b) add a lightweight slot-registry mechanism to clerk so producers and consumers can both reference the same canonical key. The former is lighter-weight and preserves clerk's design that ext is a plugin-private dumping ground; the latter is heavier but catches typo/shape mismatches early.

Files likely involved: `packages/plugins/clerk/src/types.ts` (ext doc), `docs/architecture/apparatus/clerk.md`. Lift only if the patron-anima judges the recurring pattern deserves an architectural commitment now rather than letting it accrete naturally.
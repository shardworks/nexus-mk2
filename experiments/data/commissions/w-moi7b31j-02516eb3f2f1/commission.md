Five of the 24 cancelled writs subsumed under this holding-pen are observably resolved in the working tree by the SessionDoc reducer commission (`packages/plugins/animator/src/session-reducer.ts`):
- w-moee8bz4 (lift TERMINAL_STATUSES) — reducer exports it (`session-reducer.ts:65`).
- w-moegwsp1 (session-running's local TERMINAL_STATUSES) — imports the consolidated set (`tools/session-running.ts:20`).
- w-moegwsn8 (NON_RATE_LIMIT inverse drift) — derived from the consolidated set (`rate-limit-backoff.ts:135`).
- w-moegwshu (recordSession unconditional terminal write) — every variant funnels through read+reduce+put.
- w-moee8c0x (cleanupLegacyStatusBook removal) — already removed from `startup.ts`.
- w-moee8c6g (session-show.ts handler audit) — verified, returns full doc, no projection.
- w-moda2w6e (back-off cache warm-up race) — closed by D14 retro-fixup at `animator.ts:894`.

These writs were cancelled with resolution 'Subsumed by w-moi2wcmo' but their actual remediation came from a different commission. The provenance chain reads as if this holding-pen will address them; in fact they were silently resolved earlier. A future curator promoting drafts from this holding pen should not re-open them. Worth a one-time prune pass on the resolution metadata when the holding pen ships.
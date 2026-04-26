The current `docs/architecture/apparatus/reckoner.md` documents the narrow MVP queue-observer (`writ-stuck`, `writ-failed`, `queue-drained` Lattice pulses). Per click `c-modeou1t` (concluded), that apparatus is being renamed to `@shardworks/queue-observer-apparatus` or `@shardworks/sentinel-apparatus` via commission `w-moera3n9`. Once the rename lands and the new petition-scheduler Reckoner ships, this file will name the wrong apparatus.

The current commission (`w-moera2s1` — the petitioner-registration design doc) does *not* touch this file: its output lives at `docs/architecture/petitioner-registration.md`. But two follow-ups remain:

1. After `w-moera3n9` lands the rename, this file should either move to the new package's slug (e.g. `apparatus/sentinel.md` or `apparatus/queue-observer.md`) or be retired and replaced.
2. After the new Reckoner core commission ships, a new `apparatus/reckoner.md` must be authored to document the petition-scheduler. The new apparatus doc is *not* this design doc — the petitioner-registration spec describes the contract a single feature exposes; the apparatus doc describes the apparatus end-to-end.

File a follow-up commission to perform the move/replacement once the upstream rename merges; the work is mechanical but easy to forget.
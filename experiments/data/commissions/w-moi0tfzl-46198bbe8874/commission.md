**The gap.** D9 / D10 select an in-memory `Map<visionId, writId>` for outstanding-petition tracking; if vision-keeper crashes between emitting a petition and the next snapshot, on restart the map is empty and the supersede flow cannot find the prior writId. The petition is orphaned in `new` phase until the future Reckoner CDC handler picks it up (which itself is gated on `w-mohuvpu2`). For v0 the gap is acceptable — the worked example exercises the contract surface, not durability.

**Why this matters.** Once the CDC handler lands and vision-keeper starts running in production guilds, an orphaned petition is a real data-quality issue: the keeper emits a new snapshot for the same vision, the prior is never withdrawn, both sit in `new` until the Reckoner approves both, and the work pipeline gets two writs for one underlying drift event.

**Proposal.** Persist outstanding-petition state in a vision-keeper-owned Stacks book (`vision-keeper/snapshots`), keyed by visionId. On `start()`, vision-keeper scans the writs book for `phase === 'new' AND ext.reckoner.source === 'vision-keeper.snapshot'` and reconstructs the in-memory map.

**Concrete files.** New book schema in vision-keeper's supportKit (`books: { snapshots: { indexes: ['visionId'] } }`); a `start()` reconstruction sweep; methods become async-with-persist. The Stacks-side cost is one tiny book.

**Atomicity.** This is a discrete follow-up commission — best landed in tandem with or after the CDC-handler commission `w-mohuvpu2`, since durability matters most when petitions can actually be approved.
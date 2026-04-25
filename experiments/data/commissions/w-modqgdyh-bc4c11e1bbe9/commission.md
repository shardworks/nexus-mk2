`docs/architecture/apparatus/reckoner.md` §"Drain predicate (D7)" still defines drain as `writsCount('phase = open') === 0 AND rigsCount('status IN (running, blocked)') === 0`. Once T4 lands, this is wrong on multi-type guilds (would under-count active non-mandate writs). The T4 brief explicitly out-of-scopes documentation refresh and cites T7 as owning it; this observation tracks the live discrepancy so T7 picks it up.

Files to update when T7 lands:
- `docs/architecture/apparatus/reckoner.md` lines 178–195 ("Drain predicate (D7)" section)
- Same file lines 313–318 ("Failure Behaviour Matrix") — the row about Spider absent and rigs book missing references the old phase-based check.
- Reckoner README (`packages/plugins/reckoner/README.md`) trigger table line 53 references `open = 0` — update to active-classified.

No code change needed for T4; surfaced so T7 has a punch list.
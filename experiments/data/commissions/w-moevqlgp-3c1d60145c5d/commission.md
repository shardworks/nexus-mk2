Lifted from the planning run of "Concurrent `nsg clock run` + daemon may produce duplicate dispatch rows under certain races" (w-moe4rydd-88153048ae27). Each numbered observation below is a draft mandate ready for curator promotion.

1. Audit summon-relay circuit-breaker pre-increment for concurrency safety under the new at-most-twice contract
2. Phase-2 CDC auto-wiring is the same race in disguise — observers run inside the originating transaction so are exactly-once today, but worth flagging
3. Existing CI-noise observation (w-moe4rymt) overlaps with the daemon-coexistence warning rewording — align the two follow-ups before either lands
4. Daemon log file would benefit from a unique dispatcher-instance id so concurrent at-most-twice dispatches can be cross-correlated post-hoc

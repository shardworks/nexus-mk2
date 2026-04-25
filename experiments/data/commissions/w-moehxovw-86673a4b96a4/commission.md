Sibling `w-mod4z84v` already flags `status.spider.retryable` as a dead field. Adjacent to this commission, audit:

  - `packages/plugins/reckoner/src/predicates.ts:51` (`isTerminalStuck`) — reads `retryable`. Already tolerates missing.
  - `packages/plugins/lattice-discord/` — renders `retryable` from pulse context. Already tolerates missing.
  - `packages/plugins/oculus/` static views — confirm rendering tolerates absent slot.

If any path treats absent-`retryable` differently from `retryable=false`, it will start producing wrong output once the rescue tool clears slots. Spot-check during implementation; if anything breaks, add to the cleanup commission `w-mod4z84v`.
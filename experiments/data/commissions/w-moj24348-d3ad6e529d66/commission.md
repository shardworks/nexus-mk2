Lifted from the planning run of "Reckoner dependency-aware consideration" (w-moiyh0jz-68cfc4941a8a). Each numbered observation below is a draft mandate ready for curator promotion.

1. Scheduler-emitted defer outcomes silently produce no Reckonings row
2. Spider's TERMINAL_SUCCESS_PHASES uses hardcoded phase names instead of writ-type-config attrs
3. deferCount/firstDeferredAt/lastDeferredAt running counters never wired in buildReckoningRow
4. Reckoner's CDC handler will not wake deferred dependents on dependency-cleared events
5. Reckoner's catch-up scan reads writs directly via stacks.readBook, bypassing Clerk

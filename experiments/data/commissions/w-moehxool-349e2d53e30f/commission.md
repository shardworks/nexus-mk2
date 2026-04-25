Lifted from the planning run of "Add nsg writ-rescue-stuck tool for legacy stuck writs" (w-mod4z7us-1f46e9b9192c). Each numbered observation below is a draft mandate ready for curator promotion.

1. Establish a `--apply` dry-run convention for future bulk-mutation tools
2. Surface lingering legacy `'stuck'`/`'blocked'` rigs in Oculus rig-list
3. Add a Stacks index on `status.spider.stuckCause` if rescue queries become slow
4. Audit other paths that read `status.spider.retryable` in case they need defensive defaults
5. Stacks `transaction()` semantics for chained `transition` + `setWritStatus` calls
6. Consider the rescue tool's interaction with the Reckoner pulse history

Brief allows `nsg clock run` while the daemon is running, with a warning. Both call `processEvents()`. The dispatcher is sequential per-process but two processes calling `processEvents` concurrently can pick up the same pending event before either has flipped `processed: true`. SQLite serializes the writes but neither process knows about the other's read.

Result: the same event could be dispatched twice (one row per call), and the relay's handler runs twice. For idempotent relays this is fine; for non-idempotent relays it produces duplicate side effects.

The brief explicitly says 'SQLite handles concurrent access safely', referring to data integrity — the books don't corrupt. But application-level idempotency is a separate concern.

Follow-up: either (a) enforce relay-level idempotency as a contract, (b) wrap the per-event 'find unprocessed + flip to processed' as a single SQLite transaction with a row-lock pattern (would require Stacks support for SELECT FOR UPDATE), or (c) simply document that concurrent `processEvents` callers are not safe for non-idempotent relays.

Tactical detail: the existing `processEvents` returns the events it processed. A defensive caller could wrap the read+flip in a transaction, but the Stacks API doesn't expose a SELECT FOR UPDATE primitive today. This is more of a doc/contract question than a bug — file as a follow-up.
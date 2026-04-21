# Reconcile Retryable Stuck Field Path (Slice A / Slice B Fixup)

Slice A (commit `adaf4f7`) and Slice B (commit `be26ca4`) landed with a field-path mismatch that renders the retry clockwork inert: the writer puts the flag at one path, the reader looks at another. Reconcile the two sides onto a single canonical shape, fix the reader, and add an integration test that round-trips a retryable engine-failure through to a second-rig spawn.

## Motivation

The intent of the two-slice commission was an end-to-end autonomous retry primitive. As landed:

- Slice A's `failEngine` writes `writ.status.spider = { stuckCause, retryable, detail, observedAt }` — the retry flag at **`status.spider.retryable`** (flat).
- Slice B's clockwork handler reads `writ.status?.spider?.stuck?.retryable` — a **nested** `status.spider.stuck.retryable` path that nothing ever writes.

Result: the retry clockwork's trigger condition is never met; the autonomous-retry feature is dead code in production. Both slices' type declarations (`SpiderWritStatus` in spider; `RetryableStuckStatus` in clockworks-retry) already agree on the flat shape — only the clockwork's runtime reader disagrees with its own types and with Slice A's writes.

This fixup should have been caught by planning across both briefs (a single sage would have locked the shape in one spec); it was not, so the fixup now has to land as its own commission. The tightest slice that closes the gap is: pick the canonical path, normalize both sides, and lock it with an integration test.

## Non-negotiable decisions

### Pick one canonical path for the retry flag

The field must live at exactly one location on the writ, and every writer and reader must agree. Both slices' type declarations already describe a **flat** shape (`SpiderWritStatus` carries `retryable` directly; `RetryableStuckStatus` carries `retryable` directly). The flat shape is therefore the canonical one unless the sage surfaces a specific reason to choose otherwise; the deciding principle is minimize churn on what has already shipped.

If the sage has an argument for the nested shape — e.g. anticipating future `status.spider.{gating,engine-failure,...}` sub-categories — the brief accepts that outcome, but then Slice A's writer, the `SpiderWritStatus` interface, `RetryableStuckStatus`, and every existing test must all migrate together. No split-shape outcomes.

### Fix the reader / writer disagreement wherever it lives

Whichever shape is chosen, every read site and every write site in both `packages/plugins/spider/` and `packages/plugins/clockworks-retry/` must agree with it. The clockwork's handler, its types file, the Spider status writer, and the Spider status reader path in `autoUnstick` all touch this shape. None may be left declaring or accessing a different path.

### Add a cross-plugin integration test

The core failure mode here is that each slice's unit tests asserted against that slice's own assumed shape — they never met. An integration test in either `clockworks-retry` or `spider` (sage's call) must exercise the round trip:

1. A rig transitions to stuck via `failEngine` with `retryable: true`.
2. The writ's status slot is written by Slice A's path.
3. The clockwork's handler fires against the actual written shape (not a mock).
4. The writ transitions `stuck → open`.
5. A second rig spawns for the same writ.

This is the test that would have caught the bug. It must be resilient to the canonical-path choice — written against the shared type declarations, not against a path string duplicated in the test itself.

## Scenarios to verify

- A `retryable: true` engine-failure stuck is picked up by the clockwork and requeued (writ → open, new rig spawned, `rigs.length` == 2).
- A `retryable: false` engine-failure stuck is ignored (writ stays stuck).
- A `failed-blocker` stuck is ignored by the clockwork (unchanged from current behavior; verify the fixup didn't disturb it).
- The N=2 cap still applies: a `retryable: true` stuck with `rigs.length` already at 2 is not requeued.
- The clockwork's dead-comment about "re-read the writ inside the handler's own context" — either implement the re-read guard or delete the comment. Don't leave aspirational claims in code.

## Out of scope

- **The `forWrit(writId)` semantic change** landed in Slice B (any-rig → newest-rig). That's a separate concern with its own caller-audit question and should be addressed in a dedicated commission, not folded in here.
- **Plugin hosting choice.** The fact that `clockworks-retry-apparatus` is a standalone plugin rather than a binding inside a future Clockworks apparatus is a design question for when Clockworks MVP lands. Not in scope here.
- **Retry-count observability in the patron UX.** Separate work.
- **Changing the N=2 cap, adding backoff, or per-cause differentiation.** All deliberately out of scope from the original Slice B commission and remain so.
- **Migration of writs already stuck at deploy time.** Prospective only — same posture as the original slices.

## References

- Commit `adaf4f7` — Slice A, the retryable flag.
- Commit `be26ca4` — Slice B, the retry clockwork primitive.
- `c-mo813v` — Slice A design click (concluded).
- `c-mo814q` — Slice B design click (concluded).
- `c-mo56pq2k` — retry mechanism choice (Option 2, multi-rig-lite): the context for the overall shape.
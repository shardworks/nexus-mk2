# Rewrite legacy spider test suite against post-reshape architecture

## Intent

The engine-level retry and rig-status rollup reshape (the parent commission this writ follows) reshaped the spider's core data model — engines now carry `attempts[]` with per-attempt history, rig status is derived from engine states, the `blocked` and `stuck` engine/rig states collapsed into `pending + hold metadata`, and several `CrawlResult` variants and event types were renamed or retired. The parent commission added targeted new-invariant coverage (the new engine-retry test file, a rewritten rate-limit test file, and rewritten `clockworks-retry` cross-plugin tests) but left the pre-existing spider test suite — several thousand assertions across the package's main behavioural test files (`spider.test.ts`, `spider-ui.test.ts`, `rig-view.test.ts`, `piece-pipeline.test.ts`) — asserting against the old shape. Those tests now fail, not because behaviour drifted, but because their assertion mechanics target data-model fields, state names, and event types that no longer exist.

This commission is the mechanical rewrite: bring every one of those tests up to date against the new data model while preserving the behavioural coverage each test was originally written to provide. No new coverage, no behaviour changes — just update the references until the suite is green again.

## Motivation

The reshape's correctness is partially asserted by the new invariant tests and typecheck, but the several-thousand-assertion legacy suite was the spider's primary behavioural guardrail. Leaving it failing leaves the spider package without its full regression net until the tests are re-aligned. Re-aligning them also validates, in bulk, that the reshape preserved every behaviour the old suite was written to protect — any test whose intent genuinely cannot be expressed in the new model is itself a signal about a semantic change that needs discussion.

## Non-negotiable decisions

### Preserve behavioural coverage one-for-one

Every assertion in the legacy suite is there because the original author wanted a specific behaviour to hold. The rewrite updates the *mechanics* of the assertion — the fields it reads, the events it awaits, the state shapes it expects — but keeps the *behaviour* being asserted. Don't silently drop tests.

If a test's intent genuinely cannot be expressed in the new model because the behaviour itself was removed by the reshape (e.g. tests targeting the retired `rig-blocked` event semantics, or tests exercising the old writ-level-retry-via-new-rig path), flag each such case explicitly in the commit message with a one-line note about why — do not quietly delete.

### Target data model is the post-reshape shape

Assertions must read from the new shape, not the old:

- Engine scalar fields (`startedAt`, `completedAt`, `error`, `sessionId`, `yields`) are read from `attempts[-1]`, not off the engine.
- Engine statuses are exactly `pending | running | completed | failed | cancelled | skipped`. The old `blocked` and `stuck` engine statuses are gone — a held engine is `pending` with hold metadata (`holdUntil`, `holdReason`, `holdCondition`, `lastCheckedAt`).
- Rig statuses are exactly `running | completed | failed | cancelled`. No rig-level `stuck`; a rig containing held engines is `running` (progress is still expected, just gated).
- `CrawlResult` variants: `engine-blocked` / `engine-unblocked` / `rig-blocked` are retired; `engine-held` / `engine-retrying` are the replacements. Rewrite tests that await or match the retired variants.
- Block records are gone. Tests that inspected block-record shape now inspect the hold metadata on the engine directly.
- The `rig-blocked` event is no longer emitted; tests awaiting it rewire to the equivalent post-reshape surface (no event; the engine simply stays `pending` with hold metadata until its gate clears).

### Tests actually pass

`.skip`, `it.todo`, and commented-out assertions are not acceptable completion states. The acceptance bar is the spider package's full test command green against the post-reshape code. If a test cannot be made to pass against the new shape, either it's a genuine reshape-level bug worth flagging and handing back (see scope fence below), or the rewrite wasn't finished.

### Test helpers update minimally

If existing test helpers no longer compile against the new shape, update them to compile against the new shape with as little restructuring as possible. Don't redesign the harness; don't introduce new abstractions. This commission's diff should be dominated by test-body changes, not helper churn.

## Out of scope

- **Changes to the reshape itself.** The new data model is fixed by the parent commission. Don't tweak `spider.ts`, engine design files, or the new invariant tests. If the mechanical rewrite exposes what looks like a reshape-level bug, flag it in the commit message and leave it for a follow-up — don't patch in place.
- **New coverage.** Don't add new tests, new scenarios, or fill in "missing" coverage gaps the original suite didn't have. This is a rewrite-for-parity.
- **Unrelated flaky-test cleanup.** Stay inside the legacy suite's scope; unrelated test churn inflates the diff and hides the real rewrite.
- **Documentation updates.** The reshape commission already updated READMEs. If a legacy test doc-comment references a retired state or event, updating the comment in place is fine; don't open a separate documentation sweep.

## Behavioural cases the rewrite depends on

The following cases are expected to exist in the rewritten suite (either preserved from the legacy tests or trivially expressible in the new shape):

- An engine in hold (post-failure with retry budget remaining, or rate-limited) is observable as `status='pending'` with populated hold metadata; the rig it belongs to is `status='running'`.
- An engine that exhausts its retry budget transitions to `status='failed'`; the rig rolls up to `status='failed'`; downstream engines cascade to `cancelled`.
- An engine that succeeds on retry has `attempts[]` recording the failed attempt(s) followed by the successful attempt.
- A rig's observable status is always derivable from its engine set plus the explicit-cancel flag — no test should rely on an independent rig status write that disagrees with the engine set.

## References

- **Parent commission** (load-bearing `spider.follows` dependency): the engine-level retry and rig-status rollup reshape writ that this commission follows — the writ that this follow-up writ is linked to via `spider.follows`.
- **Design click** `c-mocdm2o7` — engine-level retry and rig-status rollup.
- **End-and-continue click** `c-mod9zbw2` — the triggering-case design question about implementers cleanly ending mid-commission and handing off; this writ is the concrete follow-up that pattern produced.
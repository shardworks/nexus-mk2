**Files:**
- `packages/plugins/spider/src/spider.test.ts`, lines 392-400 (canonical)
- `packages/plugins/spider/src/rate-limit.test.ts`, line 140 (notes "Mirrors the wrapper in spider.test.ts")
- Likely (unverified): other sibling `*.test.ts` files in the package that need the same `clerk.post` auto-publish behavior

**Symptom.** The fixture wrapper that auto-transitions writs landing in `new` to `open` (`if (writ.phase === 'new') return realClerk.transition(writ.id, 'open');`) is copy-pasted across multiple test files in the spider package. The `rate-limit.test.ts:140` comment is an explicit acknowledgment that the duplication is conscious and pre-existing.

**Why this matters.** If the auto-publish semantics ever shift (e.g., the Clerk's initial state changes from `new` to something else), every duplicated copy must be updated in lock-step. Today the package has no shared test-helper module that would prevent this duplication.

**Connection to the split commission.** The split commission's S2 (extract `buildFixture` into `spider-test-fixture.ts`) creates exactly the kind of shared-helper module that could absorb these wrappers. After the split lands, a follow-up commission can migrate the sibling test files (`rate-limit.test.ts`, `engine-retry.test.ts`, `step-pipeline.test.ts`, etc.) onto `spider-test-fixture.ts` and de-duplicate the wrapper. That migration is explicitly out of scope for this commission (the brief says: 'Splitting any other test files... is not part of this commission.') but is a natural follow-up.

**Suggested fix.** Follow-up commission, post-split: migrate sibling spider-package tests onto the shared `spider-test-fixture.ts` helpers, removing duplicated wrapper logic.
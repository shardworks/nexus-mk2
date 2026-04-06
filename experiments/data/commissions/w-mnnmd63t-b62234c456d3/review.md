# Review: w-mnnmd63t-b62234c456d3

## Engine Blocking on External Conditions

**Outcome:** partial

**Spec quality (post-review):** strong

**Revision required:** yes

**Failure mode:** broken

## Notes

### What went well

Strong delivery for a complexity-8 commission. All 29 requirements met with high fidelity:

- Types match spec exactly: EngineStatus, RigStatus, BlockRecord, BlockType, CrawlResult variants, SpiderApi extensions
- BlockTypeRegistry mirrors Fabricator's EngineRegistry pattern precisely
- Circular dependency handled correctly — priorBlock on EngineRunContext defined inline in fabricator with clear comment
- Crawl loop ordering (collect > checkBlocked > run > spawn) correctly wired
- isRigBlocked helper extracted and called from all three required sites (R13) — caught in self-review fixup
- failEngine correctly updated to cancel blocked engines alongside pending (R21)
- CDC handler correctly ignores blocked status (R29)
- All tools updated: rig-resume added, rig-list enum, rig-show instructions, barrel exports
- Three built-in block types all clean and correct
- consumes: ['blockTypes'] added (self-review catch)

### What went wrong

1. **TypeScript build error in book-updated.ts** (line 29): `Record<string, unknown>` doesn't satisfy the `BookEntry` constraint which requires `{ id: string }`. Real build failure.

2. **No tests written.** The spec listed 20+ explicit test cases (V1–V22, plus named Test Cases section), but no automated tests were implemented. The existing spider.test.ts (1828 lines) has zero blocking-related test cases.

### Analysis

The test gap is a rig-instruction-layer issue, not a spec issue. The spec enumerated test cases in detail (implying they should be written) but never explicitly instructed "write tests." An agent could reasonably read the Test Cases section as verification guidance rather than implementation instructions. Sean is adding explicit test-writing instructions to the role layer in a separate session.

### Minor observations

- tryCheckBlocked uses two separate queries instead of IN operator — spec noted this as a fallback. Pragmatic choice.
- Built-in block type checkers redundantly call conditionSchema.parse() inside check() — Spider already validates at block time (R27). Harmless but unnecessary work on every poll cycle.

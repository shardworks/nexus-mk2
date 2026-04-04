# Observations: Add Relationships Between Writs

## Refactoring opportunities skipped

1. **Clerk has no event firing at all.** The outdated writs architecture doc describes a rich event model (`type.ready`, `type.completed`, `type.failed`) that the current Clerk does not implement. Adding `writ.linked` as the Clerk's first event would be ad-hoc — the broader question is when/whether the Clerk fires status-transition events. This should be a separate commission.

2. **transition() field stripping is fragile.** The current approach destructures and discards known managed fields. Any new managed field requires updating the destructuring pattern. A safelist approach (only pass through explicitly allowed fields) would be more maintainable than a denylist. Not worth changing in this commission but worth noting.

## Suboptimal conventions followed for consistency

3. **WritDoc index signature `[key: string]: unknown`.** This satisfies the Stacks BookEntry constraint but defeats TypeScript's structural checking — any field can be set without a type error. Every apparatus that stores documents in Stacks has this same issue. A better pattern might be to have BookEntry use a branded type or generic constraint, but that's a Stacks-level change.

## Doc/code discrepancies

4. **Outdated writs architecture doc is significantly diverged from reality.** `docs/future/outdated-architecture/writs.md` describes parent/child trees, pending status, completion rollup, session binding, circuit breakers, and prompt templates — none of which exist in the current Clerk. The doc is correctly filed under `outdated-architecture/` but still appears in search results and could mislead agents. Consider archiving with a prominent "SUPERSEDED" header.

5. **X013 instrument references guild-monitor writ detail.** The guild-monitor's implementation status is unclear — only a dashboard upgrade script exists at `/workspace/nexus/bin/upgrade-dashboard.sh`. The acceptance criterion about surfacing relationships in the guild-monitor should be tracked as a separate item once the monitor's state is clarified.

## Potential risks in adjacent code

6. **Dispatch prompt assembly ignores all relational context.** `dispatch.ts:assemblePrompt()` builds the prompt from `writ.title` and `writ.body` only. When writ relationships exist, a dispatched anima working on a "fixes W-abc" writ would benefit from seeing the original writ's resolution, title, or failure reason. This is a natural follow-up: enrich dispatch prompts with relationship context. Not in scope for this commission but worth noting as a high-value enhancement.

7. **No writ deletion exists.** The Clerk has no `delete()` method or tool. This means orphaned links (links to/from writs that conceptually "should be gone") can't occur today. If writ deletion is ever added, link cleanup will need to be addressed. The separate-book storage approach (D8) makes this easier than embedded storage would.

## Spec verification log (plan-writer)

**Gap check:** No gaps found. All three included scope items (S1, S2, S3) are fully covered by decisions D1–D12. The unlink API method signature (not explicitly covered by a decision) follows mechanically from D8 (separate book) + D9 (deterministic ID) + Stacks delete() semantics.

**Coverage verification:**
- Inventory coverage: All 8 files identified as "will likely be modified/created" are addressed in the spec. All files identified as "not modified" are confirmed unaffected.
- Decision coverage: All 12 in-scope decisions (D1–D12) are reflected in the spec's Design section. D13 is for excluded S4 — not addressed, correct.
- Scope coverage: S1 → R1–R8, R11, R14, R15. S2 → R9, R13. S3 → R10, R12. S4 excluded.
- R↔V bidirectional: All 15 requirements appear in at least one validation item. All 14 validation items reference at least one requirement. No orphans.
- Implementer perspective: All type signatures are complete (copy-pasteable). All file paths are explicit. All error messages are specified. Behavioral rules cover validation order, idempotency, and the empty-result case for `links()`. The test harness setup note (ensureBook for links) is included as a non-obvious touchpoint.

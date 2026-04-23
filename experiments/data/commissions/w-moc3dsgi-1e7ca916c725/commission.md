The bug exists because `(d) => d.selected === undefined` is duplicated literally in two engines:
- `packages/plugins/astrolabe/src/engines/patron-anima.ts:118-120` (the bug site)
- `packages/plugins/astrolabe/src/engines/decision-review.ts:102`

The two filters look identical but mean different things:
- decision-review: "unsettled at all — needs a human"
- patron-anima (under the bug): "hasn't been pre-decided by the primer" (which became "never" once the primer-attended contract landed)

The primer-attended split made the second meaning obsolete; the filter survived because it visually matched its sibling and was assumed to mean the same thing.

After the D1 fix, the patron-anima filter is gone and only the decision-review filter remains. There is no immediate duplication problem to refactor away. But the *pattern* of "two engines reading the same predicate with subtly different intent" is a known footgun in this codebase; flagging it for the architecture log so the next time someone is tempted to add a third reader of `selected === undefined`, the implications cascade through all sites.

Suggested follow-up: add a comment near `decision-review.ts:102` (and possibly a typed predicate helper exported from `types.ts`) that names the invariant explicitly: `selected === undefined ⇔ needs patron attention`. Would surface the contract anyone reading the predicate has to honour.
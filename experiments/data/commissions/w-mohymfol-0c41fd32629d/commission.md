`packages/plugins/animator/COMPLEXITY-AUDIT.md` enumerates the six soon-to-be-changed events at multiple anchor lines:
- lines 96–99 (concern §5 framing)
- line 628 (`commission.session.ended` parent-chain resolution)
- lines 637–638 ("with the existing `commission.session.ended` co-emit logic preserved")
- lines 670–675 ("Six event names… `session.started` / `session.ended` / `session.record-failed` / `commission.session.ended` / `anima.manifested` / `anima.session.ended`")
- lines 741–745 ("What NOT to refactor" load-bearing invariant)

After C4 those references become factually wrong on names and on count (six → three). Refresh is a churn-cost decision rather than a correctness one (the audit doc is a snapshot, not a contract), but a future reader running `grep` for `commission.session.ended` will land in the audit and be confused.

Deferred to a separate observation rather than scoped into C4 because (a) the audit doc is explicitly historical, (b) editing it inline as part of the rename would muddy C4's diff with documentation churn that isn't in the brief, and (c) Candidate C in the audit (centralize emission via SessionDoc CDC) is independently relevant and would re-rewrite these sections.
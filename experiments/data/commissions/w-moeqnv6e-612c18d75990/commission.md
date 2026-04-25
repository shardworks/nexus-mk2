The same wrong CDC event name appears in a sibling architecture doc and was not in scope for this mandate.

- File: `packages/plugins/stacks/docs/specification.md`
- Line: 478
- Current: `→ Clockworks emits book.nexus-ledger.writs.updated for each`
- Correct (per `clockworks.ts` L436 — `book.<ownerId>.<book>.<verb>` — with the writs book owned by plugin `clerk` per `clerk.ts` L1184): `→ Clockworks emits book.clerk.writs.updated for each`

Note: this doc uses `'nexus-ledger'` extensively as a worked-example owner of a hypothetical `writs` book throughout the spec narrative (L84, L410, L413, L421, L521, L602, L756, L819, L825). Those uses are intentionally illustrative and consistent within the doc's narrative, so a careful follow-up should distinguish:

- L478, which sits inside an example explicitly describing what Clockworks emits at runtime — a doc/code discrepancy worth fixing to `clerk`; and
- The other `nexus-ledger` mentions, which are coherent illustrations of the Stacks API and should be left alone (or addressed by a separate, broader rewrite of that doc's worked example).

Lowest-friction fix: a one-line edit on L478 swapping `nexus-ledger` for `clerk`. Could be folded into the broader sibling-architecture-doc cleanup tracked under obs-2 of `w-moe8b75z` (`w-moe8b79j`) if that commission is opened, or stand alone.
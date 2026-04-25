Animator source and tests carry **49 inline references to D-numbered design decisions** (D6, D7, D8, D10, D11, D12, D13, D22, D24, ...) across 7 files (`grep -c 'D7\|D8\|D10\|D11\|D12\|D13\|D22\|D24'`). Examples:

- `rate-limit-backoff.ts:9-19` lists `D7 / D8 / D11 / D12 / D24` as design references.
- `animator.ts:622, 660` reference `D13` and `D8` inline.
- `animator.test.ts:1582 describe('animate() eager boot reconciliation (D22)')` uses the D-number as a test-name anchor.

The D-numbers refer to the original commission's plan-doc decisions. After the commission concludes, those decisions are not surfaced anywhere a reader of the source can easily find — the source acts as a partial pointer to a now-archived planning artifact. A new contributor reading `// D7: a non-rate-limit terminal resets the back-off level only when ...` has the rule's text right there, but the D-number is meaningless to them.

Proposal: either (a) when committing a D-number-referencing decision, inline the rule's name in the source comment (e.g. `// In-flight straggler gate: a non-rate-limit terminal resets ...`) and drop the D7 anchor, or (b) maintain a stable `docs/architecture/animator-decisions.md` keyed by D-number that survives the commission's archival. Option (a) is cheaper and self-contained; option (b) preserves provenance.

For comparison, `packages/plugins/ratchet/src` has zero D-number references.
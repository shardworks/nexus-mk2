# Dashboard vs Dashboard — Natural Experiment

Date: 2026-04-07

## Setup

Two commissions for the same domain (web dashboard), same complexity rating
(20), dispatched months apart with different spec quality.

| Field | w-mni87qen (Mk 1) | w-mnorf3k0 (Oculus) |
|---|---|---|
| Title | Web Dashboard | The Oculus — Web Dashboard Apparatus |
| Complexity | 20 | 20 |
| Spec quality (pre) | weak | strong |
| Outcome | partial | success |
| Failure mode | broken | — |
| Revision required | yes | no |
| Tests | 0 | 44 |
| Fatal bugs | JS syntax error in onclick handlers | None |
| Lines of code | ~1000 (monolith) | 537 + 225 CSS + 43 types + 28 index |
| Codebase consistency (blind) | 3.00 | 5.00 |
| Composite (blind) | — | 4.33 (σ 0.12) |
| Composite (aware) | — | 4.67 (σ 0.25) |
| Integration | — | 4.17 (σ 0.24) |
| Revise session | — | 13-second no-op ($0.06) |

## Observations

### Spec quality is the dominant variable

The first dashboard had a weak spec — deliberately vague, exploratory. The
anima produced an impressive amount of work (full SPA with 5 tabs, sortable
tables, modals, API layer) but with a fatal JS syntax error: escaped quotes
inside template literal onclick handlers broke all writ action buttons. No
tests. A 1000-line html.ts monolith. The codebase_consistency score was
perfect (3.00 on the old scale) — the anima knew how to be a good plugin,
it just produced buggy output.

The second dashboard had a strong spec — 495 lines with full type
definitions, helper function signatures, explicit validation checklist, and
comprehensive test cases. The anima produced clean, well-structured code
with 44 tests covering all major behaviors. The reviewer found nothing to
fix. The revise session was a 13-second no-op.

### Confounds

- **Time gap**: ~5 days apart. Framework matured significantly between
  commissions — more apparatus patterns to follow, better plugin
  conventions established.
- **Model**: both used the same model class, but the second had access to
  a more mature codebase for in-context learning.
- **Rig evolution**: the first commission used an earlier, simpler rig
  without the implement→review→revise cycle. The second used the full
  three-session rig (though the revise session was a no-op).
- **Spec detail level**: the second spec was not just "strong" in the X013
  mountain-quality sense — it was prescriptive, with pseudocode and type
  definitions. This is an X014 (Technical Spec Quality) data point, not
  purely X013.

### Relevance to X013 H1

This is a strong data point for H1 (Spec Quality Predicts Output Quality).
The dominant variable is spec quality; the outcome difference is
categorical (broken vs clean). The confounds (time, rig maturity) exist
but the magnitude of the outcome difference exceeds what those factors
alone would explain — the first commission's fatal bug was in basic
JavaScript syntax, not in system integration or framework understanding.

### Relevance to X014

The Oculus spec was highly prescriptive — closer to pseudocode than a
mountain-quality spec. The anima's job was essentially transcription. This
is the same pattern seen in the Copilot commission (w-mnolvtcc, cx 8):
detailed spec → near-zero revision. The open question from X014: would a
mountain-quality spec at the same complexity have produced comparable
results, or does complexity 20 require this level of detail?

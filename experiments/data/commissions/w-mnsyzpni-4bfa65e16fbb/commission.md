## Goal

Decide whether Nexus should treat the verification contract — the mapping from every unit of work to a runnable check that demonstrates it — as a first-class, reusable pattern across the framework, rather than only as an implementation detail of the Astrolabe task-decomposition proposal. The outcome is (a) a crisp statement of the pattern, (b) an inventory of every place in Nexus where it could apply (Astrolabe task-level is one; commission-level, phase-level, review-level are others), (c) a recommendation on whether we lift "verification contract" into a shared writ metadata shape or keep it scoped per plugin, and (d) a sketch of how the pattern integrates with our existing review/seal loop.

## Status

parked — idea captured, conceptual work pending

## Next Steps

Next session: (1) re-read the GSD Nyquist section and write a one-page pattern statement that's agnostic to GSD's phase machinery; (2) walk every "work gets dispatched" seam in Nexus and ask "does this layer need a verification contract?" — commissions (yes, already via task-decomp proposal), whole rigs (maybe — rig-level acceptance beyond seal's build/test?), reviewer rigs (arguably — reviewers currently produce prose, not runnable checks), Astrolabe plans (yes, covered); (3) decide whether the pattern needs its own primitive (a `verification` writ type? a `contract` field on writs? a new book?) or is adequately expressed through per-plugin schemas.

## Context

GSD's "Nyquist Validation Layer" maps automated test coverage to each phase requirement during plan-phase research, before any code is written. Their plan-checker enforces this as a hard gate: plans where tasks lack automated verify commands do not get approved. The name is a reference to the sampling theorem — the idea being that you need enough feedback signal per unit of change to reconstruct what actually happened.

The Astrolabe task-decomposition proposal (`w-mnsxcp2m`) applies this pattern at the task level: every TaskUnit has a planner-written `acceptance` criterion and an optional runnable `verify` command, and the implementation rig runs those verifications before sealing. The verify-command quality quest (`w-mnsxe2fo`) tracks the "verify commands must actually be good" sub-concern.

But the pattern is broader than task decomposition. It says: **for any unit of work, the verification contract should exist before execution, and the agent defining "done" should not be the agent producing the code.** That principle applies at multiple layers:

- Commission level: a mandate writ could carry a `verification` field stating how the patron will know it's done. Today this is implicit in the commission body.
- Rig level: the seal engine runs build+test, which is one verification shape, but it's hardcoded to that shape. A rig-level contract would let different rigs declare different verifications.
- Review level: reviewers produce prose critiques, not runnable checks. A reviewer whose output included a verification contract would let the next iteration check whether the fix actually addressed the concern.
- Plan level: Astrolabe plans already move this direction via tasks[] with acceptance; the pattern is the generalization.

The correlated-failure argument from the task-decomp proposal applies at every layer too: wherever the same agent writes the code and the verification, the test case space is bounded by that agent's blind spots. Separating the two roles breaks the correlation.

The open design question is whether we represent this as a shared framework primitive or let each layer implement it in its own schema. Shared primitive = uniform tooling, easier to reason about, harder to migrate. Per-layer = faster to iterate, risks divergence.

## References

- GSD user guide § Validation Architecture (Nyquist Layer): `.scratch/gsd-research/USER-GUIDE.md:112-128`
- Related quest: `w-mnsxcp2m` — Astrolabe task decomposition (the specific application)
- Related quest: `w-mnsxe2fo` — Verify-command quality (sub-inquiry on quality floor)
- X013 (instrument scoring) work — adjacent territory on the review side
- Seal engine: `/workspace/nexus/packages/plugins/spider/src/engines/seal.ts` — current hardcoded verification

## Notes

- 2026-04-10: opened after GSD research pass surfaced the Nyquist concept as a pattern worth lifting. Sean explicitly wanted this as its own quest rather than folded into the Astrolabe task-decomp quest — because Nyquist is the meta-pattern and task-decomp is one specific application.
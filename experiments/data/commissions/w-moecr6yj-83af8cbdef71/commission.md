# Claude-code complexity diagnosis

## Intent

Read the claude-code plugin (`packages/plugins/claude-code/src/`) carefully and produce a diagnostic markdown report at `packages/plugins/claude-code/COMPLEXITY-AUDIT.md` identifying the specific sources of complexity that make this package expensive to change. The report enumerates structural patterns, ranks them by likely cost contribution, and proposes 2-4 concrete refactor candidates with rough effort estimates. The output is a decision-supporting artifact for a future refactor commission — not a refactor itself.

## Motivation

Empirical analysis of post-Apr-16 implement-engine cost flagged claude-code as a per-LOC cost-density hotspot at $0.019/LOC — slightly higher than animator's $0.018/LOC and roughly 1.9× the average rate ($0.010/LOC) across substrate plugins like spider, clerk, and astrolabe. The sample size is small (n=2 sessions touching claude-code in the dataset) so the per-LOC number should be treated as suggestive rather than conclusive, but the package has structural characteristics (subprocess plumbing, session lifecycle wiring, transcript I/O, signal handling) that plausibly explain the cost. This commission diagnoses the actual sources so a follow-on refactor can target them. Pairs with the parallel animator diagnosis — these two density hotspots may share underlying patterns.

## Non-negotiable decisions

- **Single output file: `packages/plugins/claude-code/COMPLEXITY-AUDIT.md`.** Markdown, structured. Committed.
- **The report covers, at minimum:**
  - **Structural inventory.** What are the major concerns the package handles? (e.g., subprocess invocation, session metadata wiring, transcript capture, signal handling, integration with the Animator API). Each concern named with its file(s) and a one-paragraph description.
  - **Complexity hotspots.** Per major concern, identify what specifically makes it expensive to read or change. Concrete signals: deep type relationships, branchy control flow, error-handling paths cutting across responsibilities, scattered concern-fragments across files, signal/process-management edge cases.
  - **Ranked refactor candidates.** 2-4 specific refactor proposals, each with: (a) what the proposal is, (b) what concern it addresses, (c) rough effort estimate (small / medium / large), (d) expected per-LOC cost reduction direction (high / medium / low confidence). Each candidate should be the seed of a future refactor commission.
  - **What NOT to refactor.** Patterns that look complex but are load-bearing for correctness (process lifecycle invariants, signal handling, exit-code semantics, subprocess race-condition guards) — flag these so future refactor work doesn't trip on them.
- **Read the actual code.** Don't reason from package descriptions, commit messages, or external docs alone. Walk `packages/plugins/claude-code/src/` file by file. Run greps for candidate complexity signals.
- **The report is intent-focused, not implementation-prescriptive.** Refactor candidates should describe *what* to change and *why it would help*, not *how* to write the new code.
- **Use the cost-density framing as a yardstick.** Reference points: cheap packages (ratchet $0.006/LOC, clockworks $0.005/LOC) vs density hotspots (animator $0.018/LOC, claude-code $0.019/LOC). The diagnosis should orient toward "what does claude-code carry that the cheap packages don't?"
- **Acknowledge the small sample size.** The cost-density estimate is from n=2 sessions. The report should note this and rank refactor candidates by structural reasoning (what is plausibly expensive to read), not solely by claimed cost contribution.

## Behavioral cases the report should answer

- After reading the report, can a future planner produce a refactor brief targeting one of the proposed candidates without needing to re-read the entire claude-code source?
- Are the refactor proposals scoped tightly enough that each could be a single commission?
- Does the report distinguish real complexity (subprocess invariants, signal handling) from accidental complexity (overly clever abstractions, scattered fragments)?
- Does the report identify any patterns that *also* show up in the animator diagnosis? (Both are density hotspots; shared patterns suggest a substrate-level issue.)

## Out of scope

- Performing any refactor. This commission produces a report only — no code changes to claude-code source.
- Modifying tests, types, or any non-audit file beyond writing the report.
- Comparing claude-code to other session-provider implementations or to external Claude SDK usage patterns.
- Cost-modeling of proposed refactors (the rough confidence estimate is enough).
- Recommending package decomposition or rename. Stay within existing package boundaries.

## References

- Cost data context: April 25 per-package cost-density analysis. claude-code at $0.019/LOC across n=2 sessions; second-highest per-LOC density measured.
- Pairs with: animator complexity diagnosis (parallel commission, same shape, different package).
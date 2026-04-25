# Animator complexity diagnosis

## Intent

Read the animator plugin (`packages/plugins/animator/src/`) carefully and produce a diagnostic markdown report at `packages/plugins/animator/COMPLEXITY-AUDIT.md` identifying the specific sources of complexity that make this package expensive to change. The report enumerates the structural patterns, ranks them by likely cost contribution, and proposes 2-4 concrete refactor candidates with rough effort estimates. The output is a decision-supporting artifact for a future refactor commission — not a refactor itself.

## Motivation

Empirical analysis of post-Apr-16 implement-engine cost identified animator as the highest per-LOC cost-density package in the framework. Sessions touching animator average $0.018 per line of churn — roughly 1.8× the average rate ($0.010/LOC) across spider, clerk, and astrolabe, and ~3× the rate of newer packages like ratchet ($0.006/LOC) and clockworks ($0.005/LOC). Three animator-focused sessions in the dataset averaged $28.43 each — the most expensive package-focused work measured. The mechanism is unknown but plausible candidates include the session lifecycle state machine (multiple status transitions, exit-code tracking, heartbeat plumbing), subprocess management (cancelHandle, pgid tracking, signal handling), and transcript I/O (CDC event chains feeding downstream consumers). This commission diagnoses the actual source so a follow-on refactor can target it.

## Non-negotiable decisions

- **Single output file: `packages/plugins/animator/COMPLEXITY-AUDIT.md`.** Markdown, structured. Committed.
- **The report covers, at minimum:**
  - **Structural inventory.** What are the major concerns the package handles? (state machine, subprocess plumbing, transcript I/O, status tracking, etc.) Each concern named with the file(s) it lives in and a one-paragraph description.
  - **Complexity hotspots.** Per major concern, identify what specifically makes it expensive to read or change. Concrete signals: deep type relationships, branchy control flow, multiple cross-cutting state transitions, error-handling paths that have to be reasoned about everywhere, scattered concern-fragments across multiple files.
  - **Ranked refactor candidates.** 2-4 specific refactor proposals, each with: (a) what the proposal is, (b) what concern it addresses, (c) rough effort estimate (small / medium / large), (d) expected per-LOC cost reduction direction (high / medium / low confidence). Each candidate should be the seed of a future refactor commission.
  - **What NOT to refactor.** Patterns that look complex but are load-bearing for correctness — flag these so future refactor work doesn't trip on them.
- **Read the actual code.** Don't reason from package descriptions, recent commit messages, or external docs alone. Walk `packages/plugins/animator/src/` file by file. Run greps for the candidate complexity signals (large enums, deeply nested conditionals, files with many functions, types with many generic parameters).
- **The report is intent-focused, not implementation-prescriptive.** Refactor candidates should describe *what* to change and *why it would help*, not *how* to write the new code. The future refactor commission's planner is the one to choose implementation. (Same discipline as a brief — describe the design decision, not the code.)
- **Use the cost-density framing as a yardstick.** The reference point is cheap packages — ratchet, clockworks, lattice — which average half the per-LOC cost. The diagnosis should orient toward "what does animator have that those don't, or what do they have that animator lacks?" Concretely: type complexity, state-machine surface, cross-cutting concerns.

## Behavioral cases the report should answer

- After reading the report, can a future planner produce a refactor brief targeting one of the proposed candidates without needing to re-read the entire animator source?
- Are the refactor proposals scoped tightly enough that each could be a single commission (as opposed to "rewrite everything")?
- Does the report distinguish *real complexity that we should pay for* (legitimate domain constraints, like exit-code semantics) from *accidental complexity we could remove* (overly clever abstractions, scattered concern-fragments)?

## Out of scope

- Performing any refactor. This commission produces a report only — no code changes to animator source.
- Modifying tests, types, or any other animator-related file beyond writing the audit report.
- Comparing animator to claude-code in detail — they're both density hotspots, but claude-code has a separate audit later.
- Cost-modeling of proposed refactors (the rough confidence estimate is enough; precise cost-savings projections are a separate measurement question).
- Recommending package decomposition or rename. Stay within the existing package boundaries.

## References

- Source click: `c-moe0m38e` — animator simplification candidate, top per-LOC density target.
- Cost data context: April 25 per-package cost-density analysis. The animator-touching sessions had attributed cost of $13.39/session vs $5-7 for spider/clerk/astrolabe and $3-6 for the cheap-package cohort.
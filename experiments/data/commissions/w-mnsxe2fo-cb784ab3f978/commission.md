_Imported from `.scratch/astrolabe-task-decomposition-proposal.md` § "Open Questions" #5 (2026-04-10)._

## Opened With

The task decomposition proposal rests on the 1:1 task→verification binding: the planner writes an `acceptance` criterion and (where possible) a runnable `verify` command, and the implementation rig's acceptance step runs those verifications before sealing. This breaks the correlated-failure loop because the agent defining "done" isn't the agent implementing the code.

But the promise only holds if the `verify` commands are **actually good**. A bad verify command is worse than no verify command: it reports success on a broken implementation and gives the seal engine false confidence. Examples of bad verify commands that would pass without catching real bugs:

- `test -f src/foo.ts` — proves the file exists, nothing about whether it works.
- `grep -q "export function foo" src/foo.ts` — proves a signature is present, nothing about behavior.
- `pnpm build` — catches compile errors, nothing about runtime correctness.
- `pnpm test` when the same agent wrote both code and tests — catches blind spots the agent doesn't have, which is a null set.

A good verify command exercises the *behavior* the task was supposed to deliver, from the outside, using inputs and checks the implementing agent didn't get to design. For example:

- `curl -s localhost:3000/api/plans | jq '.plans | length'` — hits the API surface, checks an observable outcome.
- `pnpm test -- --grep 'plan-init creates PlanDoc'` — runs a specific, planner-named test that the implementor had to make pass.
- `npx astrolabe plan-show <id> --format json | jq '.status == "reading"'` — queries observable state through the CLI.

The spec-writer is an LLM. It needs prompt guidance with concrete patterns and anti-patterns to produce good verify commands consistently. That prompt guidance is the open question.

## Summary

Blocker for Phase 2 shipping at quality. Without it, the decomposition mechanism ships but delivers weak verification — which is arguably worse than shipping nothing, because it creates the appearance of a safety net that isn't there.

**What this quest needs to produce:**

- A reference document (tome) with patterns and anti-patterns for verify commands, organized by task type (API endpoint, CLI command, structural change, refactor, new module, bug fix).
- Prompt guidance in the spec-writer's instructions that references the reference doc and teaches the model what good verification looks like.
- Optional: an automated "smell check" in `task-validate` that flags likely-bad verify commands before they reach the implementation rig. (e.g. "verify is only `test -f`" → warning. "verify is the entire test suite" → warning.)

**Open:**

- What's the pattern taxonomy? (API / CLI / structural / behavioral / regression-specific / other?)
- Can the smell check be mechanical, or does it need its own LLM pass? (Probably mechanical heuristics plus warnings; false positives are tolerable at this stage.)
- Where does the reference doc live — inside Astrolabe's plugin, or in the framework docs under `docs/architecture/apparatus/astrolabe/`?
- Does the spec-writer need few-shot examples baked into the prompt, or is a linked tome sufficient?
- How do we measure whether the guidance worked? Probably: commission-log tracking of `acceptance-step-passed + reality-check-failed` pairs. Every false positive is a data point that the verify commands aren't good enough yet.

## Notes

- **This is the quality gate for the entire decomposition proposal.** If we can't make verify commands reliable, task decomposition is a neat organizational tool but not the correlated-failure fix it claims to be.
- Feeds back into X013 (commission outcomes) as a measurable signal: we can compare commissions before and after decomposition to see whether the acceptance step actually catches bugs the seal engine misses.
- **Cross-link potential:** the commission quality quest cluster (T4) should reference this once opened, since the whole point of the acceptance step is improving commission outcomes.
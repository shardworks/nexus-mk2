# Review: w-mnif2seu-e879825d08eb

## Walker Increment 3 — Review and Revise Engines

**Outcome:** partial

**Spec quality (post-review):** adequate

**Revision required:** yes

**Failure mode:** incomplete

## Notes

Single commit, 714 insertions across 5 files (review.ts, revise.ts, walker.ts, types.ts, walker.test.ts). 40 tests passing. Blind 2.75 / aware 2.40, zero variance in both modes.

### What went well

All functional requirements met. Review engine runs mechanical checks, captures git diff/status, assembles the full prompt from spec template, launches reviewer session with metadata stashing. Revise engine assembles pass/fail branching prompt, sets GIT_AUTHOR_EMAIL for attribution. Types are clean. Test coverage is thorough — PASS/FAIL parsing, mechanical check capture + truncation, prompt assembly for both branches, updated pipeline tests for the launch/collect cycle.

### What needs revision

**`engine.id === 'review'` hardcoded in walker.ts collect step.** The anima put engine-specific yield assembly (parsing session.output, extracting PASS/FAIL, retrieving mechanicalChecks from metadata) directly in the Walker core behind an identity check. This couples the Walker to specific engine implementations. Needs a collect callback or registry pattern — spec already drafted in `.scratch/specs/engine-collect-callback.md`.

### Minor issues (not blocking)

- `gitStatus()` and `gitDiff*()` duplicated between review.ts and revise.ts — should be a shared utility. Spider rename will touch these files anyway.
- `err as { stdout?: string }` cast in `runCheck` — fragile error shape assumption.
- Git helper failures silently return empty strings with no logging.

### Spec quality note

Requirement #3 (register reviewer role) was a spec error — it's an operational/guild-side step, not a framework code change. The anima added the role to the live guild.json (correct), but it can't appear in the framework diff. Scorer flagged this as a requirement_coverage gap. Post-review quality downgraded from strong to adequate.

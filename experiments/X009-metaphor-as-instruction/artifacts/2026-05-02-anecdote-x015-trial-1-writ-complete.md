# Anecdotal observation — role file as the differentiator on writ-lifecycle restraint

**Date:** 2026-05-02
**Source trial:** X015 trial 1 (`w-moocgkzf-3b7e3f651ec4`, vibers laboratory)
**Status:** N=1 anecdote, not a controlled comparison. Surfaced opportunistically while running an unrelated experiment.

---

## What happened

X015 trial 1 ran a Sonnet implementer in a freshly bootstrapped lab test guild against the Clerk refactor commission. After 503 turns of substantive implementation work (116 file edits, 121 reads, 96 bash invocations), Sonnet's final actions were:

- **Turn 496 (text):** *"All 7 tasks are now complete. Let me mark the writ done:"*
- **Turn 497:** Searched the tool surface for `writ-complete`.
- **Turn 498 (thinking):** *"Now I need to complete the writ. ... Let me attempt to finalize this writ using that identifier."*
- **Turn 499:** Called `mcp__nexus-guild__writ-complete` (with a wrong id — used the draft branch suffix instead of the writ id).
- **Turn 500:** Listed open writs.
- **Turn 502:** Called `writ-complete` with the correct writ id. Writ went terminal. Scenario engine returned. Codex teardown deleted the bare repo before review/revise/seal could run.

The writ-complete tool is `permission: 'write'` — granted to artificer because the trial's manifest declared `permissions: ['clerk:*', 'tools:*']`. So the tool was available; Sonnet reached for it.

## What's anecdotally interesting

Sonnet *did not* exhibit this behavior in 50 historical implement sessions in vibers (Apr 4-8, 2026). Cross-checking the entire 281-session implement history in vibers:

| Model                   | Sessions | writ-complete calls |
|-------------------------|---------:|--------------------:|
| Opus 4-6                |       59 | 1 (1.7%)            |
| Opus 4-7                |      161 | 2 (1.2%)            |
| Sonnet 4-6 (vibers era) |       50 | **0 (0%)**          |
| Sonnet 4-6 (X015 trial 1) | 1     | 1 (100%)            |

Same model. Different environment. Big behavioral gap.

## The differentiator

The two environments differ in many ways (plugin set, codex contents, framework version, tool surface). The most parsimonious explanation is **role-instruction file presence**:

- **Vibers** has `roles/artificer.md` (~2.7K) which opens with: *"You are an artificer: a craftsman of the guild who inscribes codexes with new features at the patron's request."* The phrase "at the patron's request" implicitly establishes the pipeline frame: there is a patron, the patron requests, the artificer implements. The artificer is *not* the actor who closes the loop.
- **The X015 trial 1 test guild** had `loom.roles.artificer.permissions: ['clerk:*', 'tools:*']` — and **no role-instruction file**. The Loom's startup scan for `home/roles/<role>.md` found nothing. The artificer got tools but no narrative frame.

Without the role file, Sonnet's reasoning collapses to imperative tool-using: a `writ-complete` tool exists, the work is complete, complete it. The pipeline frame ("the seal engine closes the loop, not me") that vibers's role file communicates was absent.

## Why this is X009-relevant

X009 H1 (Role Framing Reduces Scope Drift) and H2 (Coherent Metaphor Outperforms Plain Instructions) both predict that role framing carries behavioral weight beyond decoration. This anecdote is consistent with both.

What's specifically interesting:

1. **The artificer.md file Sean wrote does not literally say "do not call writ-complete."** It establishes the role narratively. The "don't close the writ yourself" behavior emerges from the implicit pipeline frame, not from an explicit prohibition. That's a stronger version of the metaphor-carries-instruction claim — the file isn't a list of rules, it's an identity narrative, and it shapes behavior anyway.
2. **Opus appears more robust to absence of the file.** Across 220 vibers Opus implement sessions, only 3 ever called writ-complete. Opus seems to recover the pipeline frame even without explicit role narrative — likely because its structural reasoning is stronger. Sonnet leans on the metaphor more heavily.
3. **The differentiator isn't permission.** Vibers's artificer also has `clerk:*` (same as our trial). The narrow tactical fix in X015 trial 2 will be to drop `clerk:*` to `clerk:read` — defense in depth. But the *behavioral* fix is the role file, not the permission gate.

## Caveats — this is an anecdote, not a finding

- N=1 trial. Could be Sonnet randomness, not the role-file factor.
- Many other variables differ between vibers and the lab test guild (plugin set, charter absence, framework version 0.1.294 vs whatever vibers ran historically, etc.). Confounded.
- The sample of "Sonnet sessions in vibers" all ran in one ~4-day window (Apr 4-8) with then-current code. Maybe those sessions never reached the "I'm done" mood for unrelated reasons (shorter task scope, different planner output).
- The implementer prompt's `EXECUTION_EPILOGUE` says "Commit all changes before ending your session" — it does not say "do not close the writ." So the prompt itself is silent on the question.

For this to graduate from anecdote to evidence, X009 would want to run the controlled comparison its spec describes — same task, same model, three instruction variants (with role file / without role file / without metaphor at all) — and measure scope-drift and lifecycle-tool-call behavior across runs. This trial just provided an opportunistic data point.

## Updated trial 2 manifest carries both fixes

X015 trial 2 (`manifests/trial-2-clerk-refactor.yaml`) now:

1. Narrows artificer permissions from `clerk:*` to `clerk:read` (removes the writ-complete escape hatch).
2. Copies vibers's `roles/artificer.md` and `roles/patron.md` into the test guild via `lab.guild-setup`'s `files` parameter.

If trial 2 still ends up with the writ-complete behavior despite the role file, the role-file-as-differentiator hypothesis weakens (the permission was load-bearing). If trial 2 closes cleanly through review/revise/seal, both fixes contributed and X009's H1/H2 gain a supporting anecdote.

## References

- Trial 1 transcript: `experiments/X015-spec-detail-model-substitute/artifacts/2026-05-02-trial-1-extract/`
- Trial 1 analysis: `experiments/X015-spec-detail-model-substitute/artifacts/2026-05-02-trial-1-analysis.md`
- Click for the wider design question (writ-lifecycle tool access): `c-moof5nig`
- Vibers's role file (snapshot copied to fixtures): `experiments/X015-spec-detail-model-substitute/fixtures/test-guild/roles/artificer.md`
- writ-complete tool definition: `/workspace/nexus/packages/plugins/clerk/src/tools/writ-complete.ts` (`permission: 'write'`)

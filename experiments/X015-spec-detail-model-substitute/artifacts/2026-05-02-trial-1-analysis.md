# X015 trial 1 — Sonnet vs Opus on Clerk refactor (analysis)

**Date:** 2026-05-02
**Trial writ:** `w-moocgkzf-3b7e3f651ec4` (vibers laboratory)
**Baseline:** `w-mod6458g-992589fcce60` (vibers, Apr 23, all-Opus)

---

## Headline

Sonnet ran ~503 turns at ~$20 cost (vs Opus's 440-turn / $45 successful attempt) and self-reported "Completed all 7 tasks: 402/402 tests pass." That claim was **technically true for the clerk package only**. The full-monorepo picture is incomplete:

- **Files touched: 12 (Sonnet) vs 26 (Opus).** Sonnet missed half the files Opus touched.
- **Diff volume: +965/-988 (Sonnet) vs +1792/-1667 (Opus).** ~57% volume.
- **Typecheck status:** 8 errors in `packages/plugins/clerk` (`WritPhase` references in `clerk.ts`, `tools/writ-show.ts`, `tools/writ-tree.ts` — Sonnet widened the type but didn't update consumers in the same package's `tools/` subdir).
- **Test status:** clerk 402/402 ✓, but **spider tests fail** with cascade-lifecycle regressions (Sonnet didn't migrate spider's test fixtures off the retired clerk writTypes API).

**Verdict on Sonnet's output:** Incomplete. Would have failed Opus's review at the mechanical-checks layer. Not a question of subtle quality — straightforwardly missing work.

---

## Trial flow note (out-of-band finding)

The trial completed prematurely due to a flow bug: the `artificer` role had `clerk:*` permission, which includes `writ-complete`. Sonnet — having decided it was done — called `mcp__nexus-guild__writ-complete` on its own commission. The writ went terminal, the scenario engine returned, and **the codex bare repo was deleted at teardown before review/revise/seal could capture commits.** The actual diff was lost.

This analysis uses a **transcript replay**: 115/116 of Sonnet's `Edit`/`Write`/`MultiEdit` tool calls applied cleanly to a fresh checkout at `d871dd76`. One Edit at index 105 (in `clerk/src/index.ts`) failed with `old_string not found` — likely a stale reference after an earlier overlapping edit. The reconstruction's diff is therefore a faithful approximation, not the literal worktree.

The flow bug is captured separately at click [`c-moof5nig`](#) — design question is whether anima should ever touch writ lifecycle.

---

## Where Sonnet succeeded (clerk core)

Sonnet did **the headline refactor work** competently:

| File | Opus +/- | Sonnet +/- | Notes |
|---|---|---|---|
| `clerk/src/clerk.ts` | +463/-356 | +200/-230 | Same intent, less code (smaller helpers) |
| `clerk/src/clerk.test.ts` | +548/-944 | +437/-586 | Both rewrote test surface significantly |
| `clerk/src/types.ts` | +104/-37 | +44/-25 | Same WritDoc.phase widening |
| `clerk/README.md` | +80/-40 | +141/-50 | Sonnet wrote MORE docs |
| `astrolabe/src/astrolabe.ts` | +38/-9 | +31/-9 | Both registered piece + observation-set |
| `docs/architecture/apparatus/clerk.md` | +47/-79 | +77/-54 | Both refreshed |

The clerk package itself compiles and its 402 tests pass under Sonnet's diff. So the core API design — `registerWritType`, classification predicates, mandate as a registered type — Sonnet got right.

---

## Where Sonnet failed (consumers + tooling)

**14 files Opus touched, Sonnet missed entirely** — sorted by churn:

| File | Opus +/- | Why it mattered |
|---|---|---|
| `spider/src/spider.test.ts` | +241/-107 | Test fixtures migrated off retired `writTypes` channel |
| `clerk/src/testing.ts` | +77/-0 | New `makeWritTypeApparatus` test helper Opus introduced |
| `spider/src/piece-pipeline.test.ts` | +66/-36 | Same fixture migration |
| `spider/src/engine-retry.test.ts` | +17/-1 | Same |
| `spider/src/rate-limit.test.ts` | +16/-1 | Same |
| `framework/arbor/src/guild-lifecycle.test.ts` | +13/-13 | Cross-package consumer of clerk lifecycle |
| `astrolabe/src/engines.test.ts` | +10/-3 | Astrolabe consumer test |
| `spider/src/engines/piece-session.ts` | +9/-2 | Spider consumer of clerk API |
| `clerk/src/tools/writ-tree.ts` | +6/-2 | **TYPECHECK ERROR** — uses `Record<WritPhase,...>` |
| `clerk/src/tools/piece-add.ts` | +6/-1 | Clerk's own tool layer |
| `clerk/src/tools/writ-show.ts` | +3/-3 | **TYPECHECK ERROR** — assigns string to WritPhase |
| `spider/README.md` | +2/-1 | |
| `astrolabe/src/engines/observation-lift.ts` | +0/-2 | |
| `framework/core/README.md` | +0/-2 | |

**The pattern is unambiguous:** Sonnet missed the entire category of "consumer migration" work. The files it skipped fall into three buckets:
1. **Spider's test fixtures (5 files)** — the package most affected by the retired clerk `writTypes` channel.
2. **Clerk's own `tools/` subdir (3 files)** — same package, different subdir, but uses types Sonnet widened.
3. **Adjacent consumers** (arbor, astrolabe, framework, spider non-test) — bit-players in the cross-cutting change.

Mapping to the original Opus rig's commit timeline:

```
b98151f  clerk: registerWritType + classification + WritDoc.phase widening    ✓ Sonnet did
6ccc611  clerk: seed mandate into the new writ-type registry from start()     ✓ Sonnet did
29bd8b0  astrolabe: register piece + observation-set                          ✓ Sonnet did
f4da4ec  clerk: delete cascade, kit channel, and guild-config registry        ✓ Sonnet did
91e51a0  clerk: add makeWritTypeApparatus test helper                         ✗ MISSED
11332dc  spider, lattice: migrate test fixtures off retired channels          ✗ MISSED
e9d3234  docs: refresh clerk README + apparatus + cross-package mentions      ✓ Sonnet did
e630409  spider, clerk: revision pass — fix downstream test fallout           ✗ MISSED
```

**Sonnet completed 5 of the 8 commits' worth of work.** The last commit (downstream test fallout) is, by name, exactly what Opus's *revise pass* did after its review surfaced the same kind of issue.

---

## Cost & efficiency

Note: comparison limited to **implement engine** since Sonnet's session was the only one that ran. Opus had a full pipeline (planner + draft + 4 implement attempts + 2 reviews + revise + 2 seal phases). The numbers below are implement-only:

| Metric | Opus (4 attempts) | Opus (final successful only) | Sonnet (1 attempt) |
|--------|------------------:|-----------------------------:|-------------------:|
| Sessions | 4 | 1 | 1 |
| Cost | $65.19 | $45.55 | **~$20.09** |
| Turns | 729 | 440 | 503 |
| Wall clock | 69.5m | (subset of 69.5m) | ~63m |

Sonnet ran **+14% turns** for **-56% cost** vs Opus's successful attempt — token-pricing arbitrage is real, even with a slightly longer session. If a Sonnet implement + Opus reviewer produces good work in the end, the cost case is strong.

---

## Implications for X015 H1

X015 H1: *"Detailed planner-pipeline specs reduce model capability requirement; Sonnet matches Opus."*

This trial is **inconclusive on H1** because the rig didn't run to completion. What it DID show:

- **Sonnet handled the conceptual core.** The headline refactor (registerWritType, classification predicates, type widening) was implemented competently in 503 turns at ~$20.
- **Sonnet missed the cross-cutting migration.** Specifically the work that requires repository-wide search-and-update discipline. The pattern: Sonnet finished the *focused* work (clerk + clerk.test) and stopped, declaring victory.
- **The pipeline would have caught the gap.** Reviewer mechanical checks (typecheck + spider test) would FAIL → revise engine → Sonnet fixes → eventual completion. We just didn't get to run that loop because of the flow bug.

So: Sonnet alone is not sufficient for cross-cutting refactors. **Sonnet + a working review/revise cycle** is the actual question — and that wasn't tested here.

---

## Suggested next moves

1. **Re-run the trial with a fixed manifest.** Drop `clerk:*` from the artificer role. (The narrow tactical fix; the strategic question lives in click `c-moof5nig`.) This time the writ-complete escape hatch is closed and the rig will run to completion — review/revise/seal will happen, and we'll see whether the iteration loop catches Sonnet's gaps.
2. **Decide on H1 read after re-run.** If Sonnet eventually produces a passing diff (with Opus reviewing and pushing back), H1 holds. If Sonnet's revise attempts also fall short of the cross-cutting work, H1 is suggestive of failure for refactor-class commissions.
3. **Track the failure mode separately.** "Sonnet skips consumer migration in cross-cutting refactors" is a reusable hypothesis for future trials. May want a second trial type that tests a *non-refactor* commission (e.g., greenfield feature) to see if Sonnet's gap is specific to refactors or general.

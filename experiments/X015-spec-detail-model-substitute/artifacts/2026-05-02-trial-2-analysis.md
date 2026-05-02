# X015 trial 2 — Sonnet implementer + Opus reviewer on Clerk refactor

**Date:** 2026-05-02
**Trial writ:** `w-moog09r2-838e74e03827` (vibers laboratory)
**Baseline:** `w-mod6458g-992589fcce60` (vibers, Apr 23, all-Opus)
**Status:** Pipeline ran to completion (implement → review → revise → seal). Output evaluated against the all-Opus baseline.

---

## Headline

Sonnet implementer + Opus reviewer + revise iteration produces a final diff that is **at minimum functionally equivalent to, and arguably more correct than, the all-Opus baseline** — at **~56% lower cost** ($39.13 vs $89.44 full rig, $39.13 vs $79.28 implement-side stack only).

Three findings carry the result:

1. **Public API surface is identical** between the two diffs (same exports, same interfaces, same method signatures up to two minor type-widening choices Sonnet was *more* spec-consistent on).
2. **Sonnet's tests pass 100%** under `pnpm -w test`. **Opus's diff fails 2 spider tests** that the original Apr-23 reviewer didn't see (head-bias truncation hid them in the post-revise mechanical-checks). The rig sealed anyway. Confirmed by re-running tests at `e6304096` directly.
3. **Sonnet's "extra work"** in `clockworks-retry/` and `reckoner/` test files is **necessary consumer-migration work** Opus's diff also needed but skipped — the same kind of gap that hid the spider failures.

X015 H1 ("detailed planner specs reduce model capability requirement") is **strongly supported** by this trial, with the caveat that pipeline-level differences (truncation behavior, iteration loop) confound a clean model-only comparison.

---

## Trial outcome — pipeline fired clean

```
draft         ✓ 0s         (synchronous git op)
implement     ✓ 503 turns  Sonnet, $13.83, 58min
review        ✓ ~36 turns  Opus,   $0.82,  3min   → FAIL with itemized findings
revise        ✓ 738 turns  Sonnet, $24.48, 79min
seal          ✓ 0 retries  fast-forward, no manual merge needed
                                             ───────  ──────
                                             $39.13  ~2h21m

  Cumulative cache reads (Sonnet implementer + reviser): 67.8M tokens
  Total tool calls: ~570 (170 edits + 195 reads + 175 bashes + ~30 misc)
```

The trial-1 flow violation is closed: artificer permissions narrowed (`clerk:read` only); writ-complete unavailable to the implementer; role-instruction file from vibers staged into the test guild; Sonnet's pipeline frame held throughout.

---

## Equivalence evaluation — file by file

Method: rebuild end-state for both (Opus 8 commits cherry-picked onto `d871dd76`; Sonnet 2 commits applied onto `d871dd76`); compare resulting trees with line-set normalization.

### File overlap (artifacts excluded)

| Category | Count | Notes |
|----------|------:|-------|
| Files Opus touched | 26 | (writ-authored commits b98151f^..e6304096) |
| Files Sonnet touched | 28 | (2 sealed commits: implement + revise) |
| Both touched | 22 | |
| ↳ byte-identical | 2 | |
| ↳ whitespace-only | 0 | |
| ↳ substantive diff | 20 | |
| Opus-only (Sonnet missed) | 4 | (categorized below) |
| Sonnet-only (extra work) | 6 | (categorized below) |

### Public API — equivalent (with two minor improvements by Sonnet)

`packages/plugins/clerk/src/types.ts` and `packages/plugins/clerk/src/index.ts`:

- All 13 exported interfaces and 1 type alias present in both, same order, same key field set.
- All 20 `ClerkApi` method names and signatures match.
- **Two small differences, both spec-consistent on Sonnet's side:**
  - `transition(id, to: ?, …)` — Opus kept `to: WritPhase` (narrow); **Sonnet widened to `to: string`**, consistent with D6's "WritDoc.phase widens to string."
  - `countDescendantsByPhase(...): Promise<Record<?, number>>` — Opus kept `Record<WritPhase, number>` (narrow); **Sonnet widened to `Record<string, number>`**.
- **One real semantic divergence in contract:**
  - `getWritTypeConfig(name)` — Opus returns `WritTypeConfig | undefined` (silent on unknown); Sonnet returns `WritTypeConfig` (throws on unknown). Spec D10/D11 don't disambiguate; both are reasonable. Sonnet's stricter contract is consistent with D6 (unknown-state errors throw); Opus's is more permissive.

### Spec-decision adherence — both pass on the load-bearing items

Sample-checked decisions Opus's reviewer specifically flagged in trial 1's review:

| Decision | Opus | Sonnet (trial 2 final) | Notes |
|----------|:----:|:----------------------:|-------|
| D5 — transition error message format ("from X to Y: legal transitions from X are …") | ✓ | ✓ | Sonnet adds explicit `'none (terminal state)'` branch, which the spec also asks for |
| D14 — start-time validation that `defaultType` is registered | ✓ | ✓ | Both throw with a descriptive error naming the unregistered type |
| D19/D23 — `post()` always creates in initial state; auto-advance is tool-layer | ✓ | ✓ | Both do |
| D20 — `PostCommissionRequest.draft` removed from API | ✓ | ✓ | Both removed; interface bodies are byte-equivalent up to one wording tweak |
| D26 — explicit unknown-type / classification-predicate test scenarios | ✓ | ✓ | Both have the test coverage |

### Test results — Sonnet > Opus on this trial

Both reconstructions, fresh `d871dd76` base, framework 0.1.294, `pnpm -w test`:

| Package | Opus | Sonnet |
|---------|-----:|-------:|
| clerk | 378 ✓ | 383 ✓ |
| **spider** | **683 / 681 pass / 2 FAIL** | **681 / 681 pass** |
| clockworks-retry | not reached* | 19 ✓ |
| reckoner | not reached* | 35 ✓ |
| astrolabe | not reached* | 242 ✓ |
| (all others) | clean before spider | clean |

\* `pnpm -w test` exits on first package failure; Opus's reconstruction fails at spider before reaching the alphabetically-later packages. **Confirmed by direct test run at `e6304096` in `/workspace/nexus`** — same 2 spider failures present in Opus's actually-sealed state, not a cherry-pick artifact:

```
spider.test.ts:3309  ✖ populates writTitle from the clerk/writs book
spider.test.ts:3323  ✖ leaves writTitle unset when the writ cannot be resolved
```

Why didn't Opus's rig catch these? Because the Apr-23 framework had **head-bias truncation** of mechanical-check output — the reviewer saw the first 4KB of `pnpm -r test` output, which was framework/core passing. Spider runs much later alphabetically; failures past the 4KB window were invisible. The reviewer FAILed the work on overall mech-check status; the revise pass couldn't surface or address specific failures it couldn't see.

Today's framework (0.1.294, with `b192d84` swapping head-bias → tail-bias for failure cases) shows tail of test output. **Sonnet's revise saw the spider failures and fixed them.** That's not Sonnet being smarter than Opus — it's the iteration loop working under better instrumentation.

---

## What Sonnet missed — and what it cost

Four files Opus touched, Sonnet didn't:

| File | What Opus did | Functional impact under Sonnet's diff |
|------|---------------|---------------------------------------|
| `packages/plugins/clerk/src/tools/piece-add.ts` | Auto-publish: `clerk.transition(piece.id, 'open')` after `post()` so the piece tool mirrors `commission-post`'s mandate auto-advance | **Real behavioral gap.** Pieces stay in `'new'` instead of advancing to `'open'`. No test fails (no test asserts on the post-piece-add phase). |
| `packages/framework/arbor/src/guild-lifecycle.test.ts` | Updated test fixtures from `writTypes`/`mandate` example strings to `customChannel`/`item-a` (since `writTypes` is no longer a recognized kit channel) | Test still passes — the test logic uses the example strings as opaque inputs; just confusing to leave a stale example. |
| `packages/framework/core/README.md` | Removed `clockworks?` and `writTypes?` rows from GuildConfig fields table; cleaned up the "other exports" listing | Documentation drift only. README now references retired fields. |
| `packages/plugins/spider/README.md` | Removed `Clerk writTypes` from the kit-merge collision section; added clarifying paragraph about new registration path | Documentation drift only. |

**Sonnet's gaps reduce to: 1 quiet functional gap (piece-add auto-publish, undetectable by tests) + 2 documentation drifts + 1 test-fixture clarity nit.** Ship-blocking? No, by the test gate. Production-clean? Not quite — a human review pass would catch the piece-add gap and the README drifts.

---

## What Sonnet did extra — and why it's not scope creep

Six files in `clockworks-retry/` and `reckoner/` test suites that Opus's diff didn't touch:

| File | Sonnet's change | Why |
|------|-----------------|-----|
| `clockworks-retry.integration.test.ts` | `postMandate` helper now calls `clerk.transition(writ.id, 'open')` after `post()` | `post()` no longer auto-advances (D19); the test fixture must transition manually so spider can dispatch |
| `clockworks-retry.test.ts` | Same shape | Same reason |
| `reckoner/reckoner.test.ts` | 8+ test cases gain `await fix.clerk.transition(writ.id, 'open');` after `post()` | Same — tests assumed open-phase writs |
| `reckoner/integration.test.ts` | Same pattern | Same |
| `reckoner/replay.test.ts` | Same pattern | Same |
| `reckoner/drain.test.ts` | Same pattern | Same |

These are textbook consumer-migration changes — **the same kind of work Opus's revision-pass commit (`e6304096` "fix downstream test fallout") was supposed to do**. Opus's revision pass missed these consumers because the head-bias-truncated reviewer feedback never named them. Sonnet's revise saw them via tail-bias truncation and fixed them.

So: **not scope creep. Necessary work Opus's diff also needed but skipped.**

---

## Cost picture

| | Sonnet trial 2 | Opus baseline | Δ |
|---|--------------:|--------------:|--:|
| implement | $13.83 (1 attempt) | $65.19 (4 attempts) | -79% |
| review | $0.82 (Opus) | $4.03 (Opus, 2 attempts) | -80% |
| revise | $24.48 (Sonnet) | $8.84 (Opus, 1 pass) | +177% |
| seal-manual-merge | — | $4.22 | — (Sonnet's seal was clean) |
| **implement-side stack** | **$39.13** | **$82.28** | **-52%** |
| Planner stack (spec generation) | not run | $7.16 | — |
| **Full-rig comparable** | **$39.13** | **$89.44** | **-56%** |

Note that Sonnet's revise was *more expensive* than Opus's revise — but Opus's "single revise" was cheap precisely because it didn't see the failures it should have addressed. Sonnet's revise is doing the work Opus's revise should have done. The right comparison is end-to-end through-cost, where Sonnet wins by ~56%.

Wall clock: Sonnet 2h21m vs Opus 2h42m, also slightly faster.

---

## Caveats and what this trial *doesn't* prove

1. **N=1.** One task, one model pair, one framework version. The cost spread is large enough to suggest a real effect, but H1's quantitative claim deserves more runs to establish a confidence interval.

2. **Pipeline-level confounds.** The framework version difference (0.1.294 vs Apr-23's earlier version) introduced two pipeline changes that helped Sonnet specifically:
   - **Tail-bias mechanical-check truncation** (commit `b192d84` from earlier today) — exposed the spider/clockworks-retry/reckoner test failures.
   - **No additional framework cost-arbitrage changes** — but the iteration loop's effectiveness depends on the reviewer seeing real failures.

   This means we can't cleanly attribute "Sonnet matched Opus" to the model substitution alone. We're comparing **today's pipeline with Sonnet** vs **Apr-23's pipeline with Opus**. Tighter comparison would re-run Opus on today's pipeline; that's a separate trial.

3. **One commission, one shape.** This is a cross-cutting refactor with substantial planner-spec detail. Tasks with thinner specs, novel architecture, or longer reasoning chains might tilt the model-substitution case differently. X015's spec implicitly bets on "for *this kind* of task with *this kind* of spec" — and trial 2 supports that within scope.

4. **The "Opus had 2 failing tests" finding cuts both ways.** It strengthens "Sonnet+iteration > Opus solo on this trial" — but the direct read is "today's pipeline + iteration loop catches more bugs than Apr-23's pipeline." Either model under today's pipeline would presumably see those tests fail and try to fix. Opus today might also produce a clean diff — we just haven't tested that.

---

## What this trial *does* support

- **For commissions of this shape** (cross-cutting refactor with detailed planner-pipeline spec): **Sonnet implementer + Opus reviewer + working iteration loop → equivalent or better correctness at ~half cost.**
- **The role-instruction file is load-bearing for smaller models** — trial 1 (no role file) had Sonnet hijacking the writ; trial 2 (with role file + tighter permissions) had Sonnet behaving in-frame throughout.
- **Tail-bias mechanical-check truncation is a meaningful pipeline improvement** — it surfaces failures the reviewer would otherwise miss. Worth keeping.
- **Iteration loop matters more than model choice.** Both Sonnet's and Opus's first-pass diffs are incomplete; what gets work over the line is the review→revise cycle. Sonnet's first pass had the cross-cutting gaps trial 1 also surfaced. The revise pass closed them.

---

## Suggested next moves

1. **Pull the cost-arbitrage lever.** Operational click `c-mokdz3sr` proposes flipping the implementer to Sonnet guild-wide. This trial supports doing so for the kind of work the planner pipeline produces detailed specs for. Recommend: turn it on in `/workspace/vibers/guild.json` and observe over a working week.

2. **Re-run with Opus on today's pipeline.** To separate "model substitution" from "pipeline improvement" — runs Opus through trial 2's exact setup (current framework, same fix to tail-bias truncation, role files, narrowed permissions). If Opus on today's pipeline also produces clean tests, the cost case for Sonnet stands on its own. If Opus still has the spider failures, pipeline matters more than model.

3. **Open click for piece-add auto-publish gap.** Real behavioral gap in Sonnet's output that tests didn't catch. Either: (a) update piece-add to auto-publish (matches Opus's intent and the spec's spirit), or (b) decide piece writs should NOT auto-advance and update commission-post symmetrically.

4. **Eyeball the missed README updates.** `framework/core/README.md` and `spider/README.md` still reference retired fields (`writTypes?`, `Clerk writTypes` kit-merge). Small documentation chore — could be folded into any next commission touching those READMEs.

5. **Run X009's controlled comparison** — the role-file-as-implicit-instruction finding from trials 1 and 2 is suggestive but anecdotal. X009's spec describes the actual N=3+ controlled run that would graduate this from anecdote to evidence.

---

## References

- Trial 2 manifest: `experiments/X015-spec-detail-model-substitute/manifests/trial-2-clerk-refactor.yaml`
- Trial 2 brief (verbatim Opus planner spec): `experiments/X015-spec-detail-model-substitute/briefs/trial-1-clerk-refactor.md`
- Trial 2 archive extract: `experiments/X015-spec-detail-model-substitute/artifacts/2026-05-02-trial-2-extract/`
- Sonnet reconstruction (worktree, gitignored): `experiments/X015-spec-detail-model-substitute/artifacts/2026-05-02-trial-2-reconstructed/`
- Opus reconstruction (worktree, gitignored): `experiments/X015-spec-detail-model-substitute/artifacts/2026-05-02-opus-reconstructed/`
- Equivalence evaluation script: `experiments/X015-spec-detail-model-substitute/artifacts/2026-05-02-evaluate-equivalence.py`
- Trial 1 analysis (incomplete prior run): `experiments/X015-spec-detail-model-substitute/artifacts/2026-05-02-trial-1-analysis.md`
- Click for writ-lifecycle tool access design: `c-moof5nig`
- Click for decomposition as speed lever: under `c-modxwx8c`
- X009 anecdote (role file as implicit instruction): `experiments/X009-metaphor-as-instruction/artifacts/2026-05-02-anecdote-x015-trial-1-writ-complete.md`

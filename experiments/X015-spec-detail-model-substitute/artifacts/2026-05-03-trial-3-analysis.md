# X015 Trial 3 — analysis

**Trial writ:** `w-mop6gn5c-2ebbdb8c6eba`
**Posted:** 2026-05-03T02:54:54Z
**Resolved:** 2026-05-03T06:50:46Z (after manual scenario-engine patch — see [attempt-1 failure note](./2026-05-03-trial-3-attempt-1-failure.md) and the `c-mopf0ikk` click)
**Codex base:** `03d36cb849c92d0ab434c9bd4a066716c8f50fbb`
**Sonnet sealed commit:** `81479f75444fc2b943a4fe817849028639f01f44`
**Opus baseline sealed commit:** `1a9f0389b6ceadab6a5c8676e26f0895698f3c59`

The greenfield-contrast trial of the X015 sequence: rate-limit-aware
scheduling. Sonnet implementer + Opus reviewer, full pipeline, N=1.

---

## 1. Cost & wall-clock

| Stage | Sessions | Duration | Cost |
|---|---|---|---|
| implement (Sonnet) | `ses-mop6h2ln` | 1h14m | $17.47 |
| review (Opus) | `ses-mop97rdk` | 2m50s | $0.71 |
| revise (Sonnet) | `ses-mop9biiu` | 42m51s | $6.12 |
| seal | (git fast-forward) | — | — |
| **Total** | **3 sessions** | **2h22m** | **$24.30** |

| | Trial 3 (this run) | Opus baseline (trial 3 writ) | Trial 2 (Clerk refactor, Sonnet+Opus) |
|---|---|---|---|
| Cost | **$24.30** | $57.26 | $39.13 |
| Wall clock | 2h22m | 2h11m | 2h21m |
| Implement attempts | 1 (clean) | 1 (clean) | 1 (clean) |
| Revise turns | 738 (sub-spawn) | 3 (tiny) | 738 |

**Sonnet's cost on greenfield infra: 42% of Opus.** This is the strongest
cost-arbitrage data point of the X015 sequence — Trial 3's Opus baseline
was already a cleaner-than-usual run (1 implement attempt, near-trivial
revise), so there was less waste to cut, and Sonnet still came in at
under half the cost.

The pipeline ran end-to-end with no manual intervention on the inner
guild side. The outer trial writ was forced to terminal manually after
the lab-host daemon was restarted mid-trial and orphaned the polling
watcher (filed as click `c-mopf0ikk`). The inner work was unaffected.

---

## 2. Surface comparison

Both worktrees were reconstructed by applying the captured codex-history
patches against `03d36cb`. Reconstruction script + raw equivalence
report archived alongside this analysis.

| | Files | Insertions | Deletions |
|---|---|---|---|
| Opus | 33 | +2779 | -44 |
| Sonnet | 28 | +2005 | -105 |

| Bucket | Count |
|---|---|
| Both touched, byte-identical | 2 |
| Both touched, substantive divergence | 22 |
| Opus-only (Sonnet missed) | 9 |
| Sonnet-only (extra work) | 4 |

### Opus-only files (Sonnet missed)

```
packages/framework/cli/src/commands/start.ts
packages/plugins/animator/src/index.ts
packages/plugins/animator/src/rate-limit-backoff.ts          ← back-off state machine, separate module
packages/plugins/animator/src/rate-limit-backoff.test.ts     ← its tests
packages/plugins/animator/src/tools/animator-status.test.ts  ← status tool tests
packages/plugins/claude-code/README.md
packages/plugins/claude-code/src/rate-limit-detection.test.ts
packages/plugins/spider/README.md
packages/plugins/spider/src/rate-limit.test.ts
```

Of those nine, **eight are organizational rather than functional**:
- `rate-limit-backoff.ts` is a separate module Opus extracted; Sonnet
  inlined the back-off state machine into `animator.ts` (1004 lines
  vs Opus's 892, gaining ~112 lines of inline logic against Opus's
  separate 390-line module).
- The four `*.test.ts` files marked Opus-only correspond to functionality
  Sonnet tested by extending existing test files instead of creating
  new ones. (See "Sonnet-only" bucket below.)
- The two `README.md` files are doc updates Sonnet skipped — minor,
  not behavioral.
- `animator/src/index.ts` is the package barrel; Sonnet didn't need
  to re-export anything new because everything stayed inside `animator.ts`.

The **one functional miss** is `packages/framework/cli/src/commands/start.ts`:
Opus widened the daemon's local `SessionDocLike.status` union to include
`'rate-limited'`. Sonnet didn't touch this file. If Sonnet's
end-state introduces session docs with `status: 'rate-limited'` (which
it does, via the canonical `SessionDoc` type) and the daemon's inline
crawl loop ever inspects status exhaustively, that's a typecheck or
runtime exhaustiveness error. **Severity:** medium — a structural
type narrowing TypeScript will likely catch at typecheck.

### Sonnet-only files (extra work)

```
packages/plugins/animator/src/tools/session-tools.test.ts
packages/plugins/claude-code/src/babysitter.test.ts
packages/plugins/claude-code/src/stream-parser.test.ts
packages/plugins/spider/src/spider.test.ts
```

These four are existing test files Sonnet extended with
rate-limit-related cases — the inverse organizational choice from
Opus's per-feature `*.test.ts` files. Both styles are reasonable;
neither is "more correct."

### Substantive-difference table (top 6 by line volume)

| File | Opus-unique lines | Sonnet-unique lines |
|---|---:|---:|
| `animator/src/animator.ts` | 120 | 180 |
| `animator/src/animator.test.ts` | 93 | 162 |
| `docs/architecture/apparatus/animator.md` | 67 | 91 |
| `animator/src/types.ts` | 102 | 55 |
| `claude-code/src/index.ts` | 97 | 33 |
| `claude-code/src/babysitter.ts` | 62 | 36 |

(Full table in `2026-05-03-trial-3-equivalence-raw.md`.)

---

## 3. Real semantic divergences

Three substantive differences worth flagging:

### 3.1 Status book name (D1 violation, Sonnet)

The spec mandates `books_animator_status` (D1). The book name passed
to `stacks.book(kit, name)` is appended to a `books_<kit>_` prefix,
so:

```ts
// Opus
statusBook = stacks.book<AnimatorStatusDoc>('animator', 'status');
// → books_animator_status ✓ (matches spec)

// Sonnet
animatorStatusBook = stacks.book<AnimatorStatusDoc>('animator', 'animator_status');
// → books_animator_animator_status ✗ (redundant 'animator_' prefix)
```

**Impact:** internally consistent on each side — both find their own
book — but the SQLite table name is non-spec on Sonnet's side. Any
external consumer that read the spec and queries `books_animator_status`
directly will not find Sonnet's data. **Severity:** low for
single-tenant runtime correctness; meaningful for spec adherence and
potential migration cost.

### 3.2 Termination tag type name + field names

Both sides introduce a structured tag carried `provider → Animator`
on the session-record payload (D4). The shape diverges:

| | Type name | Reason field | Source field | Source values |
|---|---|---|---|---|
| Opus | `SessionTerminationTag` | `kind: 'rate-limit'` | `source` | `'ndjson-result' \| 'stderr-pattern' \| 'exit-code'` |
| Sonnet | `TerminationTag` | `reason: 'rate-limited'` | `detectedBy` | `'ndjson' \| 'stderr' \| 'exit-code'` |

The spec doesn't pin the type name or field names. Both shapes carry
the same information. **Severity:** none for a single-tenant build;
matters if either type is part of a published API surface.

### 3.3 `autoUnstick` gating in `crawl()` — Sonnet correct, Opus violates D14

D14: *"Only `tryRun` and `trySpawn` are short-circuited; `tryCollect`,
`tryProcessGrafts`, `tryCheckBlocked`, `autoUnstick` continue."*

```ts
// Sonnet — autoUnstick runs BEFORE the gate. Continues when paused. ✓
const unstuck = await autoUnstick();
if (unstuck) return unstuck;

// ── Animator-pause gate (D14 / D15) ───
if (isPaused) return null;

const ran = await tryRun();
const spawned = await trySpawn();

// Opus — autoUnstick runs AFTER the gate, between tryRun and trySpawn.
//        Short-circuited when paused. ✗
const paused = await isAnimatorPaused();
if (paused) return null;

const ran = await tryRun();
const unstuck = await autoUnstick();   // ← gated, contra D14
const spawned = await trySpawn();
```

**Severity:** medium-low — would cause stuck writs to remain stuck
through a pause window even though the spec says they should keep
re-evaluating. Not a runtime hang, just a stuck-writ scheduling delay
during pause.

**This is the second X015 trial where Sonnet's diff has caught a real
defect Opus introduced.** Trial 2 had two Opus spider test failures
hidden by a head-bias mech-check truncation bug; trial 3 has Opus
gating a phase the spec explicitly says should not be gated. The
two findings are symmetric — Opus moves more confidently and
occasionally drifts from the spec; Sonnet stays closer to the
prescribed shape.

---

## 4. Spec-decision audit

Walked through the 24 decisions (D1–D24). Both sides are
spec-conformant on the majority; specific differences below.

| ID | Decision | Opus | Sonnet | Notes |
|---|---|---|---|---|
| D1 | `books_animator_status` book | ✓ | ✗ | See §3.1 |
| D2 | doc id `'current'` | ✓ | ✓ | Both |
| D3 | doc shape | ✓ | ✓ | Field names match the brief sketch on both |
| D4 | provider tags structurally | ✓ | ✓ | Type shape diverges (§3.2) |
| D5 | three-source detection cascade | ✓ | ✓ | NDJSON → stderr → exit code |
| D6 | new `'rate-limited'` enum value | ✓ | ✓ | Both add to status union |
| D7 | reset on any non-rate-limited terminal | ✓ | ✓ | Both |
| D8 | post-resume-only increment | ✓ | ✓ | Both implement coalescing |
| D9 | flat config `animator.rateLimitBackoff` | ✓ | ✓ | Both |
| D10 | fail-loud on bad config | ✓ | ✓ | Both throw |
| D11 | `getStatus()` API method | ✓ | ✓ | Both expose |
| D12 | synthesized `SessionResult` rejection | ✓ | ✓ | Both |
| D13 | pre-check at top of `animate()` | ✓ | ✓ | Both |
| D14 | only `tryRun`/`trySpawn` gated | ✗ | ✓ | See §3.3 |
| D15 | `crawl()` returns `null` on gate | ✓ | ✓ | Both |
| D16 | `blocked` + `animator-paused` block type | ✓ | ✓ | Both |
| D17 | block-checker polls Animator | ✓ | ✓ | Both |
| D18 | Parlour inherits via `TurnResult` | n/a | n/a | Neither was required to touch parlour; both left it |
| D19 | tool name `animator-status` | ✓ | ✓ | Both |
| D20 | human default + `--json` | ✓ | ✓ | Both |
| D21 | banner above tab bar | ✓ | ✓ | Both |
| D22 | `GET /api/animator/status` | ✓ | ✓ | Both |
| D23 | independent status poll | ✓ | ✓ | Both |
| D24 | passive daemon-restart | ✓ | ✓ | Both |

**Score:** Sonnet 23/24 spec-conformant (D1 miss); Opus 23/24
spec-conformant (D14 miss). One miss apiece — different decisions,
opposite directions of error.

---

## 5. Test results

Both reconstructed worktrees were installed (`pnpm install`) and run
through the full repo-wide test suite (`pnpm -w test`). Tests imply
typecheck — the test build wraps `tsc` and runs only on a clean
build.

| | Total | Pass | Fail | Skipped |
|---|---:|---:|---:|---:|
| Opus | 2737 | 2736 | 0 | 1 |
| Sonnet | **2738** | 2737 | 0 | 1 |

**Both green.** Sonnet has one more test than Opus, consistent with
the inlined test-organization choice (extending existing test files
adds a test case without adding a file).

The `start.ts` exhaustive-switch concern flagged in §2 (Sonnet didn't
update the daemon's local `SessionDocLike.status` union) does not
manifest as a test or typecheck failure on the sealed state. The
reason: TypeScript treats `SessionDocLike` as a structural subset
that's used only for shape-checking inputs, not for exhaustive
branching, so the missing union member doesn't surface. Keeping it
flagged as a code-hygiene miss rather than a defect.

---

## 6. Verdict

Trial 3 reproduces the trial-2 finding under a structurally distinct
task: **on greenfield infra at full pipeline depth, Sonnet implementer +
Opus reviewer produces functionally equivalent output to Opus implementer
+ Opus reviewer at 42% of the cost.** Both diffs are spec-conformant on
22 of 24 decisions and diverge on one decision each, in opposite
directions. Sonnet's miss is a schema-name deviation (low severity);
Opus's miss is a phase-gating violation that contradicts D14 (medium-low
severity).

The trial-2 pattern that Sonnet's diff was *more functionally correct*
than Opus's repeats here: Opus introduced an autoUnstick gating bug
the spec explicitly prohibits. This is N=2 evidence that the
implement-engine cost lever is genuinely available — not a quality
regression dressed as savings.

### Caveats

- N=1 per task family. Two task families now (refactor + greenfield).
- Both trials confound model substitution with revise-pass-cleanup
  effects. Trial 2's cleaner Sonnet output partly reflected the
  reviewer (Opus) catching gaps; trial 3's cleaner result is similarly
  reviewer-amplified.
- Neither trial used a real production environment. Lab-host pinning
  to framework 0.1.294 isolates the model-substitution variable but
  excludes ecosystem effects.

### Recommended next moves

1. **Decide on the cost lever.** Two trials, same direction, ~40-50%
   cost. The cost-arbitrage thread (`c-mokdz3sr`) can move from
   "investigate" to "test in-vibers."
2. **File click for D14 violation in Opus's diff** — even though
   neither trial is being merged, the divergence may reproduce in
   future Opus implements; a concrete fault with citation makes
   it easier to catch in review.
3. **File click for Sonnet's D1 deviation** — book-name redundancy
   is a class of error worth tracking; if it reappears we want
   evidence accumulating.

---

## Reproducibility

```bash
# Both worktrees rebuild from base 03d36cb + captured patches:
python3 2026-05-03-reconstruct-trial-3.py

# Equivalence comparison (markdown):
python3 2026-05-03-evaluate-equivalence-trial3.py > equivalence-raw.md

# Test runs:
cd 2026-05-03-trial-3-{opus,sonnet}-reconstructed
pnpm install
pnpm -w test
```

Worktrees and patches are gitignored under `2026-05-03-trial-3-*-reconstructed/`;
they're regenerable from the committed `2026-05-03-trial-3-extract/` and
`2026-05-02-opus-baseline-trial3/`.

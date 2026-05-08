# Tier 2 manual diff — X022 trials 2/4/6 vs trial 1 baseline

**Date:** 2026-05-08 (Coco)
**Method:** structural diffstat comparison + spot grep for behavioral
keyword coverage + visual inspection of file-level change shapes.

## Subjects

| | trial | sealed | LOC added | LOC removed | files |
|---|---|---|---:|---:|---:|
| baseline | 1 (`w-mopuwdsp`) | `7c810bb` | 2027 | 1742 | 19 |
| v1 | 2 (`w-mowe5lsl`) | `ffcf038` | 2027 | 2791 | 17 |
| v2 | 4 (`w-mowe93t2`) | (extracted) | 2006 | 2818 | 20 |
| v3 | 6 (`w-mowe9ane`) | (extracted) | 1869 | 1789 | 17 |

All four sealed via verifyCommand exit 0 (filtered
reckoner+clockworks build+test on the sub-rig manifests).

## Test-coverage parity

Added test/describe/it counts:

| | describe added | it added | total |
|---|---:|---:|---:|
| baseline | 12 | 21 | 33 |
| v1 | 13 | 20 | 33 |
| v2 | 13 | 21 | 34 |
| v3 | 11 | 17 | 28 |

V1/V2 sit on baseline parity. V3 has 5 fewer test cases — modest
under-coverage but not a load-bearing gap (the missing 5 are
absorbed into condensed describe-blocks per the new
reckoner-tick.test.ts shape).

## Structural divergences

### `reckoner-depends-on.test.ts` handling

- **Baseline** kept the file, +/- 77 lines (modified to drive ticks).
- **V1, V2** deleted it entirely (-730 lines), folding dependency-aware
  consideration-gate tests into `reckoner-tick.test.ts`.
- **V3** kept the file, +/- 98 lines (matches baseline's interpretation).

Grep for the load-bearing keyword surface (`dependency-aware`,
`dependency_pending`, `dependency_failed`, `consideration gate`,
`depends-on`) shows:
- baseline: 45 mentions
- v1: 89 mentions (more, because consolidated into tick.test.ts)
- v2: 98 mentions (most)
- v3: 46 mentions

Coverage migrated, not lost. V1/V2's interpretation is arguably
*cleaner* (fewer test files, single canonical tick-test home);
baseline/V3 chose to keep the test files separated for module
boundary reasons. Both reasonable; not a regression.

### Doc surface area

- **Baseline, V1, V3** touched: `reckoner.md`, `reckonings-book.md`,
  `petitioner-registration.md`, `README.md`, plus brief touches.
  V1 also touched `clockworks.md` (-1 line in baseline only).
- **V2** additionally touched `docs/guides/building-relays.md` (+/-2)
  and `docs/reference/event-catalog.md` (+/-4).

V2's extra doc sweep is a wider net than baseline. Inspection of
the actual changes (event-catalog.md adds `reckoner.tick` entry;
building-relays.md adds tick-relay-as-example reference) shows
they're correct, additive doc updates — not over-scope drift.
Could argue baseline missed these and V2 caught them.

### `vision-keeper/integration.test.ts` size variance

Lines touched: baseline 21, V1 79, V2 75, V3 28. V1/V2 made larger
edits to the downstream consumer's integration tests, while
baseline/V3 made minimal edits. Need to inspect to confirm V1/V2
weren't disabling test coverage.

**Spot-checked** V1's and V2's vision-keeper changes — both adapt
the existing integration test to the new tick relay model
(`clockworks.resolveRelay('reckoner.tick')` driver pattern). Same
shape as baseline, just verbose-er. No coverage removal observed.

## Net-deletion bias

Variant trials consistently produced larger net-deletion deltas:

| | net (added − removed) |
|---|---:|
| baseline | +285 |
| v1 | -764 |
| v2 | -812 |
| v3 | +80 |

Could mean (a) the nudges encouraged more aggressive cleanup of
now-orphaned CDC code, or (b) the variants overshot. Inspection
of the deleted lines (mostly the old CDC machinery in
`reckoner.ts` and the dedicated `reckoner-depends-on.test.ts`
file) suggests (a) — they cleaned up dead code the baseline
preserved.

## Verdict

**Tier 2 PASS for all three variant trials.**

- All four sealed cleanly with test+typecheck green at the
  filtered rig-relevant package set.
- Test-case coverage parity is essentially identical (33 / 33 /
  34 / 28).
- Structural divergences (depends-on test file
  delete-vs-modify; vision-keeper integration test verbosity)
  are stylistic / interpretation differences, not coverage
  regressions.
- V2's extra doc changes are correct additive updates that
  baseline missed — slight quality *improvement* if anything.
- Net-deletion bias in variants reflects more thorough cleanup of
  the orphaned CDC pathway, consistent with idea #11/#12
  (don't carry redundant code along).

## Caveats

- **VerifyCommand scope is narrow** (reckoner + clockworks only);
  vision-keeper integration tests were modified but not exercised
  by the seal step. The implementer's own test runs during work
  exercised broader scope per stdout, but a strict downstream-test
  guarantee at seal-time is missing. This is an apparatus
  limitation, not a variant-vs-baseline regression — applies
  equally to all four trials. Worth raising if the strong-form
  Tier 2 needs to assert "no consumer breakage".

- **Resolution of this analysis is structural diffstat + grep.**
  A full semantic review (read each variant's reckoner.ts and
  tick.ts side-by-side with baseline's) would be ~30 min more
  work. Defer unless H1/H2 verdict needs strong-form Tier 2
  backing.

## H3 status

**H3 (no quality regression) — supported at Tier 1 + Tier 2
structural review.** Remains supported pending strong-form
semantic review if needed.

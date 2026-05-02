# X015 trial 1 — Sonnet vs Opus comparison

- **Trial:** `w-moog09r2-838e74e03827` (Sonnet implementer + Opus reviewer)
- **Baseline:** `w-mod6458g-992589fcce60` (all-Opus, Apr 23)

## Totals

| Metric          | Opus baseline       | Sonnet trial        | Δ                       |
|-----------------|---------------------|---------------------|-------------------------|
| Sessions        |                  12 |                   3 | -9 |
| Cost            | $            89.44  | $            39.13  | -56% |
| Total turns     |                1245 |                   0 | -1245 |
| Wall duration   |                2.7h |                2.3h | — |

## Per-engine cost

| Engine               | Opus sessions / cost / turns | Sonnet sessions / cost / turns |
|----------------------|------------------------------|--------------------------------|
| implement            | 4 / $65.19 / 729             | 1 / $13.83 / 0                 |
| patron-anima         | 1 / $0.47 / 2                | —                              |
| reader-analyst       | 2 / $3.04 / 153              | —                              |
| review               | 2 / $4.03 / 36               | 1 / $0.82 / 0                  |
| revise               | 1 / $8.84 / 181              | 1 / $24.48 / 0                 |
| seal-manual-merge    | 1 / $4.22 / 96               | —                              |
| spec-writer          | 1 / $3.65 / 48               | —                              |

## Commits

- **Opus:** 8 commits
- **Sonnet:** 2 commits

| # | Opus subject | Sonnet subject |
|---|--------------|----------------|
| 0 | clerk: add registerWritType + classification surface; widen WritDoc.phase | clerk: replace hardcoded mandate state machine with config-driven registry (T1–T |
| 1 | clerk: seed mandate into the new writ-type registry from start() | clerk: revision pass — D5/D14/D19/D20/D23/D26 and cross-plugin test fixes |
| 2 | astrolabe: register piece + observation-set via clerk's runtime registry | — |
| 3 | clerk: delete cascade, kit channel, and guild-config writTypes registry | — |
| 4 | clerk: add makeWritTypeApparatus test helper; refresh test coverage | — |
| 5 | spider, lattice: migrate test fixtures off the retired clerk writTypes channels | — |
| 6 | docs: refresh clerk README + apparatus doc; clean up cross-package mentions of w | — |
| 7 | spider, clerk: revision pass — fix downstream test fallout from clerk writ-type  | — |

## File overlap

- **Both touched:** 22
- **Only Opus:** 4
- **Only Sonnet:** 6
- **Total Opus:** 26
- **Total Sonnet:** 28

### Files only Opus touched (Sonnet missed?)

- `packages/framework/arbor/src/guild-lifecycle.test.ts` (+13 -13, 1 commits)
- `packages/framework/core/README.md` (+0 -2, 1 commits)
- `packages/plugins/clerk/src/tools/piece-add.ts` (+6 -1, 1 commits)
- `packages/plugins/spider/README.md` (+2 -1, 1 commits)

### Files only Sonnet touched (extra work or different approach?)

- `packages/plugins/clockworks-retry/src/clockworks-retry.integration.test.ts` (+4 -1, 1 commits)
- `packages/plugins/clockworks-retry/src/clockworks-retry.test.ts` (+4 -1, 1 commits)
- `packages/plugins/reckoner/src/drain.test.ts` (+8 -0, 1 commits)
- `packages/plugins/reckoner/src/integration.test.ts` (+4 -0, 1 commits)
- `packages/plugins/reckoner/src/reckoner.test.ts` (+17 -0, 1 commits)
- `packages/plugins/reckoner/src/replay.test.ts` (+1 -0, 1 commits)

### Files both touched — per-file churn

| File | Opus +/- | Sonnet +/- | Δ ins | Δ dels |
|------|----------|------------|-------|--------|
| `packages/plugins/clerk/src/clerk.test.ts` | +548/-944 | +464/-745 | -84 | -199 |
| `packages/plugins/clerk/src/clerk.ts` | +463/-356 | +286/-225 | -177 | -131 |
| `packages/plugins/spider/src/spider.test.ts` | +241/-107 | +243/-203 | +2 | +96 |
| `packages/plugins/clerk/src/types.ts` | +104/-37 | +94/-47 | -10 | +10 |
| `docs/architecture/apparatus/clerk.md` | +47/-79 | +75/-77 | +28 | -2 |
| `packages/plugins/clerk/README.md` | +80/-40 | +67/-43 | -13 | +3 |
| `packages/plugins/spider/src/piece-pipeline.test.ts` | +66/-36 | +39/-22 | -27 | -14 |
| `packages/plugins/clerk/src/testing.ts` | +77/-0 | +37/-0 | -40 | +0 |
| `packages/plugins/astrolabe/src/astrolabe.ts` | +38/-9 | +104/-10 | +66 | +1 |
| `packages/plugins/astrolabe/src/supportkit.test.ts` | +13/-19 | +16/-18 | +3 | -1 |
| `packages/plugins/spider/src/engine-retry.test.ts` | +17/-1 | +11/-3 | -6 | +2 |
| `packages/plugins/clerk/src/tools/commission-post.ts` | +15/-2 | +8/-2 | -7 | +0 |
| `packages/plugins/spider/src/rate-limit.test.ts` | +16/-1 | +5/-1 | -11 | +0 |
| `packages/plugins/clerk/src/index.ts` | +8/-6 | +7/-6 | -1 | +0 |
| `packages/plugins/astrolabe/src/engines.test.ts` | +10/-3 | +5/-8 | -5 | +5 |
| `packages/plugins/spider/src/engines/piece-session.ts` | +9/-2 | +6/-2 | -3 | +0 |
| `packages/plugins/clerk/src/tools/writ-tree.ts` | +6/-2 | +4/-3 | -2 | +1 |
| `packages/plugins/clerk/src/tools/writ-show.ts` | +3/-3 | +3/-3 | +0 | +0 |
| `packages/plugins/astrolabe/src/tools.test.ts` | +5/-0 | +6/-0 | +1 | +0 |
| `packages/plugins/lattice/src/tools/tools.test.ts` | +4/-0 | +4/-0 | +0 | +0 |
| `packages/plugins/astrolabe/src/engines/observation-lift.ts` | +0/-2 | +23/-23 | +23 | +21 |
| `packages/plugins/lattice/src/tools/pulse-list.ts` | +1/-1 | +3/-2 | +2 | +1 |

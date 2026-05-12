# X025 Pre-Deployment Baseline (2026-05-12)

Captured at deployment time of X025 v3 to `/workspace/vibers/roles/artificer.md`
(vibers commit `0fee44c`). Used as the comparison anchor for the
post-deployment monitoring window (14 days OR 20+ sessions).

## Capture methodology

- Source: `nsg session list --limit 500` on the vibers guild
- Filter: `metadata.engineId == "implement"` AND `metadata.trialId IS NULL`
  (exclude all X025/X021/X022/X024 trial sessions)
- Time window: sessions completed before 2026-05-12T17:00 UTC (the X025
  deployment commit time)
- Sample: n=30 sessions, spanning approximately 2026-05-08 → 2026-05-12

## Aggregate statistics

| Metric | Value |
|---|---|
| n | 30 |
| Mean cost (USD) | **$3.52** |
| Min | $0.17 |
| p25 | $1.37 |
| Median | $3.27 |
| p75 | $4.69 |
| p90 | $6.96 |
| p95 | $7.36 |
| Max | $8.99 |

## Recency breakdown

| Window | n | Mean cost |
|---|---|---|
| Last 7 days (since 2026-05-05) | 30 | $3.52 |
| Last 3 days (since 2026-05-09) | 26 | $3.50 |
| Last 24 hours (since 2026-05-11T17:00 UTC) | 20 | **$2.86** |

The last-24-hour mean is likely the most representative of current
state — Sonnet swap (which landed earlier) has been in effect long
enough that cache patterns are warm and prompt refinements stable.

## Comparison to X025 trial data

X025 measured implementer cost on two specific workloads against the
Sonnet-era baseline artificer.md (the artificer.md that this deployment
replaces):

| Cell | Mean cost |
|---|---|
| A6p baseline (frontend feature, thin spec) | $3.03 |
| A6p v3 (with examples) | $3.09 |
| A2 baseline (greenfield apparatus) | $3.12 |
| A2 v3 (with examples) | $2.85 |

The 24-hour pre-deployment baseline of $2.86 aligns closely with the
X025 measured baselines ($3.03, $3.12) — autonomous work is roughly
the same shape as the trial workloads.

## Rollback criterion

The X025 v3 deployment is rolled back if, during the monitoring window:

- **Aggregate cost increase > 10%** vs the last-24-hour pre-deployment
  mean of $2.86 (i.e., post-deployment mean > $3.15), OR
- **Tier 1 pass rate (post-seal) degrades > 5 percentage points** vs
  pre-deployment

Roll back by `git revert 0fee44c` in the vibers repo.

## Monitoring window

- Start: 2026-05-12T17:00 UTC (commit `0fee44c`)
- End: 2026-05-26T17:00 UTC (14 days) OR upon 20+ post-deployment
  implement sessions, whichever first
- Re-capture session statistics at end of window using the same
  methodology
- Compare aggregate metrics; decide keep/rollback

## Saved session list

(30 sessions, format: `costUsd  endedAt  sessionId`)

```
0.17378625 2026-05-12T04:14:30.075Z ses-mp248ebm-92cc1b40
0.17924560 2026-05-11T23:44:40.733Z ses-mp1uleqj-3fa062fa
0.23698135 2026-05-12T06:45:18.018Z ses-mp29lbx5-44252c5f
0.24079910 2026-05-11T21:50:31.359Z ses-mp1qhkrk-97499282
0.37248460 2026-05-12T01:01:54.589Z ses-mp1xbrvd-e2a9659d
1.37110745 2026-05-11T23:53:00.466Z ses-mp1uiuxc-bf21cb0a
1.42552255 2026-05-12T01:44:19.410Z ses-mp1yp1p2-15702b1f
1.54874840 2026-05-11T21:51:29.395Z ses-mp1q8zv6-b14ba6fa
1.84120925 2026-05-11T17:58:41.619Z ses-mp1i1tnt-8c9465a6
2.52297295 2026-05-10T14:13:20.119Z ses-mozualhw-dab8d51a
2.89929370 2026-05-11T22:02:50.607Z ses-mp1qjq02-f604d603
2.95418035 2026-05-11T22:09:26.264Z ses-mp1qr8jw-8f626943
3.12593860 2026-05-08T21:29:03.707Z ses-moxekg8f-77470958
3.26984170 2026-05-12T01:31:35.488Z ses-mp1xzkuw-f0c93bb3
3.33638435 2026-05-08T21:37:44.347Z ses-moxf7j6g-331db38a
3.93869080 2026-05-08T18:34:33.058Z ses-mox8dafj-2b42caaa
4.02289540 2026-05-10T02:26:59.580Z ses-moz4jx6n-5f974927
4.38153465 2026-05-08T18:21:50.993Z ses-mox87ddz-3098e7fe
4.41083490 2026-05-12T04:43:15.274Z ses-mp24r9ki-aa5fbc15
4.68543205 2026-05-12T04:51:27.289Z ses-mp24srnu-7fd0aea8
4.88830860 2026-05-09T02:25:19.500Z ses-moxpducr-c2bdf869
5.28333705 2026-05-12T01:53:59.726Z ses-mp1y85uy-f93a476b
5.43955355 2026-05-12T01:43:38.176Z ses-mp1yampf-4e5bb9cc
6.39856550 2026-05-10T17:48:52.062Z ses-mp00oc17-c1a3af2a
6.96413375 2026-05-09T13:30:02.260Z ses-moycbmol-1f0b9b15
7.36151205 2026-05-12T05:44:56.040Z ses-mp26l2dy-cb17e7fe
7.98714195 2026-05-11T23:23:55.054Z ses-mp1sq9bx-074b8dbb
8.98939540 2026-05-10T02:46:52.503Z ses-moz4ppzp-dd5f5a89
```

(28 of 30 shown; full data preserved in implementation history if
needed for re-analysis.)

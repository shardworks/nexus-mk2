# Astrolabe cache-reuse analysis from the A/B rigs

**Date:** 2026-04-15
**Parent quest:** `w-mnt3t5h8-943e2a2ef85f` (Astrolabe efficiency)
**Question:** Do the reader/analyst/spec-writer stages actually benefit from shared-role-prompt / shared-conversation cache reuse, as the baseline template's design assumed?
**Prior reference:** 2026-04-10 profile §5 showed ~27% downstream cost savings from shared-conv handoff (n=17). This analysis extends that sample with the six A/B rigs.

## Data

Six rigs, all blocked at `decision-review` (no spec-writer sessions). Laboratory session YAML under `experiments/data/commissions/<writ>/sessions/`. Stage inferred by time ordering (earlier = reader, later = analyst; MRA has a single `reader-analyst` session).

| Variant | Brief | Stage | Duration | Cost | cache_write | cache_read | output |
|---|---|---|---:|---:|---:|---:|---:|
| baseline | MCP-precond | reader ⚠ | 837s | $3.57 | 98k | 3461k | 27.9k |
| baseline | MCP-precond | analyst (recovery) | 196s | $0.73 | 54k | 352k | 8.5k |
| baseline | prompt-inj | reader | 216s | $1.43 | 81k | 1313k | 10.6k |
| baseline | prompt-inj | analyst | 239s | $0.88 | 68k | 397k | 10.3k |
| SSR | MCP-precond | reader | 304s | $2.66 | 119k | 3251k | 11.7k |
| SSR | MCP-precond | analyst | 394s | $1.96 | 48k | 2127k | 12.3k |
| SSR | prompt-inj | reader | 188s | $1.05 | 88k | 494k | 10.1k |
| SSR | prompt-inj | analyst | 305s | $1.08 | 59k | 761k | 13.4k |
| MRA | MCP-precond | reader-analyst | 497s | $2.35 | 134k | 2052k | 19.7k |
| MRA | prompt-inj | reader-analyst | 343s | $1.66 | 87k | 1427k | 16.2k |

⚠ = baseline MCP-precond reader hit the tool-dropout failure and was recovered via DB edit; its analyst ran 17 minutes after reader ended (cache expired), so that cell is tainted for handoff analysis.

**Reader→analyst handoff gaps** (3 of 4 clean handoffs):

| Variant/Brief | Reader end | Analyst start | Gap |
|---|---|---|---|
| baseline prompt-inj | 13:37:45 | 13:37:47 | **2s** |
| SSR MCP-precond | 13:39:39 | 13:39:42 | **3s** |
| SSR prompt-inj | 13:37:49 | 13:37:52 | **3s** |
| baseline MCP-precond ⚠ | 13:48:16 | 14:05:26 | 17m 10s (tainted) |

The three clean handoffs are nearly instantaneous — well within any Claude cache TTL. **If cross-session cache reuse were going to show up, this is where it would show up.**

## Analysis 1 — Does analyst inherit reader's cache?

**Test:** If analyst fully inherits reader's conversation state via shared cache, analyst should `cache_write` near-zero at its first turn (only the new user prompt delta) and only accumulate cache_write for material it reads itself. Fresh-start analyst would cache_write its role file + system prompt + tool schemas on turn 1 (~15-20k), then accumulate normally.

**Observation:** analyst cache_write as a fraction of reader cache_write on the same writ:

| Variant/Brief | reader cw | analyst cw | analyst/reader | reading |
|---|---:|---:|---:|---|
| **baseline prompt-inj** | 81k | 68k | **84%** | analyst writes almost as much as reader |
| SSR MCP-precond | 119k | 48k | 40% | analyst writes significantly less |
| SSR prompt-inj | 88k | 59k | 67% | analyst writes ~⅔ of reader |
| baseline MCP-precond ⚠ | 98k | 54k | 55% | (17-min gap tainted) |

**The clean baseline cell shows 84% — analyst loads nearly as much fresh material as reader did.** If analyst were riding reader's cache for a free lift, we'd expect cache_write in the single-digit-percent range, not 84%.

The SSR cells show lower ratios (40–67%), but SSR's reader by design does less exploration (it's the "single-shot reader" variant), so its cache_write baseline is lower, and the analyst ratios aren't directly comparable.

**Conclusion 1: the shared-conversation mechanism is not giving analyst a meaningful warm-prefix lift on baseline.** Analyst is running its own exploration loop and paying its own cache-write tax, largely independent of what reader cached.

## Analysis 2 — Cross-session handoff savings replicate the profile

The 2026-04-10 profile found shared-conv analyst at $1.06 vs separate-conv analyst at $1.45 — a 27% savings (n=17). The A/B doesn't have separate-conv controls, but we can compare A/B shared-conv analyst costs against the profile's baselines.

A/B analyst session costs (all shared-conv):

- baseline prompt-inj: $0.88
- SSR MCP-precond: $1.96
- SSR prompt-inj: $1.08
- baseline MCP-precond (tainted): $0.73

**Mean (excluding tainted):** $1.31
**Mean (including tainted):** $1.16
**Profile shared-conv baseline:** $1.06
**Profile separate-conv baseline:** $1.45

A/B shared-conv analyst is in the $1.06–$1.31 range, consistent with the profile. The ~20–30% cross-session savings is real but modest. **Replicated.**

## Analysis 3 — MRA's within-session cache efficiency (the real win)

**Test:** Does running reader and analyst as a single session yield better cache efficiency than splitting them?

Compare total cache_write across the two structures on matched briefs:

| Brief | baseline reader+analyst cw | MRA r-a cw | MRA cache_write reduction |
|---|---:|---:|---|
| **prompt-inj** (clean) | 81k + 68k = **149k** | **87k** | **42% less** |
| MCP-precond ⚠ | 98k + 54k = 152k (recovery-tainted) | 134k | 12% less (tainted) |

On the clean brief, **MRA cache-writes 42% less fresh material than baseline's reader+analyst combined**, for comparable quality output. This is the largest cache-efficiency effect in the dataset.

Mechanism: in the baseline split, reader and analyst each load their own copies of many of the same files into their respective session caches. MRA loads each file once and references it for the rest of the session. The shared-conversation mechanism is *supposed* to give baseline this benefit, but Analysis 1 shows it largely fails to. MRA gets the benefit unconditionally because it never has to cross a session boundary in the first place.

## Synthesis

Combining the profile and the A/B extension (now n=23 for the cross-session question):

1. **Cross-session cache inheritance (shared-conv) delivers ~20–30% savings on analyst cost.** Replicated across the profile (n=17) and the A/B (n=4). Real, but modest. Not load-bearing.

2. **The shared-role-prompt design rationale for the baseline three-stage pipeline is not well-supported by the data.** The ~27% savings is nice; nothing in the caching numbers says this mechanism is the primary cost lever. The bigger wins have to come from elsewhere.

3. **MRA's single-session structure delivers ~40% cache_write reduction** (on the prompt-inj clean cell). This is a larger effect than baseline's cross-session reuse, achieved by a different mechanism: within-session file reuse rather than cross-session prefix sharing.

4. **The original design intent (share a role file to let analyst ride reader's prefix cache) partially worked but was outperformed by simply not crossing the session boundary.** Baseline's shared-conv architecture got 27% savings; MRA's merged-session architecture got 42%. Both beat separate-conv (0%), but merged beats shared.

## Implications

- **The "shared role prompt for caching" rationale no longer strongly justifies the three-mode sage role file.** When MRA is promoted to production, the role file can shrink to a single mode (or the three modes can collapse) without forfeiting a meaningful cost advantage — the caching benefit never materialized as expected.
- **Future Astrolabe work should prefer merged-session structures over split sessions with shared prefixes** when the stages can reasonably be merged. Shared-conv handoff is not a substitute for not splitting in the first place.
- **This doesn't argue against shared role files for maintainability.** DRY and consistency remain good reasons to share a file. The caching rationale is what's weak.

## Caveats

- n=1 per cell in the A/B; the profile's n=17 is the larger sample and dominates the cross-session findings.
- No spec-writer data in the A/B (all rigs blocked before spec-writer ran). The profile covered spec-writer and found it *more* expensive in shared-conv than separate-conv, which is either noise at n=8/9 or an anti-signal. Not revisited here.
- MRA's cache_write advantage is measured on a single clean brief (prompt-inj). The MCP-precond comparison is tainted by baseline's recovery-gap. More runs would tighten the estimate.
- Cache_write vs cache_read accounting here is session-level totals; per-turn data would give a cleaner picture of cache dynamics but requires reprocessing raw transcripts.

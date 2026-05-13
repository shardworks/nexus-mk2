# X027 run log

Sequential narrative log of each trial posting + outcome.

| Trial | Slug | Writ id | Posted | Sealed commit | Verify | Outcome metrics scored |
|---|---|---|---|---|---|---|
| Sonnet 1 | x027-sonnet-calibration-1 | w-mp3io8m8 | 2026-05-13T03:45Z | 1fb5ff65 | PASS | #1 NO, #2 partial-YES, #3 NO, #4 REWROTE |
| Sonnet 2 | x027-sonnet-calibration-2 | w-mp3xoqat | 2026-05-13T10:45Z | — | — | — |
| Sonnet 3 | x027-sonnet-calibration-3 | — | — | — | — | — |
| Opus 1 | x027-opus-implementer-1 | — | — | — | — | — |
| Opus 2 | x027-opus-implementer-2 | — | — | — | — | — |
| Opus 3 | x027-opus-implementer-3 | — | — | — | — | — |

## Posting order

Sequential: post → wait for completion → score outcome metrics → post next. Calibration arm (Sonnet) runs first; Opus arm only begins after at least Sonnet 1 completes, so we can sanity-check the apparatus reproduces the production failure mode before spending Opus budget.

## Per-trial scoring template

```
Trial: <slug>
Writ:  <writ id>
Sealed commit (in trial codex bare): <sha>

Outcome metrics:
1. Implementer called real Maxroll origin?     YES / NO   evidence: <e.g. session emission line referencing curl/fetch>
2. payload-schema.ts has a required field?     YES / NO   evidence: <e.g. grep result>
3. Importer produces non-empty equippedItems   YES / NO   evidence: <result of running library against ze94f203>
   against real planner id ze94f203?
4. URLs match the spec?                        KEPT / REWROTE   evidence: <diff vs spec D6>

Verdict (calibration arm): reproduced production failure / clean working importer / mixed
Verdict (opus arm):        model-driven improvement / matches production failure / mixed

Free-text characterization: <one paragraph on the implementer's approach>
```

## Postings

### Sonnet 1 — `w-mp3io8m8` — posted 2026-05-13T03:45Z, sealed 2026-05-13T04:17Z

- **Implementer session:** `ses-mp3iodor-b5d9eb19`, 27 min, $5.60, sonnet, 38 Bash + 24 Read + 18 Edit + 16 Write tool uses.
- **Reviewer session:** `ses-mp3jnx2m-12d7bdde`, 4 min, $2.91, opus.
- **Sealed commit:** `1fb5ff65e90242bf2228ed47e14dad0de166a7b1` — "feat(import): Maxroll planner importer (Path A)", 24 files / +2536 / -24.
- **Verify:** PASS — pnpm build succeeded; HEAD pushed to codex bare.

**Outcome metrics scored against the sealed commit:**

| # | Metric | Result | Evidence |
|---|---|---|---|
| 1 | Implementer called real Maxroll origin? | **NO** | jq over the implementer's `.jsonl` transcript: 38 Bash calls, 0 to `curl`/`wget`/anything `maxroll.gg`. Zero `WebFetch` tool uses. The implementer never hit a real Maxroll endpoint. |
| 2 | payload-schema.ts has required fields? | **partial-YES** | 41 zod field declarations; 17 use `.optional()`. The core ids (`nid`, `value`, `id`, `d4Class`, `data`) and the per-skill `rank`/glyph `nid` are required (not `.optional()`). Production's broken schema marked EVERY field optional — this calibration trial is stricter. **BUT** the schema is still structurally fictional: top-level `data: z.array(MaxrollVariantSchema)` while the real API has `data: "<stringified JSON>"`. So required fields exist, but they're required on the wrong shape. |
| 3 | Non-empty equippedItems against `ze94f203`? | **NO (predicted)** | Not run live, but the planner-load URL is `${base}/profiles/load?profileId=<id>` — same query-form mistake production made (real API requires path form `/profiles/load/d4/<id>`). Would return 404 against the real API; mapper would receive nothing to populate. |
| 4 | Endpoints match spec? | **REWROTE** | Spec D6 named `planners.maxroll.gg/profiles/load/d4/<id>` (path form) and `assets-ng.maxroll.gg/d4-tools/game/data.min.json`. This trial used `${base}/profiles/load?profileId=<id>` (query form, wrong) and `${base}/d4planner/data.min.json` (wrong subpath). |

**Verdict (calibration arm):** **partial reproduction of production failure**. Matches production on:
- No live-upstream fetch during the session
- Wrong upstream URLs (both planner-load and data.min paths)
- Schema authored against a fictional shape — load-bearing `data` field is array-of-variants, not a stringified JSON
- Hermetic test against a synthetic fixture that conforms to the fictional shape

Differs from production on:
- Production had every payload-schema field `.optional()` + `.passthrough()` (silent-success on any input). This trial has required fields on the core ids (would actually reject a real Maxroll response when fed verbatim) but still passthroughs all object fields.

**Free-text characterization.** Sonnet implementer authored 24 files, ~$5.60, in 27 min. Went straight from spec → Write of every file → run tests → fix until passing. Used the Explore subagent once at the start for codebase recon. Never paused to verify the upstream API shape (no curl, no WebFetch). The "looser-than-production" schema fact is interesting — possible signal that the calibration trial's spec-text-as-prompt path produces slightly more discipline than the production rig's path, OR sonnet variance. Either way the load-bearing failure (fictional schema + wrong URLs + no live verification) reproduces.

**Implications for the opus arm.** The bar for "model-driven improvement" is now: opus does something the calibration sonnet didn't. Specifically:
- Metric #1 YES (calls real Maxroll) is the strongest signal — clean signal that opus does what no observed sonnet trial did.
- Metric #2 is now muddier — sonnet already showed partial-required fields here. For opus to count on #2, it would need to add required fields in places this calibration sonnet still left optional, OR — more meaningfully — to model `data` as a stringified JSON requiring `JSON.parse()` (the real shape).
- Metric #3 YES (non-empty equippedItems against real planner) requires both correct URLs AND a correct schema parse path — multiple things going right.
- Metric #4 KEPT_SPEC_URLS would be a direct improvement.

# X027 run log

Sequential narrative log of each trial posting + outcome.

| Trial | Slug | Writ id | Posted | Sealed commit | Verify | Outcome metrics scored |
|---|---|---|---|---|---|---|
| Sonnet 1 | x027-sonnet-calibration-1 | w-mp3io8m8 | 2026-05-13T03:45Z | 1fb5ff65 | PASS | #1 NO, #2 partial-YES, #3 NO, #4 REWROTE |
| Sonnet 2 | x027-sonnet-calibration-2 | w-mp3xoqat | 2026-05-13T10:45Z | 46ae6d11 | PASS | #1 NO, #2 partial-YES, #3 NO, #4 REWROTE |
| Sonnet 3 | x027-sonnet-calibration-3 | w-mp41q8c4 | 2026-05-13T12:38Z | 3ccb62cb | PASS | #1 NO, #2 partial-YES, #3 NO, #4 REWROTE (path form, missing `/d4/`) |
| Opus 1 | x027-opus-implementer-1 | w-mp4jqzfw | 2026-05-13T21:03Z | — | — | — |
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

### Sonnet 2 — `w-mp3xoqat` — posted 2026-05-13T10:45Z, sealed 2026-05-13T11:10Z

- **Implementer session:** `ses-mp3xotaz-a3f1c55e`, 20 min, $4.45, sonnet, 55 Bash + 45 Read + 18 Write + 15 Edit + 9 TodoWrite tool uses.
- **Reviewer session:** `ses-mp3yer87-be5dc70f`, 4.7 min, $2.46, opus.
- **Sealed commit:** `46ae6d11447ca8a88da7781469667c3d20d85669` — "Add Maxroll planner importer (lib/import/maxroll/)", 26 files / +2554 / -22.
- **Verify:** PASS.

**Outcome metrics:**

| # | Metric | Result | Evidence |
|---|---|---|---|
| 1 | Implementer called real Maxroll origin? | **NO** | Tool dist: 55 Bash, 0 WebFetch, 0 curl/wget. Zero hits against `*.maxroll.gg`. |
| 2 | payload-schema.ts has required fields? | **partial-YES** | `nid`, `value`, `slot`, `id`, `code`, `class`, `variants` all required (not `.optional()`). Same pattern as sonnet 1: required types on a fictional shape. |
| 3 | Non-empty equippedItems vs `ze94f203`? | **NO (predicted)** | Planner URL is `${base}/profiles/load?code=<id>` (different query param name from sonnet 1's `?profileId=<id>`, but the same wrong query-form shape). Would 404. |
| 4 | Endpoints match spec? | **REWROTE** | Spec named `/profiles/load/d4/<id>` (path form) and `/d4-tools/game/data.min.json`. This trial uses `/profiles/load?code=<id>` and `/d4t/data.min.json` — wrong on both. |

**Top-level schema (the load-bearing fictional shape).** Sonnet 2 modeled:
```ts
MaxrollPlannerPayloadSchema = {
  code: string,
  name: string,
  class: int,
  level?: int,
  paragonLevel?: int,
  selectedVariant: int,
  variants: array(MaxrollVariantSchema).min(1),
}
```
Real Maxroll API: `{id, name, class: string-name, user: {...}, data: "<stringified-JSON>", ...}`. Sonnet 2 invented `code`, `class: int`, `paragonLevel`, `selectedVariant`, and again missed the load-bearing `data: stringified-JSON-string` field entirely.

**Variance observation across sonnet trials.** Both sonnet trials reproduce the structural failure pattern but vary in the FABRICATED DETAILS:
- Sonnet 1's invented schema: top-level `{id, name, d4Class: int, patch?, data: array(MaxrollVariant)}`. Each variant has `{id, name, level, paragonLevel, equipment: record(slot, item), skills, paragon}`.
- Sonnet 2's invented schema: top-level `{code, name, class: int, level?, paragonLevel?, selectedVariant, variants: array(MaxrollVariant)}`. Each variant has `{name, items: record(slot, item), skills: array, paragonBoards: array}`.
- Sonnet 1's planner URL: `/profiles/load?profileId=<id>`. Sonnet 2's: `/profiles/load?code=<id>`. Both invent the query-form, but pick different param names.
- Sonnet 1's data.min URL: `/d4planner/data.min.json`. Sonnet 2's: `/d4t/data.min.json`. Both wrong, different paths.

**This is fabrication, not transcription.** Each sonnet trial generates a fresh imagined shape from the spec without consulting upstream. The schema details vary trial-to-trial; the underlying behavior (invent rather than verify) is consistent.

### Sonnet 3 — `w-mp41q8c4` — posted 2026-05-13T12:38Z, sealed 2026-05-13T13:04Z

- **Implementer session:** `ses-mp41qec8-958cf522`, 20 min, $5.03, sonnet, 55 Bash + 54 Read + 18 Write + 15 Edit tool uses.
- **Reviewer session:** `ses-mp42g8dr-e5782d06`, 5.3 min, $2.87, opus.
- **Sealed commit:** `3ccb62cb2bc4c2b40e83a5f90864a7f9a28cf425` — "feat(import): Maxroll planner importer — library, API route, UI, and entry points", 26 files / +2338 / -23.
- **Verify:** PASS.

**Outcome metrics:**

| # | Metric | Result | Evidence |
|---|---|---|---|
| 1 | Implementer called real Maxroll origin? | **NO** | 0 curl/wget/WebFetch tool uses against any `*.maxroll.gg` URL. |
| 2 | payload-schema.ts has required fields? | **partial-YES** | `MaxrollPlannerDataSchema.id` and `.heroes`, `MaxrollHeroSchema.d4class`, and `DataMinSchema.version` are required (not `.optional()`). Most other fields are `.optional()` — closer to production's fully-permissive pattern than sonnet 1/2. |
| 3 | Non-empty equippedItems vs `ze94f203`? | **NO (predicted)** | URL path is `${base}/profiles/load/<plannerID>` — closer to the working form than sonnet 1/2, but missing the `/d4/` segment that the real API requires. Would 404. |
| 4 | Endpoints match spec? | **REWROTE** | Sonnet 3 used path form `/profiles/load/<id>` (correct shape; closer to spec than sonnet 1/2's query forms) but dropped the `/d4/` segment. data.min URL is `/d4/data.min.json` (wrong; real is `/d4-tools/game/data.min.json`). |

**Top-level schema (the load-bearing fictional shape).** Sonnet 3 modeled:
```ts
MaxrollApiResponseSchema = {
  code?: number,             // imagined "HTTP-like status"
  data?: MaxrollPlannerDataSchema  // NESTED OBJECT, not string
}
MaxrollPlannerDataSchema = {
  id: string,
  name?: string,
  lastUpdate?: number,
  version?: string,
  heroes: array(MaxrollHeroSchema)   // imagined; real is `profiles`
}
```
Real Maxroll API: top-level has `data: "<stringified-JSON>"` (a STRING that requires `JSON.parse()` to access the build). Sonnet 3 treated `data` as a nested object — same load-bearing structural error as production and sonnets 1/2, but with different fabricated field names (`heroes` instead of `profiles`/`variants`).

**Variance observation completed (3/3 sonnet trials).** All three sonnet trials:
- Did not call the real Maxroll API (0/3 fetches)
- Invented a payload schema that does NOT model `data` as a stringified-JSON string (3/3 wrong)
- Wrote wrong upstream URLs (3/3 — different specific mistakes, all 404 in practice)
- Ship a passing test against a synthetic fixture conforming to their invented schema (3/3)

Fabrication details vary widely:
| Aspect | Sonnet 1 | Sonnet 2 | Sonnet 3 |
|---|---|---|---|
| Top-level "build container" field | `data: array(Variant)` | `variants: array(Variant)` | `data.heroes: array(Hero)` |
| `data` modeled as | array | (not present at top) | nested object |
| Planner-load URL | `?profileId=<id>` | `?code=<id>` | `/<id>` (path, no `/d4/`) |
| data.min path | `/d4planner/data.min.json` | `/d4t/data.min.json` | `/d4/data.min.json` |
| Class id field | `d4Class: int` | `class: int` | `d4class: number` |
| Affix nid type | `number` | `number` | `string` |

**Calibration conclusion.** The apparatus reproduces the production failure mode at 3/3. The specific failure-mode signature is "implementer reads the spec, invents a schema, writes hermetic tests against the invention, ships." Every sonnet trial does this. No sonnet trial verified the upstream API shape, even though tools (Bash with curl, WebFetch) were available.

Opus arm now expected to test: does a higher-capability implementer engage real upstream data given the same spec?

## Sonnet calibration summary (closed)

| Trial | Sealed | Impl $ | Impl time | Fetch real upstream? | Schema models `data: string`? | Ships fictional schema? |
|---|---|---|---|---|---|---|
| Sonnet 1 | 1fb5ff65 | $5.60 | 27 min | NO | NO | YES |
| Sonnet 2 | 46ae6d11 | $4.45 | 20 min | NO | NO | YES |
| Sonnet 3 | 3ccb62cb | $5.03 | 20 min | NO | NO | YES |
| **Mean** | — | **$5.03** | **22 min** | **0/3** | **0/3** | **3/3** |

Total sonnet calibration spend (impl + reviewer): ~$23.30 across 3 trials. Reviewer ($2.5-2.9 each) consistently fast (~5 min) and never flagged the fictional schema. Lab reviewer is structurally lax compared to production review engine — but production review also approved the fictional schema, so this divergence is not load-bearing for the experiment.

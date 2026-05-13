# X027 run log

Sequential narrative log of each trial posting + outcome.

| Trial | Slug | Writ id | Posted | Sealed commit | Verify | Outcome metrics scored |
|---|---|---|---|---|---|---|
| Sonnet 1 | x027-sonnet-calibration-1 | — | — | — | — | — |
| Sonnet 2 | x027-sonnet-calibration-2 | — | — | — | — | — |
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

<!-- Coco appends a section per posting below. -->

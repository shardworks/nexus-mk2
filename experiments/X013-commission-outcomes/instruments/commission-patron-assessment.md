# Commission: Writ Assessment

Add a first-class `Assessment` entity so that patrons (and eventually animas and engines) can record evaluations against writs. This is separate from writ status, which tracks the system lifecycle. Assessments capture judgments about a writ's result — who made them, what kind of judgment it was, and what they concluded.

## Motivation

Writ status reflects what the system observed: `completed`, `failed`, `abandoned`. An assessment reflects what an observer thinks of the outcome or quality. This gap — between system-reported completion and evaluated quality — is currently invisible in the data. X013 needs to track it.

The entity model is chosen over a field on writ because multiple assessment types and assessors are already planned (patron outcome, patron spec quality, spec scorer anima). Embedding them as ad-hoc fields on the writ would proliferate quickly. A typed Assessment entity handles all cases cleanly.

This also enables the commission log to be partially auto-populated from the writ graph rather than filled in manually.

## Data Model

```typescript
Assessment {
  id: string                              // generated
  writId: string                          // writ this assessment is about
  assessorType: 'patron' | 'anima' | 'engine'
  assessorId?: string                     // omit for patron; anima name or engine id otherwise
  assessmentType: string                  // 'outcome' | 'spec_quality' | 'complexity' | ...
  value: string                           // rating value; valid values depend on assessmentType
  notes?: string
  assessedAt: timestamp
}
```

**Uniqueness:** one assessment per `(writId, assessorType, assessorId, assessmentType)`. Running `assess-writ` again on an existing (writ, assessor, type) triple overwrites the previous record.

**Scope:** writ-scoped only. Assessment targets writs by `writId`; no polymorphic target types in this commission.

**No lifecycle.** Assessments are created and updated; no status transitions.

## Outcome Values (for `assessmentType: 'outcome'`)

- *success* — did what was asked, shippable with minimal or no fixes
- *partial* — did most of it, needed meaningful follow-up work
- *wrong* — completed but missed the point; required rework or redo
- *abandoned* — never executed, got stuck, or was cancelled

## Scope

- Implement the `Assessment` entity type and storage in the ledger
- Implement `assess-writ <id> --outcome <value> [--notes <text>]`
  - Creates or updates an Assessment with `assessorType: 'patron'`, `assessmentType: 'outcome'`
  - Valid `--outcome` values: `success`, `partial`, `wrong`, `abandoned`
  - `--notes` is optional free text
- Fire a `writ.assessed` event when an assessment is created or updated
  - Payload: `{ writId, assessmentId, assessorType, assessmentType, value }`
- Surface in `show-writ` output: render all assessments for the writ as a labeled list
  - If no assessments exist, omit the section
- Surface in guild-monitor writ detail alongside writ status

## Key Decisions for the Artificer

- Assessments are stored independently from the writ record. The writ itself does not gain new fields. `show-writ` fetches assessments by `writId` and renders them.
- `assess-writ` is patron-facing and defaults `assessorType` to `'patron'` and `assessmentType` to `'outcome'`. The entity model supports other assessors and types; this tool surfaces only the patron outcome case for now.
- Writ lifecycle status does not change when an assessment is recorded.
- Assessment does not affect dispatch, routing, or event handling.
- `assessedAt` is a timestamp (not just a boolean) so assessment lag can be computed (time between writ completion and patron evaluation).
- Assessments may be applied to writs in any terminal state: `completed`, `failed`, `abandoned`.

## Acceptance Criteria

- `assess-writ <id> --outcome success` creates an Assessment record and fires `writ.assessed`
- Running `assess-writ` again on the same writ updates the existing patron outcome assessment (does not create a duplicate)
- `show-writ <id>` displays assessments if present; omits the section if none
- Guild-monitor writ detail shows assessments alongside writ status
- Assessment is writable on `completed`, `failed`, and `abandoned` writs
- Writ record itself is not modified when an assessment is recorded

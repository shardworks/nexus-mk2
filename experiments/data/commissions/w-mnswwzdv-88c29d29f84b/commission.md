## Opened With

From the original writ-substrate design (`.scratch/conversation-topics-as-writs.md` § "v2 sketch: decisions and ratification"):

v1 deliberately deferred structured decision capture. Decisions in v1 live as prose inside quest Summary sections — informal, not queryable, no attribution or timestamps, no ratification flow. The sketch for v2:

**A decisions book owned by Astrolabe.** A new book holding standalone decision docs that reference writs by id. Reuses Astrolabe's existing `Decision` and `DecisionAnalysis` types as the base schema, plus standalone-entity fields:

```typescript
interface ProjectDecisionDoc extends Decision {
  // Inherited: id, scope, question, context, options, recommendation,
  //            rationale, selected, patronOverride, analysis
  status: 'draft' | 'proposed' | 'ratified' | 'superseded' | 'withdrawn';
  made_at: string;
  related_writs: string[];
  tags?: string[];
  supersedes?: string;
  patron?: string;
  coco_session?: string;
  drafted_by?: string;
  ratified_via?: string;  // InputRequest id
}
```

**Ratification via InputRequest.** Spider's existing `InputRequestDoc` + `patron-input` block type already handles "ask the patron a question and wait." Decisions reuse it: Coco drafts a decision, creates an InputRequest asking "Ratify?" with options `{ratify, amend, reject}`, status transitions on answer.

**Schema relaxation needed:** `InputRequestDoc.rigId` and `engineId` are currently required. Standalone decisions have no rig — those fields need to become optional or get a discriminator for "standalone" vs "engine-initiated" requests.

**Decision → quest linking** via `decision.related_writs` (many-to-many for free via the existing links book).

## Summary

Deferred from v1. The original doc justified the deferral: v1 captures decisions informally in quest Summary prose; the absence is analytical, not operational ("we can still *make* decisions, just informally"); v2 is strictly additive and doesn't paint v1 into any corner.

**Open:**
- Has the absence started to bite? Signal would be Coco or Sean wanting to ask "what did we decide about X?" and having no better tool than grep-the-quest-summaries.
- Which comes first: the InputRequest schema relaxation (standalone requests without rigId/engineId), the decisions book itself, or the Astrolabe ownership wiring?
- Does the `ProjectDecisionDoc` really want to extend the existing `Decision` type, or does trying to share schema across "in-plan decision" and "standalone project decision" create friction?
- Where do ratified decisions surface in Oculus? (A decisions page? A subsection of the quest view?)
- What's the migration story for decisions that live as prose in existing quest Summaries today? (Likely: leave them; only promote the important ones retroactively.)

## Notes

- 2026-04-10: Imported from `.scratch/conversation-topics-as-writs.md` § "v2 sketch: decisions and ratification".
- Parent quest: w-mnswvmj7-2112b86f710a (writ substrate).
- Related code: Astrolabe's existing `Decision` / `DecisionAnalysis` types in `astrolabe/types.ts`; Spider's `InputRequestDoc` + `patron-input` block type; decision-review engine.
- Related quest lines: T3 (Astrolabe planning) — Astrolabe is the proposed owner, so this will cross-link once T3 is opened.
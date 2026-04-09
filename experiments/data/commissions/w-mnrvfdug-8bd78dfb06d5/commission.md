# Add Tags to QuestionSpec + Feedback UI Filters

## Summary

Add an optional `tags` field to all `QuestionSpec` types in the Spider. Update the Feedback UI to display tags on questions and provide toggleable tag filters, sorted alphabetically.

## Motivation

The Astrolabe's planning pipeline produces decisions with analytical metadata (confidence, stakes, category, observable). This metadata needs to flow through to the patron's review experience via the `InputRequestDoc`. A generic `tags` mechanism on `QuestionSpec` is the right transport — it's useful beyond the Astrolabe for any engine that creates patron-input requests.

## Scope

### Type Changes

Add `tags?: string[]` to all three question spec types in `packages/plugins/spider/src/types.ts`:

- `ChoiceQuestionSpec`
- `BooleanQuestionSpec`
- `TextQuestionSpec`

### Feedback UI Changes

File: `packages/plugins/spider/src/static/feedback/feedback.js`

1. **Tag display:** When rendering a question, display its tags (if any) as small badges/pills next to or below the question label. Keep them visually lightweight — they're metadata, not the main content.

2. **Tag filter toolbar:** In the detail view (when viewing a specific InputRequestDoc), add a filter row above the questions. This should:
   - Collect all unique tags across all questions in the current request
   - Display them as toggleable filter buttons/pills, sorted alphabetically by tag name
   - Default state: all tags visible (no filter active)
   - When a tag filter is toggled ON: only show questions that have that tag
   - When multiple tag filters are active: show questions matching ANY active filter (OR logic)
   - Show a "Clear filters" action when any filter is active
   - Show a count of visible/total questions when filters are active (e.g., "Showing 3 of 12")

3. **No changes to the list view** — tags don't appear in the request list, only in the detail view.

### Test Changes

File: `packages/plugins/spider/src/static/feedback/feedback-ui.test.ts`

Add tests for:
- Questions render tags when present
- Questions without tags render normally (no empty badge container)
- Tag filter toolbar appears when questions have tags
- Tag filter toolbar does not appear when no questions have tags
- Toggling a tag filter hides/shows appropriate questions
- Multiple active filters use OR logic
- Clear filters resets visibility

### No Changes Needed

- No changes to `InputRequestDoc` — it already uses `Record<string, QuestionSpec>` which will pick up the new field.
- No changes to input-request tools (answer, complete, reject, etc.) — they don't inspect question specs.
- No changes to the `input-request-export` / `input-request-import` tools — they serialize/deserialize the full doc, tags flow through naturally.
- No changes to the block-types/patron-input handler.
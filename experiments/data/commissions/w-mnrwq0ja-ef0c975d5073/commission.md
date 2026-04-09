# Add Tags to QuestionSpec + Feedback UI Filters

## Summary

Add an optional `tags?: string[]` field to all three `QuestionSpec` types in the Spider, then update the Feedback UI to display tags as badges on question cards and provide a toggleable tag filter toolbar in the detail view.

## Current State

### Type definitions (`packages/plugins/spider/src/types.ts`)

Three question spec interfaces exist at lines 464–490:

```ts
export interface ChoiceQuestionSpec {
  type: 'choice';
  /** Human-readable question text. */
  label: string;
  /** Optional long-form context, explanation, or instructions for this question. */
  details?: string;
  /** Key → display label options map. */
  options: Record<string, string>;
  /** When true, the patron can supply a freeform answer instead of selecting. */
  allowCustom: boolean;
}

export interface BooleanQuestionSpec {
  type: 'boolean';
  /** Human-readable question text. */
  label: string;
  /** Optional long-form context, explanation, or instructions for this question. */
  details?: string;
}

export interface TextQuestionSpec {
  type: 'text';
  /** Human-readable question text. */
  label: string;
  /** Optional long-form context, explanation, or instructions for this question. */
  details?: string;
}

export type QuestionSpec = ChoiceQuestionSpec | BooleanQuestionSpec | TextQuestionSpec;
```

The union type `QuestionSpec` is used by `InputRequestDoc.questions` (a `Record<string, QuestionSpec>` at line 519). No other types need to change — `InputRequestDoc`, answer types, and all input-request tools pass `QuestionSpec` objects through without inspecting metadata fields.

### Feedback UI (`packages/plugins/spider/src/static/feedback/feedback.js`)

A 627-line vanilla JS IIFE with no module imports or build step. Key structures:

- **State variables** (lines 6–10): `requests`, `currentRequest`, `localAnswers`, `pollTimer`, `debounceTimers`.
- **DOM refs** (lines 24–34): `listView`, `detailView`, `requestListEl`, `listEmptyEl`, `statusFilterEl`, `backBtn`, `detailBanner`, `detailMessage`, `questionsContainer`, `actionBar`, `successToast`.
- **`renderDetail()`** (line 153): Orchestrates the detail view — renders banner, message, iterates question keys, dispatches to type-specific renderers, builds action bar.
- **`renderChoiceQuestion(qKey, spec, readonlyClass)`** (line 208): Builds a `.question-card` with a `.question-header` containing `.question-label`, then `.options-list`, then `renderDetails(spec)`.
- **`renderBooleanQuestion(qKey, spec, readonlyClass)`** (line 251): Builds a `.question-card` containing a `.boolean-item` with `.boolean-toggle` and `.boolean-label`, then `renderDetails(spec)`.
- **`renderTextQuestion(qKey, spec, readonlyClass)`** (line 277): Builds a `.question-card` containing a `.text-question` with a `<label>` and `<textarea>`, then `renderDetails(spec)`.
- **`renderDetails(spec)`** (line 293): Shared helper returning `<details>` HTML if `spec.details` exists, or empty string.
- **`navigateToList()`** (line 365): Clears `currentRequest`, `localAnswers`, `debounceTimers` and switches to list view.

### Feedback CSS (`packages/plugins/spider/src/static/feedback/feedback.css`)

362 lines. Uses CSS custom properties (`--surface`, `--border`, `--cyan`, `--green`, `--red`, `--text`, `--text-bright`, `--text-dim`, `--bg`, `--surface2`). Existing relevant classes:

- `.badge` with modifiers `badge--warning`, `badge--success`, `badge--error` — used for status badges in list view.
- `.toolbar` — `display: flex; align-items: center; gap: 8px; margin-bottom: 12px;` — used for list view status filter.
- `.question-card`, `.question-header`, `.question-label` — question card structure.

### Feedback tests (`packages/plugins/spider/src/static/feedback/feedback-ui.test.ts`)

187 lines using `node:test` (describe/it) and `node:assert/strict`. Reads `feedback.js` as raw text via `readFileSync` and tests structural invariants with `assert.match()` / `assert.doesNotMatch()` regex assertions. No DOM rendering or JSDOM.

### Feedback HTML (`packages/plugins/spider/src/static/feedback/index.html`)

40-line HTML shell. Detail view structure:

```html
<div id="detail-view" style="display:none">
  <a href="#" class="back-link" id="back-btn">&larr; Back to list</a>
  <div id="detail-banner"></div>
  <div id="detail-message"></div>
  <div id="questions-container"></div>
  <div id="action-bar"></div>
</div>
```

No changes needed to this file.

## Requirements

- R1: `ChoiceQuestionSpec`, `BooleanQuestionSpec`, and `TextQuestionSpec` must each have an optional `tags?: string[]` field.
- R2: The `tags` field must be placed immediately after the `details` field in each interface, before any type-specific fields.
- R3: The `tags` field must have the JSDoc comment `/** Optional classification tags for filtering and grouping in the UI. */`.
- R4: When a question has tags (non-empty array), the detail view must render each tag as a small badge with CSS class `tag` inside the question card, inline after the label text.
- R5: When a question has no tags (`undefined` or empty array), no tag container or badge elements must be emitted in the question card HTML.
- R6: A shared `renderTags(spec)` helper function must generate the tag badge HTML, returning an empty string when there are no tags.
- R7: In the detail view, when any question in the current request has tags, a tag filter toolbar must appear above `questionsContainer`, inserted as a sibling before it using `parentNode.insertBefore`.
- R8: When no questions in the current request have tags, no tag filter toolbar element must be created or inserted.
- R9: The tag filter toolbar must collect all unique tags across all questions, sort them alphabetically, and display each as a toggleable filter button.
- R10: The tag filter toolbar must use the existing `.toolbar` CSS class for layout.
- R11: When no tag filters are active, all questions must be visible.
- R12: When one or more tag filters are toggled ON, only questions that have at least one of the active tags must be visible (OR logic). Questions without any matching tag must have `style.display` set to `"none"`.
- R13: The tag filter toolbar must display a "Showing X of Y" count and a "Clear filters" action within the toolbar row when any filter is active. These elements must be hidden when no filter is active.
- R14: The "Clear filters" action must reset all active filters, making all questions visible again.
- R15: The active tag filter state must be stored in a plain object (`var activeTagFilters = {}`), toggled by adding/deleting keys.
- R16: The active tag filter state must be cleared in `navigateToList()` alongside existing cleanup of `localAnswers` and `debounceTimers`.
- R17: The tag filter toolbar must have a unique ID and must be removed (via `getElementById` + remove) at the start of `renderDetail()` before a new one is potentially inserted, to handle re-renders cleanly.
- R18: Tag filter button clicks must be handled by a dedicated click listener attached directly to the toolbar element after creation.
- R19: In choice question cards, tag badges must appear inside the `.question-header` div after the `.question-label` span.
- R20: In boolean question cards, tag badges must appear inline after the `.boolean-label` span, inside the `.boolean-item` div.
- R21: In text question cards, tag badges must appear after the `<label>` closing tag, before the `<textarea>`, as a separate element.
- R22: Source-text regression tests must be added for: tag badge rendering patterns, absence of tag container when no tags, tag filter toolbar structural patterns, filter state variable, tag collection and sorting, renderTags helper, and clear filters action.

## Design

### Type Changes

All three interfaces gain the same field. Full updated types:

```ts
export interface ChoiceQuestionSpec {
  type: 'choice';
  /** Human-readable question text. */
  label: string;
  /** Optional long-form context, explanation, or instructions for this question. */
  details?: string;
  /** Optional classification tags for filtering and grouping in the UI. */
  tags?: string[];
  /** Key → display label options map. */
  options: Record<string, string>;
  /** When true, the patron can supply a freeform answer instead of selecting. */
  allowCustom: boolean;
}

export interface BooleanQuestionSpec {
  type: 'boolean';
  /** Human-readable question text. */
  label: string;
  /** Optional long-form context, explanation, or instructions for this question. */
  details?: string;
  /** Optional classification tags for filtering and grouping in the UI. */
  tags?: string[];
}

export interface TextQuestionSpec {
  type: 'text';
  /** Human-readable question text. */
  label: string;
  /** Optional long-form context, explanation, or instructions for this question. */
  details?: string;
  /** Optional classification tags for filtering and grouping in the UI. */
  tags?: string[];
}
```

The `QuestionSpec` union type and `InputRequestDoc` are unchanged.

### Behavior

#### Tag badge rendering (`renderTags` helper)

Add a `renderTags(spec)` function alongside the existing `renderDetails(spec)` helper:

- When `spec.tags` is falsy or `spec.tags.length === 0`, return `''`.
- Otherwise, return a string of `<span class="tag">` elements, one per tag, with tag text HTML-escaped via the existing `esc()` function. Tags are rendered in array order (no sorting at render time — the producer controls order; the filter toolbar sorts independently).

#### Tag badge insertion per question type

**Choice questions** (`renderChoiceQuestion`): Insert `renderTags(spec)` inside the `.question-header` div, after the `.question-label` span. The existing line:
```js
'<div class="question-header"><span class="question-label">' + esc(spec.label) + '</span></div>'
```
becomes:
```js
'<div class="question-header"><span class="question-label">' + esc(spec.label) + '</span>' + renderTags(spec) + '</div>'
```

**Boolean questions** (`renderBooleanQuestion`): Insert `renderTags(spec)` after the `.boolean-label` span inside the `.boolean-item` div. The existing line:
```js
'<span class="boolean-label">' + esc(spec.label) + '</span>'
```
becomes:
```js
'<span class="boolean-label">' + esc(spec.label) + '</span>' + renderTags(spec)
```
(still inside the `.boolean-item` div, before its closing)

**Text questions** (`renderTextQuestion`): Insert `renderTags(spec)` after the `<label>` and before the `<textarea>`. The existing sequence:
```js
'<label>' + esc(spec.label) + '</label>'
+ '<textarea ...'
```
becomes:
```js
'<label>' + esc(spec.label) + '</label>'
+ renderTags(spec)
+ '<textarea ...'
```

#### State variable

Add `var activeTagFilters = {};` to the state variables block (lines 6–10), after `var debounceTimers = {};`.

#### Tag filter toolbar creation and insertion

At the end of `renderDetail()`, after `questionsContainer.innerHTML = html;` and before the action bar rendering:

1. Remove any existing toolbar: `var oldToolbar = document.getElementById('tag-filter-toolbar'); if (oldToolbar) oldToolbar.remove();`
2. Collect all unique tags across all questions in `currentRequest.questions`. Use a plain object as a set, then extract keys and sort alphabetically.
3. If no tags exist, skip toolbar creation entirely — do not insert any element.
4. If tags exist, create a `div` element with `id="tag-filter-toolbar"` and `className="toolbar"`.
5. For each unique tag (sorted alphabetically), create a `<button>` element with:
   - `className = 'tag-filter-btn'` (add `' active'` when the tag is in `activeTagFilters`)
   - `setAttribute('data-tag', tagName)`
   - `textContent = tagName`
6. Create a `<span>` element for the count display (class `tag-filter-count`) and a `<button>` for "Clear filters" (class `tag-filter-clear`). Both are hidden (`style.display = 'none'`) when no filters are active.
7. Attach a single click listener to the toolbar element. The listener:
   - On click of a `.tag-filter-btn`: toggle the tag in `activeTagFilters` (add key if absent, delete if present). Toggle the `active` class on the button. Call `applyTagFilters()`.
   - On click of `.tag-filter-clear`: reset `activeTagFilters = {}`. Remove `active` class from all filter buttons. Call `applyTagFilters()`.
8. Insert the toolbar before `questionsContainer` using `questionsContainer.parentNode.insertBefore(toolbar, questionsContainer)`.
9. Call `applyTagFilters()` to apply any previously-active filters (handles re-render case, though state is typically empty on fresh detail).

#### `applyTagFilters()` function

A new function that:

1. Gets all `.question-card` elements inside `questionsContainer`.
2. Checks if any filter is active: `var filterKeys = Object.keys(activeTagFilters);`
3. If `filterKeys.length === 0`: set `style.display = ''` on all cards. Hide the count and clear elements. Return.
4. If filters are active: for each card, get its `data-question-key`, look up the corresponding `spec` in `currentRequest.questions`, check if `spec.tags` contains any of the active filter tags (OR logic). Set `style.display = ''` if matching, `'none'` if not.
5. Count visible cards. Update the count span: `'Showing ' + visibleCount + ' of ' + totalCount`. Show both the count span and clear button (`style.display = ''`).

#### Navigation cleanup

In `navigateToList()`, add `activeTagFilters = {};` alongside the existing cleanup lines.

### CSS additions (`packages/plugins/spider/src/static/feedback/feedback.css`)

Add after the existing `.question-label` rule block (around line 77):

```css
/* ── Tag badges ─────────────────────────────────────────────────────── */

.tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-dim);
  background: var(--surface2);
  border-radius: 4px;
  margin-left: 6px;
  vertical-align: middle;
}
```

Add after the existing `.toolbar` rule block (around line 8):

```css
/* ── Tag filter toolbar ─────────────────────────────────────────────── */

.tag-filter-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  color: var(--text-dim);
  cursor: pointer;
  transition: all 0.15s;
}
.tag-filter-btn:hover {
  border-color: var(--cyan);
  color: var(--text);
}
.tag-filter-btn.active {
  background: var(--cyan);
  border-color: var(--cyan);
  color: var(--bg);
}

.tag-filter-count {
  font-size: 11px;
  color: var(--text-dim);
  margin-left: auto;
}

.tag-filter-clear {
  padding: 4px 10px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
}
.tag-filter-clear:hover {
  color: var(--text);
  border-color: var(--text-dim);
}
```

### Non-obvious Touchpoints

- **`packages/plugins/spider/src/static/feedback/feedback.css`**: The `.toolbar` class is reused by the tag filter toolbar — any future changes to `.toolbar` will affect both the list-view status filter and the detail-view tag filter.
- **Barrel re-exports**: The `QuestionSpec` types are re-exported from `packages/plugins/spider/src/index.ts`. No changes needed there — the types flow through the existing `export * from './types.ts'` pattern. But the implementing agent should verify this barrel exists.

## Validation Checklist

- V1 [R1, R2, R3]: Inspect `packages/plugins/spider/src/types.ts` and verify all three interfaces have `tags?: string[]` placed immediately after `details?`, with the exact JSDoc `/** Optional classification tags for filtering and grouping in the UI. */`.
- V2 [R4, R5, R6, R19, R20, R21]: In `feedback.js`, verify a `renderTags` function exists that: returns empty string when `spec.tags` is falsy or empty; returns `<span class="tag">` elements otherwise. Verify it is called in all three renderers at the correct insertion points (after `.question-label` in choice, after `.boolean-label` in boolean, after `</label>` in text).
- V3 [R7, R8, R10, R15, R16, R17]: In `feedback.js`, verify that `renderDetail()` removes any existing `#tag-filter-toolbar`, collects unique tags, skips toolbar creation when no tags exist, creates a `div` with `id="tag-filter-toolbar"` and `class="toolbar"`, inserts it before `questionsContainer`, and that `navigateToList()` clears `activeTagFilters`.
- V4 [R9, R11, R12, R13, R14, R18]: In `feedback.js`, verify the toolbar: sorts tags alphabetically, creates toggle buttons with `data-tag` attributes, has a dedicated click listener, implements OR-logic filtering via `applyTagFilters()`, displays "Showing X of Y" count and "Clear filters" when active, and hides both when no filter is active.
- V5 [R22]: In `feedback-ui.test.ts`, verify new test cases exist for: `renderTags` function presence, `.tag` CSS class in source, `tag-filter-toolbar` ID, `tag-filter-btn` class, `activeTagFilters` state variable, `applyTagFilters` function, `.tag-filter-clear` class, alphabetical sort pattern (`.sort()`), and absence of tag container for empty/missing tags.
- V6 [R1]: Run `npx tsc --noEmit` from the spider package to verify the type changes compile without errors.
- V7 [R22]: Run `npx vitest run feedback-ui` (or the project's test runner for this file) and verify all new and existing tests pass.

## Test Cases

### Tag badge rendering

1. **Choice question with tags renders badges**: A `ChoiceQuestionSpec` with `tags: ['urgent', 'api']` must produce HTML containing `<span class="tag">urgent</span>` and `<span class="tag">api</span>` inside the `.question-header` div.
2. **Boolean question with tags renders badges**: A `BooleanQuestionSpec` with `tags: ['scope']` must produce HTML containing `<span class="tag">scope</span>` after the `.boolean-label` span.
3. **Text question with tags renders badges**: A `TextQuestionSpec` with `tags: ['notes']` must produce HTML containing `<span class="tag">notes</span>` after the `<label>` element.
4. **Question with no tags (undefined) renders no badge elements**: A `QuestionSpec` without a `tags` field must produce no `.tag` spans and no empty wrapper.
5. **Question with empty tags array renders no badge elements**: A `QuestionSpec` with `tags: []` must produce no `.tag` spans and no empty wrapper.
6. **Tags with special characters are HTML-escaped**: A tag containing `<script>` must be rendered as escaped text via the `esc()` helper.

### Tag filter toolbar

7. **Toolbar appears when questions have tags**: When at least one question in the request has a non-empty `tags` array, a `#tag-filter-toolbar` element must be present before `questionsContainer`.
8. **Toolbar does not appear when no questions have tags**: When all questions have `undefined` or empty tags, no `#tag-filter-toolbar` element must exist in the DOM.
9. **Toolbar shows unique tags sorted alphabetically**: Given questions with tags `['beta', 'alpha']` and `['gamma', 'alpha']`, the toolbar must show buttons in order: `alpha`, `beta`, `gamma`.
10. **Toggling a filter hides non-matching questions**: When "api" filter is active, questions without an "api" tag must have `style.display === 'none'`, and questions with "api" tag must be visible.
11. **Multiple active filters use OR logic**: When both "api" and "scope" filters are active, questions with either "api" or "scope" (or both) must be visible. Questions with neither must be hidden.
12. **Count displays correctly**: When 2 of 5 questions match active filters, the count must read "Showing 2 of 5".
13. **Clear filters resets all**: After clicking "Clear filters", all questions must be visible, all filter buttons must lose the `active` class, and the count/clear elements must be hidden.
14. **Filter state resets on navigation**: After navigating back to the list and opening a different request, `activeTagFilters` must be empty (no stale filters from previous request).

### Edge cases

15. **Single question with single tag**: Toolbar appears with one button. Toggling it shows 1 of 1, toggling again shows all.
16. **All questions have the same tag**: Toolbar shows one button. Activating it shows all questions (all match).
17. **Question with many tags**: A question with 10 tags renders all 10 badges and appears in filter results for any of them.

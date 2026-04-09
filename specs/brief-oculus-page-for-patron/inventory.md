# Inventory: Oculus Page for Patron Feedback (Input Requests)

Slug: `brief-oculus-page-for-patron`

---

## Affected Files

### Files to Create

| Path | Purpose |
|------|---------|
| `packages/plugins/spider/src/static/feedback/index.html` | Page entry point; HTML structure for list and detail views |
| `packages/plugins/spider/src/static/feedback/feedback.css` | Page-specific styles (question cards, cards, action buttons, etc.) |
| `packages/plugins/spider/src/static/feedback/feedback.js` | Vanilla JS IIFE: all UI logic, API calls, state management |
| `packages/plugins/spider/src/static/feedback/feedback-ui.test.ts` | Source-text regression tests (follows `spider-ui.test.ts` pattern) |

### Files to Modify

| Path | Change |
|------|--------|
| `packages/plugins/spider/src/spider.ts` | Add second entry to `supportKit.pages` array for `'feedback'` page |

### Files Read (no changes expected)

- `packages/plugins/spider/src/types.ts` — InputRequestDoc, QuestionSpec types
- `packages/plugins/spider/src/tools/input-request-list.ts` — list tool definition
- `packages/plugins/spider/src/tools/input-request-show.ts` — show tool definition
- `packages/plugins/spider/src/tools/input-request-answer.ts` — answer tool definition
- `packages/plugins/spider/src/tools/input-request-complete.ts` — complete tool definition
- `packages/plugins/spider/src/tools/input-request-reject.ts` — reject tool definition
- `packages/plugins/spider/src/input-request-validation.ts` — validation logic
- `packages/plugins/oculus/src/oculus.ts` — toolNameToRoute, permissionToMethod, page serving
- `packages/plugins/oculus/src/types.ts` — PageContribution, RouteContribution
- `packages/plugins/oculus/src/static/style.css` — shared CSS variables and component classes
- `packages/plugins/spider/src/static/index.html` — existing spider page HTML structure
- `packages/plugins/spider/src/static/spider.js` — existing spider page JS patterns
- `packages/plugins/spider/src/static/spider.css` — existing spider page CSS patterns
- `packages/plugins/spider/src/static/spider-ui.test.ts` — testing pattern
- `packages/plugins/spider/src/oculus-routes.ts` — custom route pattern
- `packages/plugins/clerk/pages/writs/index.html` — comparable page implementation
- `packages/plugins/astrolabe/src/engines/decision-review.ts` — primary InputRequest producer (message format, question shapes)

---

## Types Involved

### From `packages/plugins/spider/src/types.ts`

```typescript
export type InputRequestStatus = 'pending' | 'completed' | 'rejected';

export interface ChoiceQuestionSpec {
  type: 'choice';
  label: string;
  details?: string;
  options: Record<string, string>;  // key → display label
  allowCustom: boolean;
}

export interface BooleanQuestionSpec {
  type: 'boolean';
  label: string;
  details?: string;
}

export interface TextQuestionSpec {
  type: 'text';
  label: string;
  details?: string;
}

export type QuestionSpec = ChoiceQuestionSpec | BooleanQuestionSpec | TextQuestionSpec;

/** Discriminated choice answer */
export type ChoiceAnswer = { selected: string } | { custom: string };

/**
 * answer types by question type:
 * - choice  → ChoiceAnswer (object with 'selected' or 'custom' key)
 * - boolean → boolean
 * - text    → string
 */
export type AnswerValue = ChoiceAnswer | boolean | string;

export interface InputRequestDoc {
  [key: string]: unknown;
  id: string;
  rigId: string;
  engineId: string;
  status: InputRequestStatus;
  message?: string;
  questions: Record<string, QuestionSpec>;
  answers: Record<string, AnswerValue>;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}
```

### From `packages/plugins/oculus/src/types.ts`

```typescript
export interface PageContribution {
  id: string;       // URL segment: /pages/{id}/
  title: string;    // Navigation label
  dir: string;      // Path relative to package root in node_modules
}
```

---

## Tool Definitions (API Surface)

### `input-request-list` (GET, permission: `'read'`)
- **Actual REST route**: `GET /api/input/request-list`
- **Query params**: `status` (default `'pending'`), `limit` (default `20`), `offset?`
- **Returns**: `InputRequestDoc[]` ordered by `createdAt` desc

### `input-request-show` (GET, permission: `'read'`)
- **Actual REST route**: `GET /api/input/request-show`
- **Query params**: `id`
- **Returns**: `InputRequestDoc` or throws if not found

### `input-request-answer` (POST, permission: `'spider:write'`)
- **Actual REST route**: `POST /api/input/request-answer`
- **Body params**: `id`, `question`, `select?`, `custom?`, `value?`
  - Choice: use `select` (option key) OR `custom` (freeform string, only if `allowCustom`)
  - Boolean: use `value` as string `"true"` or `"false"` (validated by `validateAnswer`)
  - Text: use `value` as string
- **Returns**: updated `InputRequestDoc`
- **Throws**: if request not found, not pending, question not found, invalid answer shape

### `input-request-complete` (POST, permission: `'spider:write'`)
- **Actual REST route**: `POST /api/input/request-complete`
- **Body params**: `id`
- **Returns**: updated `InputRequestDoc` with `status: 'completed'`
- **Throws**: if not pending, or unanswered questions remain

### `input-request-reject` (POST, permission: `'spider:write'`)
- **Actual REST route**: `POST /api/input/request-reject`
- **Body params**: `id`, `reason?`
- **Returns**: updated `InputRequestDoc` with `status: 'rejected'`
- **Throws**: if not pending. Does NOT require all questions answered.

---

## Oculus Page & Tool Route Mechanics

### `toolNameToRoute` function (actual behavior)

```typescript
// packages/plugins/oculus/src/oculus.ts
export function toolNameToRoute(name: string): string {
  const idx = name.indexOf('-');           // FIRST dash only
  if (idx === -1) return `/api/${name}`;
  return `/api/${name.slice(0, idx)}/${name.slice(idx + 1)}`;
}
```

**Concrete mappings for input-request tools:**
- `input-request-list` → `/api/input/request-list` (NOT `/api/input-request/list`)
- `input-request-show` → `/api/input/request-show`
- `input-request-answer` → `/api/input/request-answer`
- `input-request-complete` → `/api/input/request-complete`
- `input-request-reject` → `/api/input/request-reject`

### `permissionToMethod` function

- `'read'` → GET (params via query string)
- `'spider:write'` → POST (params via JSON body)

### Page Serving

- Oculus serves pages at `/pages/{id}/*`
- `dir` is resolved as `path.join(g.home, 'node_modules', packageName, dir)`
- For `index.html` requests, Oculus injects the shared `/static/style.css` link and nav bar HTML
- All custom properties from `style.css` are available in pages via injected stylesheet

### Existing Spider Page `pages` Array (current state)

```typescript
// packages/plugins/spider/src/spider.ts, ~line 1839
pages: [{
  id: 'spider',
  title: 'Spider',
  dir: 'src/static',
}],
```

**Change required:**
```typescript
pages: [
  { id: 'spider', title: 'Spider', dir: 'src/static' },
  { id: 'feedback', title: 'Feedback', dir: 'src/static/feedback' },
],
```

---

## Existing Page Patterns (Comparable Implementations)

### Spider Page (`packages/plugins/spider/src/static/`)

**JS structure:**
- Vanilla IIFE: `(function () { 'use strict'; ... })()`
- State vars at top: `var rigs = []; var currentRig = null; ...`
- `badgeClass(status)` / `badgeHtml(status)` helper
- `esc(s)` HTML escape helper
- `formatDate(iso)` helper
- HTML rendering via string concatenation: `'<div class="foo">' + esc(val) + '</div>'`
- Fetch: `fetch(url).then(r => r.json()).then(data => ...)`
- Session polling uses `setInterval`/`clearInterval` stored in `sessionPollTimer`
- Event delegation from `document.addEventListener('click', ...)` with `data-*` attributes
- Two views: list (`#rig-list-view`) and detail (`#rig-detail-view`), toggled with `style.display`
- `index.html` links to `spider.css` with relative path: `<link rel="stylesheet" href="spider.css">`
- `index.html` includes JS at bottom: `<script src="spider.js"></script>`

**CSS structure:**
- Comment header: `/* Spider page — page-specific styles */`
- Comment: `/* Uses CSS custom properties from the shared Oculus stylesheet */`
- Fallback values used on custom props: `var(--border, #333)` (defensive)

**Testing pattern (`spider-ui.test.ts`):**
- Reads the `.js` source file as a string
- Uses `assert.match(sourceText, /regex/)` to verify structural HTML template patterns
- Tests HTML template fragments within the IIFE source

### Writs Page (`packages/plugins/clerk/pages/writs/index.html`)
- Inline `<style>` block inside `<head>` for page-specific styles (different from spider pattern of separate CSS file)
- Uses `.badge--draft` etc. as inline style additions

---

## Astrolabe Decision-Review Engine: Input Request Shape

The primary producer of input requests is `packages/plugins/astrolabe/src/engines/decision-review.ts`:

- **Questions**: decisions become `ChoiceQuestionSpec` with `allowCustom: true`. Scope items become `BooleanQuestionSpec`.
- **Pre-filled answers**: decision recommendations are pre-populated as `{ selected: recommendation }`. Scope included values pre-populated as `boolean`.
- **Message format**: `"Planning review for: {writ.title} (codex: {plan.codex})\n\nIn-scope items: S1, S2, ..."` 
- **Question keys**: decision IDs (e.g., `D1`, `D2`) and scope IDs prefixed `scope:` (e.g., `scope:S1`, `scope:S2`)
- **`details` field**: decision-review sets `details` on `ChoiceQuestionSpec` to hold the `context` from the analyst. Scope boolean spec uses `rationale` as the `details`.

---

## Shared CSS Custom Properties (from `style.css`)

All available without redefinition in page styles:

```css
--bg: #1a1b26
--surface: #24283b
--surface2: #2f3549
--border: #3b4261
--text: #c0caf5
--text-dim: #565f89
--text-bright: #e0e6ff
--green: #9ece6a
--red: #f7768e
--yellow: #e0af68
--cyan: #7dcfff
--magenta: #bb9af7
--blue: #7aa2f7
--font-mono: "SF Mono", "Fira Code", "JetBrains Mono", monospace
```

**Existing badge classes** (from `style.css`):
- `.badge` — base badge style
- `.badge--success` — green, for completed
- `.badge--error` — red, for rejected/failed
- `.badge--warning` — yellow, for pending/blocked
- `.badge--info` / `.badge--active` — cyan
- `.btn`, `.btn--primary`, `.btn--success`, `.btn--danger`
- `.card` — surface background, border, 8px radius, 16px padding
- `.empty-state` — centered, dim text

---

## Doc/Code Discrepancies

1. **Brief API URL table is wrong.** The brief states endpoints like `GET /api/input-request/list`, but `toolNameToRoute` splits on the FIRST `-` only, producing `GET /api/input/request-list`. The JS must use the real URLs (verified against how spider.js calls `/api/rig/list` for `rig-list`, `/api/writ/list` for `writ-list`).

2. **"Plan Workshop" referenced as gold standard does not exist** in this codebase. The brief provides the actual CSS/patterns inline which are the real reference. The comparable existing implementations are the Spider page and the Writs page.

3. **Brief boolean answer handling**: The brief says boolean questions render as a "toggle checkbox row" with click-to-toggle. The `input-request-answer` tool requires `value` as a string (`"true"` or `"false"`), not a native boolean, for the REST layer (all params come in as strings from query/body and are coerced). The JS must send `"true"` or `"false"` as strings in the POST body.

---

## Existing Tests Coverage

- `packages/plugins/spider/src/input-request.test.ts` — covers all 7 input-request tools (list, show, answer, complete, reject, export, import) plus patron-input block type
- `packages/plugins/spider/src/input-request-validation.test.ts` — covers answer validation
- `packages/plugins/spider/src/static/spider-ui.test.ts` — source-text regression tests for spider.js HTML templates

**New test needed:**
- `packages/plugins/spider/src/static/feedback/feedback-ui.test.ts` — source-text assertions that `feedback.js` contains expected structural patterns (card HTML templates, answer dispatch, question-type branching, IIFE wrapper)

---

## Existing Context / Notes

- `_planning/brief.md` — the patron brief

No prior commissions touching this area were found in the planning directory.

---

## Summary of What Gets Built

Three new static files + one-line spider.ts change:

1. `feedback/index.html` — Two-panel layout with `#list-view` and `#detail-view`. Status filter `<select>` (pending/completed/rejected), request cards list, back button, message display, question rendering area, action buttons (Complete / Reject).
2. `feedback/feedback.css` — Page-specific styles: `.request-card`, `.question-card`, `.option`, `.option-radio`, `.boolean-item`, `.boolean-toggle`, `.text-question`, `.btn-complete`, `.btn-reject`, `.back-link`, `.reject-row`, answer-count indicator.
3. `feedback/feedback.js` — IIFE: state (`requests`, `currentRequest`, `localAnswers`, `pollTimer`), fetch helpers, badge rendering, question rendering by type, answer dispatch (auto-save on interaction), validation counter, complete/reject actions, polling (every 10–15s on list view).
4. `spider.ts` — Add `{ id: 'feedback', title: 'Feedback', dir: 'src/static/feedback' }` to `pages[]`.

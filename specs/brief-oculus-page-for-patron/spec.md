---
author: plan-writer
estimated_complexity: 8
---

# Oculus Feedback Page for Patron Input Requests

## Summary

A new Oculus page contributed by the Spider apparatus that provides a visual, interactive UI for patrons to review and respond to input requests. The page replaces the CLI `input-request-*` tool workflow with card-based list view, interactive question rendering (choice radios, boolean toggles, text areas), auto-saving answers, and complete/reject actions.

## Current State

The Spider apparatus registers a single Oculus page at `src/static/` (the Spider dashboard). Input requests are managed entirely via CLI tools:

```typescript
// packages/plugins/spider/src/spider.ts, line ~1839
pages: [{
  id: 'spider',
  title: 'Spider',
  dir: 'src/static',
}],
```

The five input-request tools (`input-request-list`, `input-request-show`, `input-request-answer`, `input-request-complete`, `input-request-reject`) are already auto-mapped to REST endpoints by the Oculus via `toolNameToRoute`:

| Tool | REST Endpoint | Method | Params |
|------|---------------|--------|--------|
| `input-request-list` | `GET /api/input/request-list` | GET | `?status=pending&limit=100` |
| `input-request-show` | `GET /api/input/request-show` | GET | `?id=xxx` |
| `input-request-answer` | `POST /api/input/request-answer` | POST | JSON body |
| `input-request-complete` | `POST /api/input/request-complete` | POST | JSON body `{id}` |
| `input-request-reject` | `POST /api/input/request-reject` | POST | JSON body `{id, reason?}` |

The `InputRequestDoc` type and all question/answer types are defined in `packages/plugins/spider/src/types.ts`.

The existing Spider page (`packages/plugins/spider/src/static/spider.js`) follows a vanilla IIFE pattern with string-based HTML rendering, event wiring after innerHTML assignment, and `style.display` toggling for list↔detail navigation.

## Requirements

- R1: A new Oculus page registered as `{ id: 'feedback', title: 'Feedback', dir: 'src/static/feedback' }` in the Spider's `supportKit.pages` array, alongside the existing Spider page.
- R2: The page must consist of three files: `index.html`, `feedback.css`, `feedback.js` in `packages/plugins/spider/src/static/feedback/`.
- R3: The list view must display input request cards showing: request ID, rig ID, engine ID, message, status badge, created timestamp, and answered-question count (e.g., "3/5 answered").
- R4: The list view must have a `<select>` dropdown to filter by status (pending / completed / rejected), defaulting to "pending" on page load.
- R5: The list view must poll every 12 seconds, re-fetching with the currently selected status filter. Polling must stop when the detail view is shown and resume when returning to the list.
- R6: The list view must fetch with `limit=100`.
- R7: When the list is empty, the page must show an empty-state message using the shared `.empty-state` class: "No {status} requests."
- R8: Status badges must use: `pending` → `badge--warning`, `completed` → `badge--success`, `rejected` → `badge--error`.
- R9: Clicking a request card must show the detail view using the data already fetched in the list (no re-fetch).
- R10: The detail view must display the request's `message` field prominently at the top, before the question list.
- R11: Questions must render in `Object.keys(questions)` insertion order.
- R12: Choice questions must render as radio-button option rows showing only the option description text (not the option key). When `allowCustom` is true, an additional "Custom" radio option must appear at the bottom of the options list, with a text input that becomes active when the custom radio is selected.
- R13: Boolean questions must render as a clickable toggle row. Unanswered booleans must show an indeterminate state (default border color, empty interior — no check or X). Answered `true` shows green check; answered `false` shows red X with strikethrough label.
- R14: Text questions must render as a labeled textarea.
- R15: All question types with a `details` field must render an expandable context section using native `<details>/<summary>` HTML elements.
- R16: Pre-filled answers from the server must be reflected in the initial render state (selected radios, checked booleans, pre-filled text).
- R17: Each answer must auto-save via POST to `/api/input/request-answer` immediately on interaction. Choice: on option click. Boolean: on toggle click. Text: on change with a debounce timer. Custom choice input: on Enter keypress and on blur.
- R18: The answer POST body must be: choice selection `{id, question, select: optionKey}`, choice custom `{id, question, custom: text}`, boolean `{id, question, value: "true"/"false"}`, text `{id, question, value: text}`. Boolean values must be string `"true"` or `"false"`, not native JSON booleans.
- R19: Auto-save must track local answer state and only POST when the answer actually changes.
- R20: Auto-save errors must show a brief inline error message near the affected question, auto-dismissed after a few seconds.
- R21: When a regular option radio is clicked on a choice question that had a custom answer, the custom text input must remain visible but the regular option is saved. When the custom radio is selected, the custom text input value is saved.
- R22: The Complete button must be disabled (`opacity: 0.4`, `cursor: not-allowed`) until all questions are answered. A count indicator (e.g., "3/5 answered") must appear near the Complete button.
- R23: On successful completion, the page must navigate back to the list view immediately and show a success toast/badge on the list view.
- R24: The Reject button must always be available for pending requests. Clicking it must expand an inline text input for an optional rejection reason, with a confirm button.
- R25: For completed or rejected requests, the detail view must show disabled action buttons and a status banner at the top indicating the request's terminal state (e.g., "This request has been completed" / "This request was rejected"). Form controls must be non-interactive.
- R26: The page CSS must use the brief's specified class names and rules verbatim, without CSS custom property fallback values (bare `var(--border)`, not `var(--border, #3b4261)`).
- R27: The JS must be a vanilla IIFE with string-based HTML rendering, event delegation on a parent container using `data-question-key` and `data-option-key` attributes, and no framework/modules/imports.
- R28: Source-text regression tests must verify: IIFE wrapper, question-type branching for choice/boolean/text, answer POST body shapes, badge class mapping, and event delegation on `data-*` attributes.

## Design

### File Structure

```
packages/plugins/spider/
├── src/
│   ├── spider.ts                          # MODIFY: add feedback page to pages[]
│   └── static/
│       ├── index.html                     # existing spider page (unchanged)
│       ├── spider.css                     # existing (unchanged)
│       ├── spider.js                      # existing (unchanged)
│       ├── spider-ui.test.ts              # existing (unchanged)
│       └── feedback/
│           ├── index.html                 # NEW
│           ├── feedback.css               # NEW
│           ├── feedback.js                # NEW
│           └── feedback-ui.test.ts        # NEW
```

### spider.ts Change

In `packages/plugins/spider/src/spider.ts`, change the `pages` array (around line 1839) from:

```typescript
pages: [{
  id: 'spider',
  title: 'Spider',
  dir: 'src/static',
}],
```

to:

```typescript
pages: [
  { id: 'spider', title: 'Spider', dir: 'src/static' },
  { id: 'feedback', title: 'Feedback', dir: 'src/static/feedback' },
],
```

### index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feedback</title>
  <link rel="stylesheet" href="feedback.css">
</head>
<body>
<main style="padding: 24px;">
  <h1>Feedback</h1>

  <!-- List view -->
  <div id="list-view">
    <div class="toolbar">
      <select id="status-filter">
        <option value="pending">pending</option>
        <option value="completed">completed</option>
        <option value="rejected">rejected</option>
      </select>
    </div>
    <div id="request-list"></div>
    <div id="list-empty" class="empty-state" style="display:none">No pending requests.</div>
  </div>

  <!-- Detail view -->
  <div id="detail-view" style="display:none">
    <a href="#" class="back-link" id="back-btn">&larr; Back to list</a>
    <div id="detail-banner"></div>
    <div id="detail-message"></div>
    <div id="questions-container"></div>
    <div id="action-bar"></div>
  </div>

  <!-- Success toast -->
  <div id="success-toast" class="success-toast" style="display:none"></div>
</main>
<script src="feedback.js"></script>
</body>
</html>
```

### feedback.css

The CSS must use the exact class names from the brief's specifications. Key sections:

**Request cards** (list view):
```css
.request-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.request-card:hover {
  border-color: var(--cyan);
}
```

**Question cards** (detail view):
```css
.question-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}
.question-header {
  padding: 12px 16px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.question-label {
  flex: 1;
  font-weight: 500;
  color: var(--text-bright);
}
```

**Choice option rows**:
```css
.option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;
  margin-bottom: 2px;
}
.option:hover { background: var(--surface2); }
.option-radio {
  width: 16px; height: 16px;
  border-radius: 50%;
  border: 2px solid var(--border);
  flex-shrink: 0;
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.option.selected .option-radio {
  border-color: var(--green);
}
.option.selected .option-radio::after {
  content: "";
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--green);
}
.option.selected .option-text {
  color: var(--text-bright);
  font-weight: 500;
}
```

**Custom override input**:
```css
.custom-row {
  padding: 8px 16px 12px;
}
.custom-row input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}
.custom-row input:focus { border-color: var(--cyan); }
```

**Boolean toggle rows**:
```css
.boolean-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 4px;
  cursor: pointer;
  transition: background 0.1s;
}
.boolean-item:hover { background: var(--surface); }
.boolean-toggle {
  width: 20px; height: 20px;
  border-radius: 4px;
  border: 2px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 12px;
  transition: all 0.15s;
}
/* True state — green check */
.boolean-item.checked .boolean-toggle {
  background: var(--green);
  border-color: var(--green);
  color: var(--bg);
}
/* False state — red X */
.boolean-item.unchecked .boolean-toggle {
  background: transparent;
  border-color: var(--red);
  color: var(--red);
}
.boolean-item.unchecked .boolean-label {
  color: var(--text-dim);
  text-decoration: line-through;
}
```

The indeterminate/unanswered boolean state uses the base `.boolean-toggle` style — default `--border` color, empty interior, no check or X mark. No additional CSS class is needed.

**Text questions**:
```css
.text-question {
  margin-bottom: 16px;
}
.text-question label {
  display: block;
  font-weight: 500;
  color: var(--text-bright);
  margin-bottom: 8px;
}
.text-question textarea {
  width: 100%;
  min-height: 80px;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}
.text-question textarea:focus { border-color: var(--cyan); }
```

**Question details** — style the native `<details>/<summary>` within question cards:
```css
.question-card details {
  padding: 4px 16px 12px;
}
.question-card details summary {
  font-size: 11px;
  color: var(--text-dim);
  cursor: pointer;
  user-select: none;
}
.question-card details summary:hover { color: var(--cyan); }
.question-card details .details-body {
  padding: 12px 0 0;
  font-size: 12px;
  color: var(--text-dim);
  border-top: 1px solid var(--border);
  margin-top: 8px;
}
```

**Action buttons**:
```css
.btn-complete {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: var(--green);
  color: var(--bg);
}
.btn-complete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-reject {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: var(--surface2);
  color: var(--red);
}
.back-link {
  color: var(--text-dim);
  font-size: 12px;
  margin-bottom: 8px;
  display: inline-block;
}
```

**Additional page-specific styles needed** (not from the brief but required for completeness):

```css
/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

/* Request card layout sub-elements */
.request-card .request-id {
  font-weight: 500;
  color: var(--text-bright);
  min-width: 80px;
}
.request-card .request-meta {
  flex: 1;
  min-width: 0;
}
.request-card .request-message {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}
.request-card .request-ids {
  font-size: 11px;
  color: var(--text-dim);
}
.request-card .request-time {
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
}
.request-card .request-progress {
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
}

/* Detail message */
#detail-message {
  font-size: 15px;
  color: var(--text-bright);
  margin-bottom: 16px;
  line-height: 1.5;
  white-space: pre-wrap;
}

/* Action bar */
#action-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.answer-count {
  font-size: 12px;
  color: var(--text-dim);
}

/* Reject inline prompt */
.reject-prompt {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.reject-prompt input {
  flex: 1;
  padding: 6px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  outline: none;
}
.reject-prompt input:focus { border-color: var(--cyan); }
.reject-confirm {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  background: var(--red);
  color: var(--bg);
  cursor: pointer;
}

/* Status banner for non-pending detail view */
.status-banner {
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
}
.status-banner.completed {
  background: rgba(158, 206, 106, 0.1);
  color: var(--green);
}
.status-banner.rejected {
  background: rgba(247, 118, 142, 0.1);
  color: var(--red);
}

/* Auto-save error inline */
.save-error {
  font-size: 11px;
  color: var(--red);
  padding: 4px 16px;
}

/* Success toast */
.success-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 10px 20px;
  background: var(--green);
  color: var(--bg);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  z-index: 1000;
}

/* Disabled state for non-pending detail view */
.question-card.readonly {
  opacity: 0.7;
  pointer-events: none;
}
```

### feedback.js — Behavioral Specification

The JS is a single vanilla IIFE: `(function () { 'use strict'; ... })();`

#### State Variables

```javascript
var requests = [];           // InputRequestDoc[] from list fetch
var currentRequest = null;   // InputRequestDoc currently in detail view
var localAnswers = {};       // question key → current local answer value
var pollTimer = null;        // setInterval handle for list polling
var debounceTimers = {};     // question key → setTimeout handle for text debounce
```

#### API Helpers

All API calls use `fetch`. GET endpoints pass params as query strings. POST endpoints send JSON body with `Content-Type: application/json`.

```javascript
// Canonical endpoint URLs (from toolNameToRoute — splits on first dash):
var API = {
  list:     '/api/input/request-list',
  show:     '/api/input/request-show',
  answer:   '/api/input/request-answer',
  complete: '/api/input/request-complete',
  reject:   '/api/input/request-reject'
};
```

#### HTML Escape

```javascript
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

#### Badge Mapping

```javascript
function badgeClass(status) {
  switch (status) {
    case 'pending':   return 'badge--warning';
    case 'completed': return 'badge--success';
    case 'rejected':  return 'badge--error';
    default:          return '';
  }
}
```

#### List View Behavior

1. **On page load**: fetch list with `GET /api/input/request-list?status=pending&limit=100`. Start polling.
2. **On status filter change**: clear current list, fetch with new status, restart polling timer.
3. **Polling**: every 12,000ms, re-fetch with the currently selected status filter. When the detail view is showing, clear the poll timer. When navigating back to list, restart the timer and re-fetch.
4. **Card rendering**: each card is a `.request-card` div with:
   - Request ID (`.request-id`)
   - Status badge (`<span class="badge badge--{class}">`)
   - Message text (truncated with ellipsis)
   - Rig ID and engine ID (`.request-ids`, dim text)
   - Answer progress count (e.g., "3/5 answered") (`.request-progress`, dim text)
   - Created timestamp (`.request-time`, dim text, formatted via `new Date(iso).toLocaleString()`)
5. **Empty state**: when the fetch returns an empty array, hide the card container and show `#list-empty` with text "No {status} requests." where `{status}` is the current filter value.
6. **Card click**: store the clicked request as `currentRequest`, initialize `localAnswers` from `currentRequest.answers`, hide `#list-view`, show `#detail-view`, stop polling, render the detail.

#### Answer Progress Count

For the list card and the action bar count indicator:

```javascript
function answerCount(request) {
  var total = Object.keys(request.questions).length;
  var answered = Object.keys(request.answers).length;
  return answered + '/' + total + ' answered';
}
```

#### Detail View Behavior

1. **Message display**: set `#detail-message` innerHTML to `esc(currentRequest.message)` or a fallback like the request ID if message is absent.
2. **Status banner**: when `currentRequest.status !== 'pending'`, insert a `.status-banner` div in `#detail-banner` with appropriate class (`.completed` or `.rejected`) and text like "This request has been completed" or "This request was rejected: {reason}".
3. **Question rendering**: iterate `Object.keys(currentRequest.questions)` and render each based on `type`:
   - Each question card has `data-question-key="{key}"` attribute.
   - Each option row has `data-option-key="{optionKey}"` attribute.
4. **Read-only mode**: when `currentRequest.status !== 'pending'`, add class `readonly` to all `.question-card` elements and render action buttons as disabled.

#### Choice Question Rendering

For a choice question with key `qKey` and spec `spec`:

```
<div class="question-card" data-question-key="{qKey}">
  <div class="question-header">
    <span class="question-label">{spec.label}</span>
  </div>
  <div class="options-list">
    {for each [optKey, optLabel] in spec.options:}
      <div class="option {selected if answer.selected === optKey}" data-option-key="{optKey}">
        <div class="option-radio"></div>
        <span class="option-text">{optLabel}</span>
      </div>
    {end for}
    {if spec.allowCustom:}
      <div class="option {selected if answer has 'custom'}" data-option-key="__custom__">
        <div class="option-radio"></div>
        <span class="option-text">Custom</span>
      </div>
      <div class="custom-row">
        <input type="text" placeholder="Enter custom answer..."
               data-question-key="{qKey}" data-custom-input="true"
               value="{answer.custom || ''}"
               {disabled if custom radio not selected} />
      </div>
    {end if}
  </div>
  {if spec.details:}
    <details>
      <summary>Details</summary>
      <div class="details-body">{esc(spec.details)}</div>
    </details>
  {end if}
</div>
```

**Interaction rules for choice:**
- When a regular option row is clicked: set `localAnswers[qKey] = { selected: optKey }`, POST `{id, question: qKey, select: optKey}`. Visually select that radio, deselect others (including custom radio). Keep custom text visible but disable the custom input.
- When the custom radio row is clicked: set `localAnswers[qKey] = { custom: currentCustomText }`, enable the custom input. If custom text is non-empty, POST `{id, question: qKey, custom: text}`.
- Custom input auto-save: on Enter keypress and on blur, if the custom radio is selected and text has changed, POST `{id, question: qKey, custom: text}`.

#### Boolean Question Rendering

For a boolean question with key `qKey` and spec `spec`:

```
<div class="question-card" data-question-key="{qKey}">
  <div class="boolean-item {checked|unchecked|''}" data-question-key="{qKey}">
    <div class="boolean-toggle">{checkmark|X|''}</div>
    <span class="boolean-label">{spec.label}</span>
  </div>
  {if spec.details:}
    <details>
      <summary>Details</summary>
      <div class="details-body">{esc(spec.details)}</div>
    </details>
  {end if}
</div>
```

Three visual states:
- **Unanswered** (no entry in answers): no class on `.boolean-item`, empty `.boolean-toggle`, label in normal `--text` color.
- **True**: class `checked`, toggle shows "✓" with green background.
- **False**: class `unchecked`, toggle shows "✗" with red border, label has strikethrough and dim color.

**Interaction**: clicking toggles the value. If currently unanswered or false → set to true. If currently true → set to false. POST `{id, question: qKey, value: "true"}` or `{id, question: qKey, value: "false"}`.

#### Text Question Rendering

```
<div class="question-card" data-question-key="{qKey}">
  <div class="text-question">
    <label>{spec.label}</label>
    <textarea data-question-key="{qKey}" data-text-input="true">{answer || ''}</textarea>
  </div>
  {if spec.details:}
    <details>
      <summary>Details</summary>
      <div class="details-body">{esc(spec.details)}</div>
    </details>
  {end if}
</div>
```

**Auto-save**: on `input` event, start/reset a debounce timer (e.g., 800ms). When the timer fires, if the value differs from `localAnswers[qKey]`, POST `{id, question: qKey, value: text}`.

#### Auto-Save POST Logic

```javascript
function saveAnswer(questionKey, body) {
  // Check if answer actually changed
  var prev = localAnswers[questionKey];
  var next = /* derive from body */;
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  localAnswers[questionKey] = next;
  updateAnswerCount();

  fetch(API.answer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  .then(function (r) {
    if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Save failed'); });
  })
  .catch(function (err) {
    showSaveError(questionKey, err.message);
  });
}
```

**Error display**: insert a `.save-error` element after the question card. Remove it after 4 seconds via `setTimeout`.

#### Answer Count and Complete Button State

After every auto-save, recount:
```javascript
function updateAnswerCount() {
  var total = Object.keys(currentRequest.questions).length;
  var answered = Object.keys(localAnswers).length;
  // Update the count text near the button
  // Enable/disable the Complete button
}
```

The Complete button is disabled (`btn.disabled = true`) when `answered < total`.

#### Complete Action

When the Complete button is clicked (only possible when enabled):
1. POST `{id: currentRequest.id}` to `/api/input/request-complete`.
2. On success: navigate back to list view immediately. Show a success toast (`#success-toast`) with text "Request completed" that auto-hides after 3 seconds.
3. On error: show an inline error (e.g., if server says unanswered questions remain — shouldn't happen with client-side gating, but handle defensively).

#### Reject Action

1. Click Reject button → show `.reject-prompt` inline (text input + confirm button). The Reject button text can change to "Cancel" to allow closing the prompt.
2. Patron optionally types a reason in the text input.
3. Click confirm → POST `{id: currentRequest.id, reason: text}` to `/api/input/request-reject`.
4. On success: navigate back to list view immediately. Show success toast "Request rejected".
5. On error: show inline error message.

#### Event Delegation

Attach a single click listener on `#questions-container` for:
- `.option[data-option-key]` clicks → handle choice selection
- `.boolean-item[data-question-key]` clicks → handle boolean toggle

Attach listeners on `#detail-view` for:
- `#back-btn` click → navigate back to list
- `.btn-complete` click → complete action
- `.btn-reject` click → toggle reject prompt
- `.reject-confirm` click → confirm rejection

Attach `input` listener on `#questions-container` for:
- `textarea[data-text-input]` → debounced text save
- `input[data-custom-input]` → (no immediate save; handled on Enter/blur)

Attach `blur` and `keydown` listeners for custom inputs:
- `blur` on `input[data-custom-input]` → save custom answer
- `keydown` (Enter) on `input[data-custom-input]` → save custom answer

#### Back Navigation

Clear `currentRequest`, clear `localAnswers`, clear `debounceTimers`, hide `#detail-view`, show `#list-view`, re-fetch list, restart poll timer.

### Non-obvious Touchpoints

- **`packages/plugins/spider/src/spider.ts` line ~1839**: The `pages` array is inside the `supportKit` object returned by the `spider()` factory function. It's a deeply nested property. The change is a single array element addition.
- **Oculus chrome injection**: The Oculus reads `index.html`, injects `/static/style.css` before `</head>` and the nav bar after `<body>`. The page's own `feedback.css` link must be in `<head>` and will appear before the injected stylesheet link in source order but after it in the injected output (Oculus prepends the stylesheet link). Since both use the same custom properties, order doesn't matter.

## Validation Checklist

- V1 [R1]: Confirm `packages/plugins/spider/src/spider.ts` contains `{ id: 'feedback', title: 'Feedback', dir: 'src/static/feedback' }` in the `pages` array.
- V2 [R2]: Confirm files exist at `packages/plugins/spider/src/static/feedback/index.html`, `feedback.css`, `feedback.js`.
- V3 [R3, R8, R10]: Run the guild, navigate to `/pages/feedback/`. Verify list cards show all required fields (ID, rig ID, engine ID, message, badge, timestamp, answer count). Verify badge colors match the mapping.
- V4 [R4, R7]: Change the `<select>` filter. Verify the list updates. Select a status with no requests and verify the empty-state message appears with the correct status name.
- V5 [R5, R9]: With a pending input request, verify the list auto-refreshes (check network tab for fetch every ~12s). Click a card, verify detail view appears without an additional fetch to `/api/input/request-show`. Verify polling stops while in detail view. Navigate back, verify polling resumes.
- V6 [R6]: Check network tab — list fetch URL includes `limit=100`.
- V7 [R11, R12, R16]: Create a test input request with choice questions (including one with `allowCustom: true`) with pre-filled answers. Verify questions render in insertion order, options show description text only, pre-filled radio is selected, custom radio option appears for allowCustom questions.
- V8 [R13, R16, R18]: Create a test request with boolean questions, some with pre-filled `true`/`false` and some unanswered. Verify: pre-filled true shows green check, pre-filled false shows red X + strikethrough, unanswered shows plain border with empty interior. Toggle a boolean and verify the POST body contains `value: "true"` or `value: "false"` (string, not native boolean).
- V9 [R14, R17]: Verify text questions render as textarea. Type text and wait — verify a POST fires after debounce. Verify the POST body contains `{id, question, value: text}`.
- V10 [R15]: Create a request with questions that have `details` fields. Verify `<details>/<summary>` elements render, and clicking "Details" toggles the expanded content.
- V11 [R17, R19, R21]: Click a choice option. Verify POST fires with `{select: key}`. Click the same option again — verify no duplicate POST. Select custom radio, type text, press Enter — verify POST with `{custom: text}`. Select a regular option — verify custom text remains visible but POST sends `{select: key}`.
- V12 [R20]: Disconnect network or stop the server. Try to save an answer. Verify an inline error message appears near the question and auto-dismisses.
- V13 [R22, R23]: With some questions unanswered, verify Complete button is disabled (opacity 0.4, cursor not-allowed). Answer all questions, verify button becomes enabled and count shows "N/N answered". Click Complete. Verify immediate navigation back to list and a success toast appears.
- V14 [R24, R31]: Click Reject on a request with partial answers. Verify inline text input appears. Type a reason, click confirm. Verify the request is rejected and the page returns to the list with a toast.
- V15 [R25]: Navigate to a completed or rejected request from the list (change filter). Verify status banner appears, action buttons are disabled, form controls are non-interactive.
- V16 [R26]: Inspect `feedback.css` — verify no fallback values in `var()` calls (no `var(--border, #3b4261)`, only `var(--border)`).
- V17 [R27]: Inspect `feedback.js` — verify it's wrapped in `(function () { 'use strict'; ... })()`, uses string concatenation for HTML, uses `data-question-key` and `data-option-key` attributes, has no import/require/module statements.
- V18 [R28]: Run `node --test packages/plugins/spider/src/static/feedback/feedback-ui.test.ts`. Verify all source-text regression tests pass (IIFE, question-type branching, POST body shapes, badge mapping, data-* attributes).

## Test Cases

### feedback-ui.test.ts — Source-text regression tests

Read `feedback.js` as a string. Assert:

1. **IIFE wrapper**: source matches `/^\(function\s*\(\)\s*\{\s*'use strict';/` (starts with IIFE + strict mode).
2. **Question-type branching**: source contains string literals for all three question types — match patterns like `type === 'choice'` or `=== 'choice'`, `=== 'boolean'`, `=== 'text'`.
3. **Choice answer POST body**: source contains pattern for `select:` key in a POST body construction (e.g., `select:` appearing in a JSON body context).
4. **Custom answer POST body**: source contains pattern for `custom:` key in a POST body construction.
5. **Boolean answer POST body**: source contains string `"true"` and `"false"` (quoted strings being sent as value — verifying strings not native booleans). Match a pattern like `value:.*"true"` or `value:.*'true'`.
6. **Badge class mapping**: source contains `badge--warning`, `badge--success`, `badge--error`.
7. **Event delegation attributes**: source contains `data-question-key` and `data-option-key`.
8. **API endpoint URLs**: source contains `/api/input/request-list`, `/api/input/request-answer`, `/api/input/request-complete`, `/api/input/request-reject` (verifying correct URLs, not the brief's incorrect ones).
9. **Polling interval**: source contains `12000` (12 second polling interval).
10. **Custom radio option**: source contains `__custom__` (the sentinel key for the custom radio option).

### Manual/integration test scenarios

11. **Happy path — full review cycle**: Create a pending input request with 2 choice questions, 1 boolean, 1 text. Navigate to Feedback page. Verify cards appear. Click into the request. Answer all questions. Verify Complete button enables. Complete. Verify return to list, toast appears, request now shows as completed when filter is changed.
12. **Rejection flow**: Open a pending request. Answer 1 of 3 questions. Click Reject. Enter reason. Confirm. Verify request is rejected with the reason stored.
13. **Pre-filled answers**: Create a request where the decision-review engine has pre-populated choice selections and boolean values. Open detail view. Verify all pre-filled controls render in their correct selected/checked states.
14. **Empty list**: Filter by "rejected" when no rejected requests exist. Verify "No rejected requests." message appears.
15. **Custom choice — full cycle**: Open a choice question with `allowCustom: true`. Select a regular option — verify save. Click the Custom radio — verify custom input enables. Type a custom answer, press Enter — verify save with `{custom: text}`. Select a regular option again — verify custom text remains visible, save sends `{select: key}`.
16. **Indeterminate boolean**: Open a request with an unanswered boolean. Verify toggle shows plain border, no icon. Click once — verify turns green/checked (true). Click again — verify turns red/X (false). Click again — cycles back to true (booleans toggle between true and false once initially answered, not back to indeterminate).
17. **Non-pending detail view**: Change filter to "completed". Click a completed request. Verify status banner ("This request has been completed"), disabled buttons, and non-interactive form controls.
18. **Polling respects filter**: Switch to "completed" filter. Wait >12s. Verify the poll fetch uses `?status=completed`, not `?status=pending`.
19. **Error resilience**: Stop the server. Try clicking options in the detail view. Verify inline error messages appear per question and auto-dismiss. Restart server. Verify subsequent saves succeed.

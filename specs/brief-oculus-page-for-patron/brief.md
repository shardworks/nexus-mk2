# Brief: Oculus Page for Patron Feedback (Input Requests)

## Motivation

Today, responding to patron input requests (the mechanism by which blocked engines solicit feedback from the patron) requires CLI tools: `input-request-list`, `input-request-show`, `input-request-answer`, `input-request-complete`, `input-request-reject`. This works, but is clunky — the patron must juggle tool calls, remember question keys, and compose answers in CLI syntax. The Astrolabe's decision-review engine is the primary consumer of this system, turning planning decisions and scope items into input requests that block the pipeline until the patron responds.

The goal is a dedicated Oculus page — owned by the Spider, since input requests are a Spider-level concept — that gives the patron a visual, interactive UI for reviewing and responding to input requests. This page should feel like clean, dark, monospaced, with interactive decision cards and scope toggles that make patron review a pleasant, focused experience.

## What This Page Does

The page surfaces all pending input requests, lets the patron drill into one, answer its questions interactively, and submit (complete) or reject it. The page is the visual equivalent of the existing `input-request-*` tool suite.

### Views

**List view** — shows input requests, defaulting to `pending` status. Each card shows:
- Request ID
- Associated rig ID and engine ID
- The `message` field (human-readable summary from the engine)
- Status badge
- Created timestamp

The patron can filter by status (pending / completed / rejected) and click a card to drill in.

**Detail view** — shows a single input request with its full question set rendered as interactive form controls. The patron answers questions, then completes or rejects the request.

### Question Rendering

Each question type renders as an appropriate interactive control:

- **Choice questions** — render as a radio-button list of options. Each option is a clickable row with a radio indicator, option key, and description text. If `allowCustom` is true, include a text input below the options for a freeform override. If the question has a `details` field, render it as expandable context.

- **Boolean questions** — render as a toggle checkbox row. A clickable row with a checkbox indicator and the question label. If it has `details`, show as expandable context.

- **Text questions** — render as a textarea input with the question label above it. If it has `details`, show as expandable context.

Pre-filled answers (engines may pre-populate recommendations, as the decision-review engine does) should be reflected in the initial render state — selected radio buttons, checked boxes, pre-filled text.

### Actions

- **Complete** — submits the request (calls `input-request-complete` via the API). Validates all questions are answered client-side before enabling the button. On success, show a success state and navigate back to the list.
- **Reject** — rejects the request with an optional reason (calls `input-request-reject`). Should prompt for a rejection reason via an inline text input.

### API Interaction

All data access goes through the existing tool→REST endpoints that the Oculus auto-maps from Spider's tools:

| Action | Tool | REST Endpoint | Method |
|--------|------|---------------|--------|
| List requests | `input-request-list` | `GET /api/input-request/list` | GET |
| Show request | `input-request-show` | `GET /api/input-request/show` | GET |
| Answer question | `input-request-answer` | `POST /api/input-request/answer` | POST |
| Complete request | `input-request-complete` | `POST /api/input-request/complete` | POST |
| Reject request | `input-request-reject` | `POST /api/input-request/reject` | POST |

No new API routes are needed — the page is a pure frontend consumer of existing tools.

### Page Contribution

The page is contributed by the Spider via its existing `supportKit.pages` array (alongside the existing Spider page). It should be a new static directory (e.g., `src/static/feedback/`) with its own `index.html`, CSS, and JS files.

```typescript
// In spider.ts supportKit.pages:
pages: [
  { id: 'spider', title: 'Spider', dir: 'src/static' },
  { id: 'feedback', title: 'Feedback', dir: 'src/static/feedback' },
],
```

## UX & Style Guidance

This page must visually match the existing Oculus ecosystem: Tokyo Night palette, monospaced typography, card-based layout. The Plan Workshop is the gold standard for how interactive patron-review UI should feel. Below is specific guidance.

### General Layout

Same structure as the Spider page: a `<main>` with 24px padding, page title as `<h1>`, content below. The Oculus chrome (nav bar, shared stylesheet) is injected automatically.

Use the shared Oculus CSS custom properties — **do not redefine them** in the page stylesheet:

```css
/* These are already available via the injected /static/style.css */
var(--bg)         /* #1a1b26 — page background */
var(--surface)    /* #24283b — card/panel background */
var(--surface2)   /* #2f3549 — hover/selected states */
var(--border)     /* #3b4261 — borders */
var(--text)       /* #c0caf5 — body text */
var(--text-dim)   /* #565f89 — secondary/muted text */
var(--text-bright)/* #e0e6ff — headings, emphasis */
var(--green)      /* #9ece6a — success, selected, included */
var(--red)        /* #f7768e — error, excluded, rejected */
var(--yellow)     /* #e0af68 — warning, pending */
var(--cyan)       /* #7dcfff — links, active states, focus rings */
var(--magenta)    /* #bb9af7 — running/in-progress indicators */
var(--blue)       /* #7aa2f7 — primary action buttons */
var(--font-mono)  /* "SF Mono", "Fira Code", "JetBrains Mono", monospace */
```

### List View Cards

Follow the Plan Workshop's spec-card pattern — horizontal flex cards with key metadata:

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

Status badges should use the shared `.badge` classes from the Oculus stylesheet. Pending gets `badge--warning` (yellow), completed gets `badge--success` (green), rejected gets `badge--error` (red).

### Choice Questions (Decision Cards)

This is the most important UI element — it should closely match the Plan Workshop's decision rendering. Each decision is a card with:

1. **Header** — question label in `--text-bright`, with any scope/context metadata as small badges.
2. **Options list** — clickable rows with radio-button indicators.
3. **Custom input** — text field below options (when `allowCustom` is true).
4. **Details toggle** — expandable context section.

Follow these Plan Workshop patterns exactly:

```css
/* Decision card container */
.question-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}

/* Question label in the header */
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

/* Clickable option rows */
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

/* Radio indicator — circular, border-based */
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

/* Custom override input */
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
}
.custom-row input:focus { border-color: var(--cyan); }

/* Expandable details/context */
.details-toggle {
  font-size: 11px;
  color: var(--text-dim);
  cursor: pointer;
  padding: 4px 16px 12px;
  user-select: none;
}
.details-toggle:hover { color: var(--cyan); }
.details-content {
  display: none;
  padding: 12px 16px;
  font-size: 12px;
  border-top: 1px solid var(--border);
  margin: 0 16px 12px;
}
.details-content.visible { display: block; }
```

### Boolean Questions (Scope Toggles)

Match the Plan Workshop's scope-item pattern — clickable rows with checkbox indicators:

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

### Text Questions

Simple label + textarea with consistent styling:

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

### Action Buttons

Use the established button patterns — same as Plan Workshop and Spider page:

```css
/* Primary action (Complete) — green */
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

/* Reject — subdued, red accent */
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

/* Back navigation */
.back-link {
  color: var(--text-dim);
  font-size: 12px;
  margin-bottom: 8px;
  display: inline-block;
}
```

### Implementation Notes

- **Vanilla JS, no framework.** Follow the Spider page's pattern: an IIFE, string-based HTML rendering, event delegation. No modules, no imports, no build step.
- **Auto-save answers.** Each answer should POST to the API immediately on interaction (option click, toggle, text blur) — don't require the patron to manually save individual answers. The Complete button is the final submission.
- **Client-side validation.** The Complete button should be disabled until all questions have answers. Show a count indicator (e.g., "3/5 answered") near the button.
- **Polling for new requests.** On the list view, poll periodically (every 10–15s) for new pending requests. This matches the Spider's existing approach for session streaming.
- **Message display.** The request's `message` field (set by the engine, e.g., "Planning review for: Implement Clerk apparatus (codex: nexus)") should display prominently at the top of the detail view, providing context for what the patron is reviewing.

# Observations

## Brief/Code Discrepancy: API URL Table

The brief's API interaction table lists REST endpoints that don't match how `toolNameToRoute` actually works:

| Brief says | Actual (from code) |
|---|---|
| `GET /api/input-request/list` | `GET /api/input/request-list` |
| `GET /api/input-request/show` | `GET /api/input/request-show` |
| `POST /api/input-request/answer` | `POST /api/input/request-answer` |
| `POST /api/input-request/complete` | `POST /api/input/request-complete` |
| `POST /api/input-request/reject` | `POST /api/input/request-reject` |

The `toolNameToRoute` function splits on the **first** dash only: `'input-request-list'.indexOf('-')` = 5, so it becomes `/api/input/request-list`. This is verified by the spider page using `/api/rig/list` for the `rig-list` tool. Using the brief's URLs would produce 404s.

**Addressed in**: D3 (selected option b — use actual URLs from code).

## "Plan Workshop" Does Not Exist

The brief references the "Plan Workshop" as the gold standard for interactive patron-review UI in multiple places. This does not exist in the codebase. The brief helpfully includes the full CSS specifications inline, so the implementer doesn't need a reference implementation — but the Plan Workshop reference is misleading.

## Spider CSS Fallback Convention

The existing `spider.css` uses fallback values in custom properties: `var(--border, #333)`. The shared `style.css` defines `--border: #3b4261`. The fallback values in spider.css don't match the actual values from style.css (`#333` vs `#3b4261`). This means if style.css failed to load, spider.css would render with different colors than intended. The feedback page should not replicate this pattern (decided in D32).

## Input Request Answer Tool Value Type

The `input-request-answer` tool defines the `value` param as `z.string()`. This means boolean answers must be sent as `"true"` / `"false"` strings, not native JSON booleans. The `validateAnswer` function handles the coercion (`'true' → true`, `'false' → false`). This is a minor API ergonomics issue — a future improvement could accept native booleans in the Zod schema with a union type.

## No Pagination for Input Requests

The `input-request-list` tool supports `limit` and `offset` parameters, but neither the existing CLI workflow nor this new UI page implements pagination. For typical usage (a handful of pending requests), this is fine. If a guild accumulates hundreds of completed requests, the list view could become slow. A future commission could add pagination or date-range filtering.

## Question Key Ordering Fragility

The `InputRequestDoc.questions` field is `Record<string, QuestionSpec>`. JavaScript preserves insertion order for string keys, so iteration order matches creation order from the engine. However, if a request were round-tripped through JSON serialization/deserialization in a context that doesn't preserve order (unlikely in JS, possible in other languages), the order could change. The decision-review engine creates questions in a deliberate order (decisions first, then scope items), and the UI relies on this ordering. This is not a bug to fix now, but worth noting.

## Stacks Book Indexes Available

The `input-requests` book has indexes on: `status`, `rigId`, `engineId`, `createdAt`, and a compound index `[rigId, engineId, status]`. The list tool uses `status` + `createdAt desc`. This is well-indexed for the page's primary query pattern (filter by status, order by createdAt).

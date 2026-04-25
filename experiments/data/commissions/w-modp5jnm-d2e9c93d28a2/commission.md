Under D3's recommendation, `clockworks/event_dispatches` is auto-wired. Today the book is empty (no writer yet). Once task 4 (runner) lands, every dispatch will emit a `book.clockworks.event_dispatches.created` event with the full `EventDispatchDoc` as payload. Standing-order authors wanting to react to dispatch failures (e.g. retry, alert) will need to know that payload shape.

No action for this commission. File an observation so task 4's primer surfaces the schema in the event catalog and confirms D3's carve-out intent (task 4 may want to reconsider whether dispatch writes should be visible given the runner's own observability path via `event_dispatches.status === 'error'`).

Files to touch when task 4 ships:
- `docs/reference/event-catalog.md` — add `book.clockworks.event_dispatches.*` entries with payload schema.
- `packages/plugins/clockworks/src/types.ts` — `EventDispatchDoc` already defines the shape; ensure it's externally importable if standing-order authors want to type their handlers.
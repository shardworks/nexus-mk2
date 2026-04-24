# Stacks CDC auto-wiring for book events

## Intent

Make every book mutation across the guild observable as a Clockworks event automatically, without each book's owning plugin needing to emit anything. At Clockworks apparatus start, walk every plugin's declared books and register a Stacks `watch()` handler per book that re-emits book change notifications as `book.<ownerId>.<bookName>.<type>` events into the Clockworks stream. Standing orders can then bind directly to book changes — `{ on: "book.nexus-ledger.writs.updated", "run": "audit-writ-changes" }`.

## Motivation

The architecture doc describes this as the "Stacks auto-wiring" mechanism (the Book change events section under Events). Without it, observing a book change from a standing order requires each plugin to manually `signal()` on every write — clunky, inconsistent, and guaranteed to be forgotten. Auto-wiring makes books *observable by default*, matching the principle the architecture doc already specifies.

This commission is small but high-leverage — it turns every book in the system into an event source, which the Reckoner, Laboratory, overseer, and many other downstream apparatus will depend on.

## Non-negotiable decisions

### Register one CDC watcher per declared book at apparatus start

At Clockworks apparatus `start()`, the apparatus iterates over every plugin in the startup context, reads that plugin's declared books, and registers a Stacks `watch()` handler for each. The handler's job is to re-emit the change notification as a Clockworks event.

Matches the architecture doc's reference sketch:

```typescript
// in clockworks apparatus start()
const stacks = ctx.apparatus<StacksApi>('stacks')
for (const plugin of ctx.plugins) {
  const bookNames = Object.keys(plugin.books ?? {})
  for (const bookName of bookNames) {
    stacks.watch(plugin.id, bookName, async (event) => {
      await clockworksApi.emit(`book.${event.ownerId}.${event.book}.${event.type}`, event, 'framework')
    }, { failOnError: false })
  }
}
```

### Event name shape: `book.<ownerId>.<book>.<type>`

Three event types per book:

- `book.<ownerId>.<book>.created`
- `book.<ownerId>.<book>.updated`
- `book.<ownerId>.<book>.deleted`

The `type` suffix comes from whatever Stacks emits for create/update/delete; if Stacks uses different verbs, adopt them as-is.

### Payload is the full CDC event

The emitted event's `payload` is the CDC event object Stacks delivers to the watcher — owner id, book name, type, row id, row data (or diff), timestamp. Whatever Stacks passes, that's the payload.

### Emitter is `framework`

Same as other framework-emitted events. These are not plugin-author signals; they are framework-observed book mutations.

### `failOnError: false` on the watcher registration

A Clockworks emission failure must not roll back the book write that triggered it. Per the architecture doc's explicit note: *"clockworks failure must not block writes"*. The watcher registers with `failOnError: false` so emit-errors are logged but don't propagate.

### Watcher registration order does not matter

Book change events are independent of each other and of other event types. No ordering guarantees across books.

## Out of scope

- **Filtering which books emit events.** Every declared book from every installed plugin gets a watcher. No allow-list, no deny-list, no per-book opt-out in this commission. If a plugin wants a book's changes to be silent, that's a future feature.
- **Debouncing or coalescing book events.** Every single change emits.
- **Diff payload shape decisions.** Use whatever Stacks provides.
- **Book-change events for books created after apparatus start.** If a plugin is installed dynamically post-start (unusual but possible), its books won't be watched until the next apparatus restart. Addressing hot-plug is a later concern.
- **Book-change standing orders.** The apparatus emits; users can subscribe; but this commission ships no default standing orders for book events.

## Behavioral cases the design depends on

- A plugin `foo` declares a book `bar`; after apparatus start, writing a row to `foo/bar` emits a `book.foo.bar.created` event with emitter `framework`.
- Updating a row emits `book.foo.bar.updated`. Deleting emits `book.foo.bar.deleted`.
- A standing order `{ on: "book.nexus-ledger.writs.updated", "run": "audit-writ-changes" }` fires on every writ update.
- Stacks CDC failure (e.g., handler throws inside `watch()`) does not roll back the triggering write. The failure is logged but the transaction commits.
- A guild with N plugins and M total books gets M watchers registered at start.

## References

- `docs/architecture/clockworks.md` — Book change events (Stacks auto-wiring) section
- `docs/architecture/apparatus/stacks.md` — the Stacks CDC API
- `c-mo1mql8a` — Clockworks MVP timer apparatus

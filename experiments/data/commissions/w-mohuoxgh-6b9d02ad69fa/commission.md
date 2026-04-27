# Create `clockworks-stacks-signals` bridge plugin

## Intent
Create a new lightweight plugin that watches Stacks CDC and emits `book.<owner>.<book>.<verb>` events through Clockworks. The plugin replaces today's inline CDC auto-wiring code in Clockworks `start()`; that code is removed atomically in this commission. Establishes the "observer-translator" plugin pattern for any future siblings that translate substrate observations into events.

## Motivation
Today Clockworks does CDC auto-wiring inline during its own `start()`: walks `ctx.kits('books')`, registers a Phase-2 watcher per book, formats `book.<owner>.<book>.<verb>` events, and emits them. This conflates Clockworks' messaging concern (declare/emit/dispatch/persist event signals) with the substrate-observation concern (translate CDC into event vocabulary).

Splitting them produces:
- **Cleaner Clockworks vocabulary.** Clockworks declares only its intrinsic events (`clockworks.*`) and the writ-lifecycle (`writ.<type>.<status>`); it stops claiming to know about every other plugin's books.
- **Optional CDC-as-events.** Guilds that don't want the CDC stream materialized into events skip the bridge plugin install.
- **Pattern leverage** for any future observer-translator plugins (HTTP request observer, file system observer, etc.).

## Non-negotiable decisions

### New plugin: `clockworks-stacks-signals`
Plugin id: `clockworks-stacks-signals`. Lives at `packages/plugins/clockworks-stacks-signals/`. Naming is deliberate — names the relationship precisely (a Clockworks extension that sends signals for Stacks events) and generalizes for future siblings (`clockworks-<source>-signals`).

### Plugin dependencies
`requires: ['stacks', 'clockworks']`. Stacks for CDC subscription via `watch()`; Clockworks for `emit()`.

### Events kit declaration via function form
`supportKit.events` is a function that walks `ctx.kits('books')`, enumerates `book.<ownerId>.<bookName>.<verb>` for every contributed book × the three verbs `created`/`updated`/`deleted`, and returns the flat declared map. The carve-out — skip `(ownerId === 'clockworks', bookName === 'events')` — matches today's auto-wiring behavior; this is the only deliberate exclusion. Rationale for the carve-out: prevents self-feedback; the events book observing itself would emit `book.clockworks.events.created` for every emit, polluting the stream with its own announcements.

### Auto-wiring behavior preserved
The plugin's `start()` registers per-book Phase-2 (`failOnError: false`) watchers via `stacks.watch()`, exactly matching today's behavior. Each watcher composes the event name from the delivered `ChangeEvent` (`book.<ownerId>.<book>.<verb>`) and emits via `clockworks.emit()` with `emitter: 'framework'`. Payload is the unchanged `ChangeEvent`. No try/catch wrapping at the watcher level — Stacks' Phase-2 error path already logs.

### Domain naming preserved
Events use `book.*` (domain-named, not plugin-id-prefixed) per the redesign's rule that cross-plugin domains take the domain noun. The bridge plugin emits in `book.*` because the events are about books, not about the bridge plugin itself.

### Remove auto-wiring from Clockworks (atomic)
In the same commission, delete the CDC auto-wiring code block from Clockworks `start()` and any supporting imports/constants that are no longer used after the relocation. The relocation and the removal land together so there is no gap state where CDC events stop flowing.

### Default install
Add the plugin to the default guild template's plugin list so freshly-bootstrapped guilds get the CDC stream out of the box. Existing guilds' `guild.json` does not auto-acquire the plugin — operators add it deliberately if they want CDC events.

## Behavioral cases the design depends on
- Installing the plugin into a guild produces `book.<owner>.<book>.<verb>` events for every plugin-contributed book on the same primary writes that produced them today, with the same payload shape.
- Uninstalling (or not installing) the plugin in a guild stops the CDC stream entirely; no `book.*` events are emitted; standing orders subscribed to `book.*` see nothing fire. Other Clockworks features (intrinsic events, writ-lifecycle, scheduled standing orders) keep working unchanged.
- The carve-out for `clockworks/events` is preserved: no `book.clockworks.events.<verb>` events are emitted (preventing self-feedback).
- An anima signal tool attempt to emit a `book.*` name fails (framework-owned).
- A guild starting up with the plugin installed but no book-kit contributions from any other plugin emits no `book.*` events (function form returns an empty map).

## Documentation
Add an apparatus doc for the new plugin (`apparatus/clockworks-stacks-signals.md` or similar, matching existing conventions). Refresh `event-catalog.md` to attribute `book.*` events to the new plugin instead of Clockworks.

## Out of scope
- The events-kit infrastructure (C1) and Clockworks' own surface migration (C2).
- Future observer-translator plugins beyond this one.
- Selective subscription (only watch some books) — today's behavior is all-books-with-carve-out, and this commission preserves that exactly.
- Migration of existing `book.*` rows in operating guilds — old rows stay; new rows have the same name (no rename involved here, only relocation of the emit site).

## References
- Design root: click `c-mog0glxx`.
- Depends on C1 (kit infrastructure) and C2 (Clockworks declaration shape) being landed (declared via `spider.follows`).
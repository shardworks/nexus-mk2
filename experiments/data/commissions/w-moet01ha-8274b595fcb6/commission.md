Lifted from the planning run of "Reconcile event catalog (event-catalog.md) against clockworks.md event list" (w-modgu1iq-630c3ba6dc69). Each numbered observation below is a draft mandate ready for curator promotion.

1. Reserve `book.` namespace in RESERVED_EVENT_NAMESPACES to prevent anima spoofing of CDC events
2. Reconcile `apparatus/clerk.md` lifecycle events table against shipped writ-lifecycle-observer
3. Remove obsolete 'Future: Event Signalling' section from `apparatus/animator.md`
4. Update `core-api.md` Events section to reflect that `signalEvent`/`isFrameworkEvent`/`validateCustomEvent` moved to ClockworksApi
5. Refresh `reference/schema.md` events / event_dispatches rows against shipped EventDoc / EventDispatchDoc
6. Collapse the `commission.sealed` / `commission.completed` duplicate emission to one canonical name
7. Rename `tool.installed` / `tool.removed` events to `plugin.installed` / `plugin.removed` (or document the intentional asymmetry)
8. Audit `guild.json` standing-order examples in fixtures and codex content for dropped `summon:` / `brief:` sugar

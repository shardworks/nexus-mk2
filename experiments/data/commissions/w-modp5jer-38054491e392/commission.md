`docs/architecture/clockworks.md:79-90` sketches the auto-wiring mechanism using `ctx.plugins` and a 2-arg `emit(name, payload)`:

```typescript
for (const plugin of ctx.plugins) {
  const bookNames = Object.keys(plugin.books ?? {})
  for (const bookName of bookNames) {
    stacks.watch(plugin.id, bookName, async (event) => {
      await clockworksApi.emit(`book.${event.ownerId}.${event.book}.${event.type}`, event)
    }, { failOnError: false })
  }
}
```

Two mismatches with the shipped code:

1. `StartupContext.plugins` doesn't exist (`packages/framework/core/src/plugin.ts` — ctx has only `on` and `kits`). Stacks' own `reconcileSchemas()` iterates `ctx.kits('books')`; the Clockworks auto-wiring should match.
2. `ClockworksApi.emit()` is 3-arg (`name, payload, emitter`) per `packages/plugins/clockworks/src/types.ts:187`. The sketch's 2-arg form is stale.

Additionally the inline code uses `${event.type}` (present tense, producing `.create/.update/.delete`) while the surrounding prose and the operator example use past tense (`.created/.updated/.deleted`). Pin the tense in the refresh so downstream readers aren't misled.

Files:
- `docs/architecture/clockworks.md:79-90` — sketch.
- `docs/architecture/clockworks.md:75-97` — surrounding 'Book change events (Stacks auto-wiring)' section.

Low-risk doc fix; land whenever the Clockworks doc is next refreshed (the broader refresh is tracked by task 12 / `w-modf69vg`).
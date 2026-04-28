`docs/architecture/clockworks.md` lines 57–67 contains a code sketch for the CDC auto-wiring loop:

```typescript
for (const plugin of ctx.plugins) {
  const bookNames = Object.keys(plugin.books ?? {})
  for (const bookName of bookNames) {
    stacks.watch(plugin.id, bookName, ...)
  }
}
```

The real implementation walks `ctx.kits('books')` and reads from `entry.value` / `entry.pluginId`. There is no `ctx.plugins` field in `StartupContext` (`packages/framework/core/src/plugin.ts`). This is a pre-existing inaccuracy unrelated to this commission, but lands in the same doc that the C3 commission rewrites. Worth catching while the doc is open.
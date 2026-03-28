# Design: Book Watchers

Status: **Draft — open questions pending**

---

## Open Questions

> **Q1 — `onUpdate` receives `prev`?**
> Cascades need it (`if (doc.status === 'completed' && prev?.status !== 'completed')`). Cost: one extra `SELECT` per `put()` call *when at least one `onUpdate` watcher is registered for that book*. Acceptable?
>
> Sub-question: if no `onUpdate` watchers are registered, skip the read entirely (lazy). If only `onCreate` watchers exist, still need the read to distinguish create vs update. Should we skip the pre-read when no watchers distinguish create/update?

> **Q2 — `onDelete` receives the document or just the `id`?**
> For cascades (e.g. delete children when parent is deleted) you want the doc. Cost: one `SELECT` before every `delete()` call *when `onDelete` watchers are registered*. If clockworks just needs to emit an event with the id, it doesn't need the doc. Is passing the full doc worth the read cost, or pass `id` only?

> **Q3 — Hook error semantics?**
> If a watcher throws, does the `put()` / `delete()` reject (write fails, callers see the error), or does it log-and-continue (write succeeds, watcher error is swallowed)?
>
> - **Fail the write:** safer for cascades — a broken cascade is worse than a failed write. But a buggy clockworks watcher could start blocking all writes to a book.
> - **Log and continue:** safer for infrastructure watchers (clockworks) — a broken event emitter shouldn't break core operations. But silent failures in cascades are dangerous.
>
> Possible middle ground: a per-watcher `onError` option, or a per-registration flag `{ failOnError: boolean }`.

> **Q4 — Watcher registration order / ordering guarantees?**
> Multiple rigs may register watchers on the same book (e.g. clockworks AND nexus-ledger both watch `nexus-ledger/writs`). Watchers are fired in registration order (rig load order = order in `config.rigs`). Is that sufficient, or do we need explicit priority/ordering?

> **Q5 — Declarative `watches` on `Rig` — defer to follow-up?**
> With `onInitialize` available, declarative `watches` is syntactic sugar. Deferring keeps this commission scoped. Recommend deferring unless you see an immediate authoring need.

> **Q6 — Self-watching (own rig watches own book)?**
> The watcher mechanism naturally supports a rig registering watchers on its own books (nexus-ledger watching `nexus-ledger/writs`). No special handling needed — `ctx.watchBook('nexus-ledger', 'writs', ...)` works the same way. Confirming this is intentional and desired (vs. only allowing cross-rig watching).

---

## Design

### Summary

Two complementary mechanisms feeding a single watcher dispatch table held by mainspring:

1. **`onInitialize` hook on `Rig`** — imperative registration at startup. Receives a `RigInitContext` with access to all loaded rigs and a `watchBook()` registration method.
2. **Declarative `watches` on `Rig`** — static, co-located with rig schema. *(Deferred — see Q5.)*

Watchers fire synchronously inside `put()` / `delete()` — the write completes, then hooks are awaited in order. This means:
- Cascades happen in the same logical operation (synchronous from the caller's perspective)
- Clockworks event emission is "synchronous" in the sense that the event is written to the queue in the same call — the daemon processes it later

### Use Case: Clockworks Auto-Wiring

Clockworks rig's `onInitialize` iterates all loaded rigs, discovers all declared books, and registers a generic event-emitting watcher on each. New rigs are auto-wired at startup without clockworks needing prior knowledge of them.

```typescript
// In nexus-clockworks rig export
export default {
  onInitialize: async (ctx: RigInitContext) => {
    for (const rig of ctx.rigs) {
      for (const bookName of Object.keys(rig.instance.books ?? {})) {
        ctx.watchBook(rig.id, bookName, {
          onCreate: async (doc, rigCtx) => {
            await emitEvent(`book.${rig.id}.${bookName}.created`, { doc }, rigCtx);
          },
          onUpdate: async (doc, prev, rigCtx) => {
            await emitEvent(`book.${rig.id}.${bookName}.updated`, { doc, prev }, rigCtx);
          },
          onDelete: async (id, rigCtx) => {
            await emitEvent(`book.${rig.id}.${bookName}.deleted`, { id }, rigCtx);
          },
        });
      }
    }
  },
} satisfies Rig;
```

### Use Case: Cascading Writ Status Changes

Nexus-ledger watches its own writs book and cascades status transitions to child writs.

```typescript
// In nexus-ledger rig export
export default {
  tools: [...],
  books: {
    writs: { indexes: ['status', 'createdAt', 'parent.id'] },
  },
  onInitialize: async (ctx: RigInitContext) => {
    ctx.watchBook('nexus-ledger', 'writs', {
      onUpdate: async (doc, prev, rigCtx) => {
        const writ = doc as Writ;
        const prevWrit = prev as Writ;
        if (writ.status === 'cancelled' && prevWrit.status !== 'cancelled') {
          const writs = rigCtx.book<Writ>('writs');
          const children = await writs.find({ where: { 'parent.id': writ.id } });
          for (const child of children) {
            if (child.status !== 'completed' && child.status !== 'cancelled') {
              await writs.put({ ...child, status: 'cancelled' });
            }
          }
        }
      },
    });
  },
} satisfies Rig;
```

---

## New Types

### `BookWatcher` (core)

```typescript
/**
 * A set of lifecycle hooks for watching a book's mutations.
 *
 * Registered via `RigInitContext.watchBook()` during `onInitialize`.
 * Hooks fire synchronously inside `put()` / `delete()` — after the write
 * succeeds, before returning to the caller.
 *
 * `ctx` is scoped to the observer rig (the rig that registered the watcher),
 * not the book's owner. Observers can write to their own books, emit events, etc.
 */
export interface BookWatcher {
  onCreate?: (doc: unknown, ctx: RigContext) => Promise<void> | void;
  onUpdate?: (doc: unknown, prev: unknown, ctx: RigContext) => Promise<void> | void;
  onDelete?: (id: string, ctx: RigContext) => Promise<void> | void;  // or (doc: unknown, ...) — see Q2
}
```

### `RigInitContext` (core)

```typescript
/**
 * Context passed to a rig's `onInitialize` hook.
 *
 * Available once all rigs are loaded and books are reconciled. Allows a rig
 * to inspect the full guild and register book watchers imperatively.
 */
export interface RigInitContext {
  /** Absolute path to the guild root. */
  home: string;

  /**
   * All loaded rigs, including mainspring's built-ins.
   * Use to iterate books across the guild for dynamic watcher registration.
   */
  rigs: LoadedRig[];

  /**
   * Register a watcher on a book. Watchers fire after every `put()` or
   * `delete()` on the named book, in registration order.
   *
   * `rigId` is the book owner's rig id (e.g. 'nexus-ledger').
   * `bookName` is the book's declared name (e.g. 'writs').
   */
  watchBook(rigId: string, bookName: string, watcher: BookWatcher): void;

  /**
   * A RigContext scoped to the registering rig.
   * Available for any setup work needed during initialization.
   */
  rigContext: RigContext;
}
```

### `onInitialize` on `Rig` (core)

```typescript
export interface Rig {
  tools?: ToolDefinition[];
  books?: Record<string, BookOptions>;

  /**
   * Optional lifecycle hook called after all rigs are loaded and books
   * are reconciled, before the mainspring becomes available for use.
   *
   * Use this to register book watchers imperatively — inspecting the full
   * loaded rig set and wiring up cross-rig or own-rig subscriptions.
   *
   * @example
   *   onInitialize: async (ctx) => {
   *     ctx.watchBook('nexus-ledger', 'writs', { onCreate: ... });
   *   }
   */
  onInitialize?: (ctx: RigInitContext) => Promise<void> | void;
}
```

---

## Implementation Notes

### Mainspring init sequence (changed)

Current: `loadAllRigs()` → `reconcileBooks()` → return rigs

New:
1. `loadAllRigs()` — dynamic import all rig modules
2. `reconcileBooks()` — create/migrate SQLite tables
3. Build empty watcher registry (a `Map<string, BookWatcherEntry[]>`)
4. Run `onInitialize` for each rig that declares one, passing `RigInitContext`
   - `watchBook()` in `RigInitContext` writes into the registry
5. Return rigs (registry is now populated and referenced by all future `BookStore` instances)

### Watcher registry

```typescript
interface BookWatcherEntry {
  observerRigId: string;   // for constructing the right RigContext when firing
  watcher: BookWatcher;
}

type WatcherRegistry = Map<string, BookWatcherEntry[]>;
// key: `${ownerRigId}/${bookName}`
```

### BookStore changes

`BookStore` gains access to the registry (passed via constructor or closure in `createRigContext`). Mutation methods change:

**`put(content)`:**
1. If any watchers have `onCreate` or `onUpdate`: `SELECT id WHERE id = ?` to check existence → determines which hook to fire
2. Execute upsert (existing behavior)
3. Look up registry for `(ownerRigId, bookName)`
4. For each watcher entry: construct observer's `RigContext`, call hook

**`delete(id)`:**
1. If any watchers have `onDelete` and need the doc (see Q2): `SELECT content WHERE id = ?`
2. Execute delete (existing behavior)
3. Look up registry, call `onDelete` hooks

### `createRigContext` change

Needs to know `ownerRigId` AND have access to the watcher registry to thread into `BookStore`. Currently `createRigContext(rigId)` already has `rigId` — just needs the registry added (captured via closure from mainspring state).

The registry is built *before* `createRigContext` is ever called (it's built during init, before the mainspring is used for tool dispatch), so no timing issues.

---

## Scope Estimate

| File | Change |
|------|--------|
| `core/src/rig.ts` | Add `BookWatcher`, `RigInitContext`, `onInitialize` field on `Rig` |
| `core/src/index.ts` | Export new types |
| `mainspring/src/mainspring.ts` | Watcher registry; init sequence; thread registry into `createRigContext` / `BookStore` |
| `mainspring/src/db/book-store.ts` | Read-before-write in `put()`; pre-delete read in `delete()`; hook dispatch |
| Tests | `book-store.test.ts` (hooks fire, create vs update distinction); mainspring init sequence |

**Complexity estimate: 3** (medium — touches several layers but well-scoped; no schema migrations, no breaking changes to existing `Book<T>` or `RigContext` interfaces)

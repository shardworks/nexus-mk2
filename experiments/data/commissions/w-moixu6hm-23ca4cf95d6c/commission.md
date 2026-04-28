After dropping the `spider.follows` entry from Spider's `supportKit.linkKinds`, Spider no longer contributes any link kinds — the field would be removed entirely (D4). Spider's `apparatus.consumes` declaration today does NOT include `'linkKinds'` (only Clerk does), so this removal does not strand a dangling consumes declaration.

Verified by reading `packages/plugins/spider/src/spider.ts` lines 3086–3094:
```
requires: ['stacks', 'clerk', 'fabricator'],
recommends: ['oculus', 'loom'],
consumes: ['blockTypes', 'rigTemplates', 'rigTemplateMappings'],
```

No change to `consumes` is needed. The framework's Arbor warning that fires when an apparatus contributes a kit type that no installed apparatus declares as `consumes` (`guild-lifecycle.ts` lines 312–322) does not affect this commission — Clerk continues to declare `consumes: ['linkKinds']`.

Not a bug; observation that the cleanup is contained — noting it here so a future Spider modification doesn't reintroduce a stale `linkKinds` reference.
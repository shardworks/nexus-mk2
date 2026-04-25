`packages/plugins/spider/src/spider-blocking.test.ts` line 378 declares:

```
it('getBlockType returns the three built-in block types after startup (V3, R6)', () => {
  const { spider } = buildBlockingFixture();
  assert.ok(spider.getBlockType('writ-phase') !== undefined, 'writ-phase should be registered');
  assert.ok(spider.getBlockType('scheduled-time') !== undefined, 'scheduled-time should be registered');
  assert.ok(spider.getBlockType('book-updated') !== undefined, 'book-updated should be registered');
});
```

The registry now exports five built-in BlockTypes (`writ-phase`, `scheduled-time`, `book-updated`, `patron-input`, `animator-paused`) per `packages/plugins/spider/src/block-types/index.ts` and the kit registration map in `spider.ts:3041-3047`. The test passes (no negative assertion on the missing two) but the title and traceability tags (V3, R6) lie about what the fixture provides. Update the test name and add `assert.ok` lines for `patron-input` and `animator-paused`.
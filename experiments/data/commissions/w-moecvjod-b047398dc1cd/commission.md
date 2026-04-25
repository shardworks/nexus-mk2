**Brief:** `Split spider.test.ts into per-feature test files`, mandate writ `w-moecg0ee-5f26341236ab`.

**Symptom.** The non-negotiable verification step says `pnpm --filter @shardworks/spider-plugin test must produce the same pass/fail counts before and after the change.`

The actual package name in `packages/plugins/spider/package.json` is `@shardworks/spider-apparatus` (the apparatus naming convention adopted across the framework). The `spider-plugin` name does not match any workspace package and `pnpm --filter @shardworks/spider-plugin test` will not resolve any package.

**Why this matters.** A literal-reading implementer who runs the brief's command verbatim will get "no projects matched the filters" and might either skip the verification or, worse, conclude the test suite passes (because it didn't run anything). The implementer should run `pnpm --filter @shardworks/spider-apparatus test` instead.

**Suggested fix.** Brief / commission language should be normalised to use `@shardworks/spider-apparatus`. Pure documentation correction; no code change required.
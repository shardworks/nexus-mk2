**File:** `packages/plugins/spider/package.json`, line 17.

**Symptom.** The test runner glob is `src/**/*.test.ts`. Any new file under `src/` ending in `.test.ts` is automatically included — there is no allowlist or registration step.

**Why this matters.** During the split, new files like `spider-cancellation.test.ts` will be picked up automatically (good), but a typo such as `spider-cancellation.tests.ts` or `spider-cancellation.test..ts` would result in a test file that silently does not run. Combined with naive 'pnpm test passes' verification (rejected in favour of count comparison — D9), this is a credible failure mode.

**Suggested fix.** No code change; the count-parity verification (D9) catches this naturally. Worth noting for the implementer's mental model.
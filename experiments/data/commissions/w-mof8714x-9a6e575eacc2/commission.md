The brief references click `c-mof6dpzr` (status `live`) which asks why the review step did not catch the upstream WritPhase build break. These 8 test failures are in the same lineage — they were hidden behind two upstream build regressions for ~36 hours.

Direct questions to feed into c-mof6dpzr's investigation:

1. Did the upstream `b98151f` (WritPhase widening) commit run the clockworks-apparatus test suite? If so, why did the failures not surface? If not, why was the test exclusion considered safe?
2. Did `91d7eda` (better-sqlite3 fix) re-enable the test path that exposed these failures? If so, was it considered a risk that fixing the build would expose latent test failures?
3. Is there a CI lane configuration somewhere that suppressed clockworks-apparatus test output during the build-red period? (`bin/`, `scripts/`, `package.json`, `.github/workflows/` if any — the working tree shows `bin/`, `scripts/`, but no `.github` so CI configuration may live elsewhere.)
4. The Reckoner is referenced in `packages/plugins/sentinel/src/reckoner.test.ts` (search hit). Should the Reckoner have been catching pre-merge that integration tests in clockworks-apparatus were stale relative to clerk's API change? Is there a convention or invariant that should now be encoded?

This observation is meta to c-mof6dpzr; it adds tactical detail (specific files, specific commits, specific hypotheses) that the meta-investigation can use as starting points. The promotion-to-mandate flow handles dispatching the actual investigation.
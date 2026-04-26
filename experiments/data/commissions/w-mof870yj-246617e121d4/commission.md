Lifted from the planning run of "Restore green clockworks tests" (w-mof7rwih-43edcb5e8bcc). Each numbered observation below is a draft mandate ready for curator promotion.

1. Document clerk.post() initial-state semantics in integration test fixtures across the monorepo
2. Stale draft: true argument on PostCommissionRequest call sites is silently ignored
3. Investigate why review/Reckoner did not catch the integration test drift before CI red-out (parent click c-mof6dpzr)
4. Tighten exact-match counter assertions on processEvents tests that currently pass by accident
5. Consolidate commission.sealed / commission.completed duplicate emission per writ-lifecycle-observer.ts comment

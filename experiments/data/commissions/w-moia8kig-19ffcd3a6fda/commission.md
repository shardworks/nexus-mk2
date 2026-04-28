Lifted from the planning run of "Reckoner: CDC handler for held-writ scheduling and lifecycle transitions" (w-mohuvpu2-0dd39d0c99a7). Each numbered observation below is a draft mandate ready for curator promotion.

1. Contract doc §8 outcome enum disagrees with reckonings-book.md
2. Extract shared kebab-case suffix regex helper for source/kind validation
3. Sentinel and new Reckoner share file basename `reckoner.ts` and similar README scaffolding
4. vision-keeper/integration.test.ts manual synthesis should be removed once CDC handler ships
5. No throttling / rate-limit primitive for the Reckoner beyond `disabledSources`
6. Reckonings book's `outcome` invariant is writer-enforced, not schema-validated
7. Reckonings book's `book.reckoner.reckonings.created` event will fire automatically once the book is registered
8. The `clockworks-stacks-signals` validator gap leaves `reckoner.` and `reckoning.` namespaces unreserved
9. Reckoner-core scheduling commission needs a clear seam from this commission's stub
10. No persistence of stub `markApproved`-style operator-override surface for v0 testing
11. Reckonings book design names a `tickEventId` field but no scheduled-tick driver ships in v0

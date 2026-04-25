Lifted from the planning run of "End-to-end integration test for multi-type writ machinery" (w-mod646x7-d4cb16791ce0). Each numbered observation below is a draft mandate ready for curator promotion.

1. Update adding-writ-types guide to match the registerWritType-only contract
2. Lift makeWritTypeApparatus integration boilerplate into a shared testing helper
3. Surface a real-world second writ type (Astrolabe piece / observation-set) from clerk integration tests
4. Centralize MANDATE_CONFIG to eliminate clerk.ts vs children-behavior-engine.test.ts drift hazard
5. Promote ClerkApi.registerWritType examples in clerk.md to include a non-mandate code sample

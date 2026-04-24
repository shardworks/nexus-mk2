Lifted from the planning run of "Engine-level retry and rig-status rollup" (w-mod0gk8l-5677b7a3a54b). Each numbered observation below is a draft mandate ready for curator promotion.

1. Retire clockworks-retry now that engine-level retry lives in Spider
2. Emit Lattice pulse on engine retry exhaustion
3. Add guild-level override of engine-design retry policy
4. Update Spider architecture docs to reflect six-state engine and four-state rig enums
5. Add nsg writ-rescue-stuck tool for legacy stuck writs
6. Reconsider sessionId retention after engine retry schedule transitions
7. Refresh spider.js dashboard badge mappings for the new status enums
8. Per-design retry config may collide with long-running anima-session reuse across rig slots
9. Expose retry metadata on BlockTypeInfo and engine-designs tool output
10. Rate-limit detection still reaches through session.status === 'rate-limited'
11. writ.status.spider.retryable will become a dead field after engine-failure goes dormant
12. Test pass needs to cover the six-state and four-state invariants end-to-end
13. CrawlResult shape change propagates to every caller of api.crawl()
14. Consider a retry-exhausted pulse predicate distinct from writ-stuck
15. Cost aggregation in rig-view.ts must span multiple attempts' sessions per engine

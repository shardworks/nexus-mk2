docs/architecture/apparatus/animator.md still describes:
- Pre-fixup three-branch detection cascade (now single branch).
- Separate animator/status book (consolidated into animator/state).
- Stale `rateLimitBackoff` config shape post-D9.
- "Future: Event Signalling" section describing `session.started/ended/record-failed` as future work — these have shipped.
- Outdated source enumeration `ndjson-result | stderr-pattern | exit-code`.

Multiple lifted observations across animator-complexity / rate-limit-fixup / SessionDoc-reducer planning runs.

DO NOT DISPATCH until rate-limit work and SessionDoc reducer commission settle.
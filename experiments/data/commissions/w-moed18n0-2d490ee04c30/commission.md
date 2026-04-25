The manifest-prediction accuracy finding in `c-moe0lmhy` is based on an Apr-25 snapshot (n=60) and shows 76% within 1.5x. The v0 gate's effectiveness depends on this accuracy holding over time. Once `manifestFilesCount` is recorded for every plan, a periodic reckoner (or a click-list scheduled audit) could re-compute the actual/predicted ratio from sealed commits and surface drift.

This is not in v0 scope (the brief lists "Validating manifest-prediction accuracy against eventual seal-commit file lists" as Out of Scope #5), but the v0 storage layer is what makes it possible. A follow-up commission could establish a `astrolabe.manifest-accuracy-report` schedule fed by the data we're now collecting.

Files for a future commission:
- New analysis tooling, possibly `bin/manifest-accuracy.ts` or a Reckoner standing order.
- Potentially extends the seal/CDC observer in clockworks to capture actual files-touched per session.

Low priority; flagged as a natural successor to v0.
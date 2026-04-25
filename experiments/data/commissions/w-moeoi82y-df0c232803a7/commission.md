Lifted from the planning run of "Retire clockworks-retry now that engine-level retry lives in Spider" (w-mod4z7o2-47cfb3b2931f). Each numbered observation below is a draft mandate ready for curator promotion.

1. Document the engine-failure-to-phase-failed invariant in Spider's own test suite
2. Cross-package-coupling test fixture string still references SpiderWritStatus from clockworks-retry-style import
3. Reckoner Phase 2 observer unit tests deeply duplicate the boot-and-fixture scaffolding
4. SpiderStuckCause is still typed as a closed two-value union but the slot is read with raw-string casts elsewhere
5. Reckoner soft-dependency lookup pattern is now used by exactly zero apparatuses
6. Lattice-discord channel test coverage of the writ-stuck embed needs an audit pass after context-field removal
7. Standard-guild apparatus list in docs/architecture/index.md treats clockworks-retry as a top-tier capability
8. Outdated _plan/01-inventory.md artifact in repo root references clockworks-retry as a still-live plugin

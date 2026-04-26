`packages/plugins/clockworks/src/writ-lifecycle-observer.ts` L26-28 and L233-235 ship a deliberate duplicate emission: both `commission.sealed` AND `commission.completed` fire on entry into `completed`, with the comment 'the duplicate is intentional per D5; doc consolidation is a follow-up observation'.

This is the consolidation observation the inline TODO references. The path forward is a documentation pass that picks one canonical name for 'commission ended successfully' and either:
- Deprecates the other (with a migration window for any standing-order author who bound to it), or
- Documents the explicit semantic split (e.g. 'sealed' = 'no further state changes possible'; 'completed' = 'reached success terminal') and keeps both.

The relevant test (`packages/plugins/clockworks/src/integration.test.ts` L242-243) asserts on both emissions, so any consolidation must update the test surface and the catalog in the architecture docs simultaneously. Out of scope for restore-to-green; recording so the inline TODO has a follow-up landing point.
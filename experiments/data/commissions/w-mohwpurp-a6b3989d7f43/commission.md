Lifted from the planning run of "Reckoner apparatus: skeleton, registry, configuration, helper APIs, priority types" (w-mohuvn8h-c34ad4d067f3). Each numbered observation below is a draft mandate ready for curator promotion.

1. Rewrite apparatus/reckoner.md to describe petitioner Reckoner; move pulse-emitter content to apparatus/sentinel.md
2. Rename sentinel's RECKONER_PLUGIN_ID constant and pulse trigger-type strings to align with the actual plugin id
3. Update sentinel src/index.ts and README docstring, which describe sentinel as 'The Reckoner'
4. Add ext field to Clerk's PostCommissionRequest so Workflow 1 callers can post writs with ext atomically
5. Provide a transactional clerk.transactionWith helper or a stacks-level transaction wrapper exposed via Reckoner so petition() can be atomic without clerk-side changes
6. Make the kebab-suffix grammar regex a shared helper so Lattice trigger-types, Clerk link-kinds, and Reckoner sources stay in sync
7. Hot-reload of disabledSources via guild.json edit — confirm Stacks/Clockworks pattern composes with the Reckoner's read-on-each-call config strategy
8. Add a 'nsg reckoner list-petitioners' operator-facing CLI tool once the petitioner registry is non-empty
9. Petitioner registry should appear in the existing 'nsg writ types' / oculus dashboard discoverability surfaces
10. Vision-keeper kit must declare 'requires: [reckoner]' — verify this propagates correctly when the petitioner Reckoner is the new occupant of plugin id 'reckoner'
11. Petition payload size limit — brief says 'opaque petitioner-defined data'; consider a soft cap to prevent runaway payloads from blooming the writs book
12. Add an integration test that exercises the brief's full behavioral case set in one harness

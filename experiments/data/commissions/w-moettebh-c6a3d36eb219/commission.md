Lifted from the planning run of "Investigate handleParentTerminal warning when parent completes with non-terminal children" (w-modqkigw-a826b3cabc74). Each numbered observation below is a draft mandate ready for curator promotion.

1. Brief references stale handleParentTerminal that was deleted in T5 cascade refactor
2. core-api.md describes a non-existent `pending`-phase auto-routing for parent completion
3. writ-complete tool has no preflight against completing a parent with non-terminal children
4. Cascade resolution string declared inline rather than as exported constant
5. Spider rig completion path bypasses children-terminal preflight on writ completion

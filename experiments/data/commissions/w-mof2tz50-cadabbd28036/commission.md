Lifted from the planning run of "Phase-2 CDC handlers lack structural loop protection across transactions" (w-modp5ji8-3814b891cfd8). Each numbered observation below is a draft mandate ready for curator promotion.

1. Reconcile vestigial maxCascadeDepth config in stacks apparatus doc with actual hardcoded constant
2. Reconcile spec's AsyncLocalStorage claim with substrate's instance-field implementation
3. Fix typo / partial-sentence in lattice.ts file-comment about Phase-2 self-write semantics
4. Audit Phase-2 watcher × Phase-2 watcher cross-book cycle inventory before more emitters land
5. Lift MAX_PHASE2_REENTRY_DEPTH and MAX_CASCADE_DEPTH into a shared constants module

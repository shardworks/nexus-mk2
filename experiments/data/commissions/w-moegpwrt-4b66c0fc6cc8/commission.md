Lifted from the planning run of "Claude-code babysitter-runtime toolkit extraction" (w-moegbwvv-351c0aefec75). Each numbered observation below is a draft mandate ready for curator promotion.

1. Reconcile rate-limit-detector README drift against the one-branch code
2. Update README §Exports description after babysitter.ts thins down
3. Decompose runBabysitter orchestrator into init / steady-state / terminal phases
4. Deduplicate source-mode (.ts vs .js) detection in detached.ts
5. Extract MCP/SSE proxy as its own module with a stable contract
6. Drop or document the duplicate failure-reporting cascade in runBabysitter top-level catch

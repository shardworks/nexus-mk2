Lifted from the planning run of "Spider's writ-filter substring match has inconsistent fallback values across two call sites" (w-mod4x29a-24b92b454a43). Each numbered observation below is a draft mandate ready for curator promotion.

1. Unify the five other em-dash placeholder literals in spider.js under a shared missing-cell constant
2. RigView.writTitle docstring says 'omitted when the writ cannot be resolved' but the omit-on-miss case is also reached for rigs whose writId is null/empty
3. Existing comment at the writ-title display call site claims the cell falls back to em-dash 'only when the join did not resolve', missing the writId-empty case

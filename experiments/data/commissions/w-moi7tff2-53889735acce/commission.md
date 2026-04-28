Lifted from the planning run of "Oculus: Filtering for 'Cancelled' writs" (w-moi3stwe-bfcce1a2b73c). Each numbered observation below is a draft mandate ready for curator promotion.

1. Lift the per-page deep-link helper into a shared Oculus static module
2. Default `<button>` blue background is the root cause of misleading filter visuals
3. Astrolabe plans page reads `?plan=ID` on init but never updates the URL on selection
4. Spider rig detail surfaces engine selection that is invisible to URL/refresh state
5. writ-tree / writ-list filter vocabulary is mandate-specific despite the type-agnostic page
6. Spider tab selection (Rigs / Config) is not URL-reflected
7. isBooleanSchema query coercion accepts only the literal string 'true'

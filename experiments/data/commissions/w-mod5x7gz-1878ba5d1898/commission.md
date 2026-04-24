Lifted from the planning run of "Astrolabe page also fetches `/api/rig/list?limit=100` with the same window blindness" (w-mod4x25z-625036e13b9d). Each numbered observation below is a draft mandate ready for curator promotion.

1. Unify rig read-tool return shapes: `rig-for-writ` returns `RigDoc`, siblings return `RigView`
2. Astrolabe cost panel collapses distinct failure modes into one message
3. Astrolabe cost panel does n+1 session fetches that could be one server-side aggregate

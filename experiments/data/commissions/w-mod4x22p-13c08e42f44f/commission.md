Lifted from the planning run of "BUG: Most 'writ titles' on the spider's Oculus page table are just showing a hyphen or mdash" (w-mod4ete6-cfcbfc131cbc). Each numbered observation below is a draft mandate ready for curator promotion.

1. Rig list table writ-id deep-link points back to the dashboard's own page
2. Astrolabe page also fetches `/api/rig/list?limit=100` with the same window blindness
3. Rig detail panel could short-circuit its writ-show fetch when the title is the only field needed at first paint
4. Spider's writ-filter substring match has inconsistent fallback values across two call sites
5. Spider apparatus doc does not describe the dashboard's data flow

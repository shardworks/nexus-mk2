In `packages/plugins/astrolabe/pages/astrolabe/astrolabe.js::fetchCostData` (L378-L422), three distinct failure modes all fall through to `renderCostUnavailable` → `'Cost data not available'`:

1. No rig has been spawned for the plan yet.
2. The rig has engines, but none are `designId === 'anima-session'` with a `sessionId` (e.g. a planning-only rig that never got an anima session).
3. Session fetches all failed (network error / session purged).

For the operator, (1) and (2) read as "the dashboard is broken" when they are actually expected states; (3) is the only real error. Consider distinguishing them: `No rig run yet.` / `No anima sessions recorded.` / `Cost data unavailable` (only for the fetch-failure path). Files: `packages/plugins/astrolabe/pages/astrolabe/astrolabe.js` L384-L416 and `renderCostUnavailable` L424-L426.
The brief explicitly excludes UI surfacing from v0 scope (Out of Scope #3: "Surfacing the count in any UI or alert channel"). But the count is recorded on the PlanDoc and the Astrolabe page (`packages/plugins/astrolabe/pages/astrolabe/astrolabe.js`) already renders most PlanDoc metadata in the detail card. Once the v0 measurement layer ships, a small follow-up commission to render the count alongside other plan metadata (status, codex, AI cost breakdown) would let operators see at a glance whether their commissions are over the cliff without subscribing to the event.

Suggested placement: the metadata card in the detail view, near the per-step AI cost breakdowns. Format: `Predicted files: <count>` with a visual marker (e.g., warning badge) when `count > threshold`.

Files:
- `packages/plugins/astrolabe/pages/astrolabe/astrolabe.js` — add a `predictedFilesField()` helper analogous to the existing `statusBadge()` helper.
- `packages/plugins/astrolabe/pages/astrolabe/astrolabe.css` — possibly a `--warning` class if a badge is added.
- `packages/plugins/astrolabe/pages/astrolabe/astrolabe.test.js` — page rendering tests.

This is downstream-of-v0 work explicitly carved out by the brief; it should land as a separate commission once the v0 measurement layer is validated.
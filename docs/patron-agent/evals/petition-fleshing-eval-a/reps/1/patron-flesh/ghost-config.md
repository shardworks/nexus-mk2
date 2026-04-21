# Delete `astrolabe.generatedWritType` now — don't wait for the two-phase rig retirement

I want this ghost field gone in this commission. The brief frames it as a follow-up to do *after* the old two-phase-planning rig is retired; I'm rejecting that framing (#39). The two deletions are independent, and the config-side cleanup is trivial to do now — waiting for the rig retirement to drop a config field that nobody sets is exactly the "repair the stale thing" pattern I want to avoid (#38). Delete it now.

## Reader and decision

The reader is a framework developer (me, or another anima) touching the astrolabe plugin — wiring a new rig, debugging spec-publish, or auditing `AstrolabeConfig`. The decision is *"does this config field mean anything?"* Right now the answer is "no, but it'll still show up in types and autocomplete and make you wonder." After this commission the answer is "the field doesn't exist; `spec-publish` posts a `mandate`, full stop." Frequency: any time someone opens `packages/plugins/astrolabe/src/types.ts` or `spec-publish`.

## Scope

**In:**
- Delete `AstrolabeConfig.generatedWritType?: string` from `packages/plugins/astrolabe/src/types.ts`.
- Inline the literal `'mandate'` at the call site in `spec-publish` where it currently reads `guildConfig().astrolabe?.generatedWritType ?? 'mandate'`.
- Remove any type-level plumbing (JSDoc, re-exports, test fixtures) that references the field.
- Verify (planner-side, via grep) that no in-tree guild config or test sets this field. If any do, delete those settings too — they're no-ops anyway.

**Out:**
- Retiring the two-phase-planning rig itself. That's a separate, larger move and is explicitly *not* gated by this (#39 — the brief's premise that these are sequenced is wrong).
- Deprecation window, compatibility shim, or "accept-and-warn" path for guilds that might have set the field. No named external consumer exists; no deprecation (#1, #10). If some out-of-tree config sets `generatedWritType: 'mandate'`, it becomes an ignored unknown key — fine.
- Making `spec-publish` configurable for alternate writ types. No second consumer asked for this; don't build the slot (#18). If a future rig needs to post something other than `mandate`, that's a separate petition with a real motivating case.

## How it works

After the change, `spec-publish` just calls whatever the mandate-posting helper is with `'mandate'` hardcoded inline. The old two-phase-planning rig continues to work unchanged — it was already using 'mandate' as the effective value (no guild overrode it), so behavior is identical. When the two-phase rig is eventually retired in its own commission, `spec-publish` goes with it (or the hardcoded literal disappears naturally); either way, nothing to clean up at the config layer because the config layer is already clean.

This is the straightforward read of #1 ("remove over deprecate") and #38 ("delete over repair when derived/duplicated/drifting"). The ghost field is drift. The brief's own follow-up note says the end state is an inlined literal — I'm just saying do it now, not later. There's no reason to schedule a second commission for what's a ten-line diff today.

On register: the commit message should call this what it is — a ghost/vestigial field removal — not dress it up as "config simplification" or "API cleanup." Blunt is correct here.

## Assumptions I made

- **No guild in-tree sets `generatedWritType`.** The brief asserts this ("No guild sets this value currently"); the planner should confirm with a grep across `/workspace/vibers/` and any test fixtures before the PR goes out. If a guild *does* set it to `'mandate'`, delete that line too — it's a no-op. If one sets it to something other than `'mandate'`... that's a surprise worth surfacing, but I don't expect it.
- **`spec-publish` is the only reader of the field.** The brief implies this. Planner: grep for `generatedWritType` across the whole framework tree to confirm exactly one read site before deleting.
- **The type field is not re-exported or referenced by downstream plugin types.** If `AstrolabeConfig` is composed into a broader type elsewhere, the deletion still works — fields get narrower, not wider — but the planner should note any call sites that pattern-match on the property.

## Deferred questions

- **Should `spec-publish` itself be on the chopping block in this commission?** The brief implies the combined rig is replacing the two-phase path entirely, and `spec-publish` is two-phase-only. If yes, the tighter move is to delete `spec-publish` and the two-phase-planning rig as one coherent cut, and this ghost-field petition folds into that. I lean *no* for this petition — keep the scope narrow, do the config cleanup now, handle the rig retirement as its own commission — but flag for the Distiller: if the two-phase rig retirement is queued up and imminent, it's worth asking whether to collapse the two commissions.
- **Is there any in-flight work elsewhere that's about to add a second consumer of `generatedWritType`?** If some parallel petition is introducing a rig that legitimately needs to post a non-`mandate` writ, I'd want to know *before* deleting the field — the right move then is a different petition (#18's "earn the slot from a second consumer"). I don't believe such a consumer exists, but the Distiller should check the backlog briefly.

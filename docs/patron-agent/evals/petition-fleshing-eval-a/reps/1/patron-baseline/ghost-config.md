# Drop the vestigial `AstrolabeConfig.generatedWritType` field

I want this config field deleted and the literal `'mandate'` inlined at its one remaining read site in `spec-publish`. It's been vestigial since it landed, no guild sets it, and once the old two-phase-planning rig is gone it's fully dead code. I'd rather not carry it.

This commission is **conditional**: it should only execute after the `astrolabe.two-phase-planning` rig has been retired (removed from the plugin, no longer dispatched by any standing order, no longer referenced in docs or tests). If that precondition isn't met when the commission is picked up, bounce it back to me — don't do a partial deletion or leave the field in place "just in case."

## Reader and decision

The planner taking this commission. Their decision is binary: **is the two-phase-planning rig actually gone?** If yes, execute the deletion straightforwardly. If no, stop and ping me — either I mis-sequenced the commissions or the retirement stalled and we need to talk about it before I let this one land.

## Scope

**In:**
- Delete the `generatedWritType?: string` field from `AstrolabeConfig` in `packages/plugins/astrolabe/src/types.ts`.
- Inline the literal `'mandate'` at every read site — I expect one, in `spec-publish`, currently reading `guildConfig().astrolabe?.generatedWritType ?? 'mandate'`.
- Remove any JSDoc, schema entries, or config-validation references to the field.
- Update any tests that set `generatedWritType` in fixtures (I don't think any exist, but grep to be sure).
- Regenerate/refresh any config schema snapshots or typed-config exports that include this field.

**Out:**
- Any behavioral change to `spec-publish`. The output writ type stays `'mandate'`. This is a pure rename-to-literal; no logic moves.
- Changes to the combined rig. It already doesn't read this field; leave it alone.
- A broader config-surface audit. I know other fields may also be vestigial. Don't pull on that thread in this commission.
- A migration path for guilds that set the field. None do; no migration needed.

## How it works

The shape of the change I expect:

1. Remove the field from the `AstrolabeConfig` type.
2. Replace `guildConfig().astrolabe?.generatedWritType ?? 'mandate'` with the string literal `'mandate'`. Add a short inline comment like `// was astrolabe.generatedWritType; inlined after two-phase rig retirement` so the next agent reading this sees the provenance.
3. Run the package's typecheck and tests. If anything fails that isn't trivially about the deleted field, stop and report — don't paper over it.
4. Single commit, scoped to the astrolabe plugin, with a message that names what's being dropped and why (vestigial, two-phase rig retired, see follow-up note).

"Done" = the field and its default are gone from the type, the literal appears at the one call site, typecheck passes, tests pass, and a quick grep for `generatedWritType` across the repo returns zero hits.

## Assumptions I made

- Only one read site exists (`spec-publish`), as the brief states. Planner should grep to confirm; if there are others, handle them the same way.
- No guild in `/workspace/vibers/` or in test fixtures sets the field. Quick grep will confirm.
- The combined rig is the default by the time this runs, and the two-phase rig has already been deleted in a prior commission — not just deprecated.
- The inlined literal `'mandate'` is the correct value. It's the current default and the only value ever used, so this is safe.
- No external consumers (other plugins, downstream packages) type-reference `AstrolabeConfig.generatedWritType`. If they do, they're also dead and should be cleaned up in the same commit.

## Deferred questions

- Has the two-phase-planning rig actually been retired by the time this commission is dispatched? If not, bounce back — don't proceed.
- Is there an existing tracking note, backlog item, or click for the broader "post multi-rig refactor cleanup" sweep? If so, this commission should be filed under it so the cleanup is visible as one coordinated pass, not a trickle.
- Should the inline comment reference a specific commission ID or PR for the rig retirement, for traceability? My default is yes — include whichever identifier is canonical at the time.

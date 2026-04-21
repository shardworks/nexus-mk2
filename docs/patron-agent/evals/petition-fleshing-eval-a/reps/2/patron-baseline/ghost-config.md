# Retire the `astrolabe.generatedWritType` ghost config

I want the `AstrolabeConfig.generatedWritType` field removed from the astrolabe plugin and the `'mandate'` writ type inlined at the one call site in spec-publish. This is a cleanup commission, not a behavior change — no guild currently sets this value, and the combined rig (now the default brief path) never reads it. Once the old `astrolabe.two-phase-planning` rig is gone, the field is fully dead weight and I want it gone before anyone mistakes it for a live extension point.

## Reader and decision

The reader is a framework maintainer doing a post-refactor sweep of the astrolabe plugin. The decision they are making is: **is it safe to delete this field right now, or does something still depend on it?** They will read the commission, confirm the old two-phase-planning rig has in fact been retired, delete the config, inline the literal, and ship.

This is a one-shot commission, not a recurring concern.

## Scope

**In:**
- Delete `generatedWritType?: string` from `AstrolabeConfig` in `packages/plugins/astrolabe/src/types.ts`.
- In spec-publish, replace `guildConfig().astrolabe?.generatedWritType ?? 'mandate'` with the literal string `'mandate'`.
- Remove any now-unused imports, helper lookups, or default constants that existed only to support this field.
- Update any plugin-level tests or fixtures that reference `generatedWritType`.
- Update the astrolabe plugin's config documentation / schema to drop the field.

**Out:**
- Any change to the combined rig's behavior. It already doesn't read this field; I don't want this commission to touch it.
- Retiring the old `astrolabe.two-phase-planning` rig itself. That is a prerequisite, not part of this work (see assumptions).
- Broader astrolabe cleanup. If you find other vestigial fields, note them as follow-ups; don't fold them in.
- Migration shims or deprecation warnings. Nobody is using this; delete it cleanly.

## How it works

There is no user-facing behavior here — this is pure code cleanup. Concretely, I expect the change to look like:

1. **Verify the prerequisite.** Confirm `astrolabe.two-phase-planning` is no longer registered as a rig anywhere in the framework. If it still exists, stop and flag — this commission was filed on the assumption it was already gone.
2. **Grep the monorepo** for `generatedWritType` across `packages/`, `experiments/`, and any guild configs under `/workspace/vibers/`. The expectation is zero hits outside `packages/plugins/astrolabe/`. If a guild has silently started setting it, stop and flag.
3. **Delete the type field** from `AstrolabeConfig`.
4. **Inline the literal** at the spec-publish call site. The line should read something like `const writType = 'mandate';` or just pass `'mandate'` directly to whatever downstream call consumed the lookup.
5. **Run the astrolabe plugin tests and the full workspace build** to confirm nothing else was quietly depending on the field's presence in the type.

The commit message should say explicitly that this retires a ghost field and that the field had been vestigial since the combined rig became the default.

## Assumptions I made

- The old `astrolabe.two-phase-planning` rig has already been deleted by the time this commission is picked up. The brief says cleanup should happen "after the old planning rigs are deleted." If that retirement has not shipped yet, this commission is premature — flag it back to me.
- No guild in `/workspace/vibers/` or elsewhere has `astrolabe.generatedWritType` set. The brief asserts this; I'm trusting it. A quick grep will confirm.
- `'mandate'` is the only value this field has ever meaningfully held, and inlining that literal is strictly correct. I do not want a named constant introduced for it — a single literal at the single call site is fine and probably clearer.
- There is no external consumer of `AstrolabeConfig` as a published type (i.e., no third-party plugin author typing against it). If there is, the removal is still fine but warrants a note in the changelog.

## Deferred questions

- **Has the old two-phase-planning rig actually been retired yet?** If not, defer this commission until it has. Don't do it "partway."
- **Is there a changelog or release-notes convention** for the astrolabe plugin I should be dropping a line into? If yes, add a one-liner; if no, the commit message is sufficient.
- **Are there any other astrolabe config fields in the same vestigial state** that I should commission alongside this? If the sweep turns up more, file them as separate follow-up briefs — don't bundle.

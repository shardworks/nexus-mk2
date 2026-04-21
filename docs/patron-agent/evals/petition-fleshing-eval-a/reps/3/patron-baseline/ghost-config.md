# Delete the ghost `astrolabe.generatedWritType` config

I want the vestigial `AstrolabeConfig.generatedWritType` field removed from the astrolabe plugin, and the `'mandate'` string inlined at its sole read site in `spec-publish`. This is a follow-up cleanup, not a behaviour change — by the time this petition runs, the old two-phase-planning rig will already be gone, so the config has no remaining reader.

## Reader and decision

The immediate reader is the next engineer (or planner) opening `packages/plugins/astrolabe` looking for the writ-type escape hatch. Today they find a typed, documented, optional config field that nobody sets and nothing reads on the default brief path. The decision I want to eliminate is "should I wire through `generatedWritType` for my new rig?" — I want the answer to be "there is no such knob; mandates are mandates." One-shot cleanup, not a recurring concern.

## Scope

**In:**
- Delete `generatedWritType?: string` from `AstrolabeConfig` in `packages/plugins/astrolabe/src/types.ts`.
- Inline the literal `'mandate'` at the single call site in `spec-publish` (replacing `guildConfig().astrolabe?.generatedWritType ?? 'mandate'`). Keep the local variable name descriptive — e.g. `const writType = 'mandate'` — so future readers see the intent, not a naked string.
- Remove any JSON-schema / Zod-schema / typedoc entries that describe `generatedWritType`.
- Remove any fixtures, test doubles, or example configs that reference the field. Run the astrolabe package tests and the cross-plugin integration suite; both should still pass without edits to assertions.
- One atomic commit, message along the lines of `astrolabe: drop vestigial generatedWritType config`.

**Out:**
- No changes to the `astrolabe.two-phase-planning` rig itself. That rig's retirement is a separate commission and a **precondition** for this one, not part of it.
- No changes to the combined rig's behaviour. No migration shim, no deprecation warning — the field was never documented to external guilds, and the brief confirms no guild sets it.
- No rename or refactor of `spec-publish` beyond the inlining. Resist the urge to tidy neighbouring code.

## How it works

The planner picking this up should treat it as a mechanical delete:

1. Confirm the precondition: grep the monorepo for `two-phase-planning`. If any rig file, standing order, or guild config still references it, stop and escalate — this petition is not ready to run.
2. Grep for `generatedWritType` across `/workspace/nexus/`, `/workspace/nexus-mk2/`, and `/workspace/vibers/`. Expect hits in: the type definition, the `spec-publish` reader, and possibly test fixtures or docs. I do not expect hits in any live guild config.
3. Delete the field and inline the literal. No fallback, no warning — if a stray guild had set it, the TypeScript build will flag it as an unknown key (assuming `AstrolabeConfig` is the declared shape).
4. Build the astrolabe plugin and run its tests. Run a smoke brief through the combined rig in a scratch guild to confirm the default path still produces a `mandate` writ.
5. Commit. Do not bundle other cleanups into the same change — I want the diff to be a clean "remove a ghost field" that reads cleanly in `git log`.

## Assumptions I made

- The two-phase-planning rig has actually been deleted by the time this petition dispatches. If it hasn't, hold this work.
- `spec-publish` is the only reader of `generatedWritType`. The brief says so; the planner should still grep to confirm.
- No third-party guild outside the workspaces listed above depends on this field. Astrolabe config is not a published public API surface I need to soft-deprecate.
- There is no JSON-schema file generated from `AstrolabeConfig` that ships to guilds independently. If there is, it gets regenerated in the same commit.
- Tests don't assert on the field's presence or default — they just exercise the default path.

## Deferred questions

- Is there a changelog or release-notes file for the astrolabe plugin that should mention this removal? I lean no (internal cleanup, no observable behaviour change), but flag it if the plugin has a pattern of noting every type change.
- Does the combined rig's D4 decision ever flip to `postMandate: true` in a way that would bring `spec-publish` back onto the default path? If so, this cleanup is still correct — we just lock in `'mandate'` as the only option — but I want to know before dispatch.
- Any Storybook / doc-site examples pinned to `generatedWritType`? Delete them if so.

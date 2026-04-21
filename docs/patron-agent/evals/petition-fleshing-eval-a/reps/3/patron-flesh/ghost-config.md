# Delete `astrolabe.generatedWritType` now — not after the old rig retires

The brief frames this as a follow-up cleanup, to be scheduled after the old `astrolabe.two-phase-planning` rig is retired. I'm rejecting that framing (#39). The field is already dead — vestigial since landing, unset by every guild we ship, read only by a code path whose default is the only value it ever resolves to. The right move is to delete it now, in its own small commission, not to park it on a list until some larger rig retirement makes it "safe." The waiting version preserves a ghost knob that invites a future reader to wonder whether it's a legitimate configuration point. It isn't, and pretending it might be is the cost I'm not willing to carry (#1, #38).

## Reader and decision

No ongoing reader — this is a code-hygiene petition, not a feature. The one-time reader is the next framework engineer who would otherwise encounter `AstrolabeConfig.generatedWritType` in `types.ts`, notice no guild sets it, and spend time deciding whether it's load-bearing. The decision this prevents: "is this a real extension point I should respect, or dead weight I can remove?" Answering that question once, definitively, by deleting the field, beats leaving it on a deferred-cleanup list.

## Scope

**In:**
- Remove `generatedWritType?: string` from `AstrolabeConfig` in `packages/plugins/astrolabe/src/types.ts`.
- In `spec-publish`, replace `guildConfig().astrolabe?.generatedWritType ?? 'mandate'` with the literal `'mandate'` inlined at the use site.
- Drop any JSDoc / README / example-config references to the field.
- Delete any test fixture that sets or asserts on the field (there should be none or close to none, given no guild uses it).

**Out:**
- Retiring `astrolabe.two-phase-planning` itself — that's a separate petition and this cleanup does not depend on it. The old rig continues to work, it just reads a hardcoded `'mandate'` instead of a hardcoded `'mandate'`-by-default config field.
- A deprecation window, `@deprecated` JSDoc tag, or soft-removal shim. No external consumer is named (#1, #38). Removal is the correct shape.
- Preserving the field "in case someone wants to configure writ type later." The second consumer hasn't appeared; we don't build for imagined ones (#18). If a future rig genuinely needs per-guild writ-type configuration, it can earn the field back with a real use case driving its shape.

## How it works

This is a three-file diff of the form:

1. `types.ts`: drop the one field from `AstrolabeConfig`.
2. `spec-publish` (wherever it currently reads `guildConfig().astrolabe?.generatedWritType ?? 'mandate'`): replace the expression with the string literal `'mandate'`. If there's a named local variable around this value (`writType`, `targetWritType`), inline it too — no reason to preserve the indirection once the config read is gone.
3. Any doc/example that mentions `generatedWritType`: delete the mention (#38 — repair-the-stale-doc almost always loses to delete-the-stale-doc here, since the field no longer exists to document).

The behavioral contract is unchanged. Every guild currently running either (a) uses the combined rig and never hits the code path, or (b) uses the old two-phase rig with no config override and resolves to `'mandate'`. After this change, (a) is unchanged and (b) hardcodes `'mandate'` instead of reading `'mandate'` from a default. No observable difference.

One commit. Small. No feature flag, no migration note, no "in a future release" comment left behind.

## Assumptions I made

- "No guild sets this value currently" covers every guild we care about — internal, shipped examples, and anything under `/workspace/vibers/`. If there's a guild somewhere setting `astrolabe.generatedWritType` to a non-`'mandate'` value, this changes its behavior and we need to know before shipping.
- The literal `'mandate'` is the correct inlined value. The brief says so; I'm trusting that.
- `spec-publish` is the only reader of the field. The brief implies this; if a second reader exists, it gets the same treatment — inline the literal.
- No published type is re-exporting `AstrolabeConfig` in a way that would make dropping a field a breaking change for downstream TypeScript consumers outside our repos. If there is such a consumer, that's a different conversation, but I'd still expect to remove the field and let the downstream drop their unused reference.

## Deferred questions

- Sanity-check: grep the sanctum, `/workspace/nexus/`, and `/workspace/vibers/` for `generatedWritType` before the diff lands. If anything outside the two files above references it, surface before proceeding.
- Is there a test in the astrolabe package that parameterizes the writ type via this config? If so, either the test is verifying dead configuration (delete it) or it's verifying `spec-publish`'s writ-type behavior (rewrite it to not route through a config field that no longer exists).
- Confirm there's no in-flight petition that plans to *use* this field for a new rig. If someone was about to light it up, they'd need to know — but I'd still push back and ask them to earn the field with a concrete use case rather than inherit a vestigial one (#18).

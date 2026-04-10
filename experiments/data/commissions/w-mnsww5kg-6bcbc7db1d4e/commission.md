## Opened With

From the original writ-substrate design (`.scratch/conversation-topics-as-writs.md`):

> Currently writ types come only from `ClerkConfig.writTypes` in guild config. For `topic` to ship automatically with Astrolabe, plugins need a way to register types beyond guild config.

Three candidates were sketched:

- **Option A — Imperative registration.** `clerk.registerWritType(entry, origin)` called from a plugin's setup function. One method, trivially implemented. Con: order-dependent — Astrolabe setup has to run before anyone posts a writ of the new type.
- **Option B — Declarative contribution manifest.** `createAstrolabe({ contributes: { writTypes: [...] } })`. Declarative, inspectable, loaded at init before any runtime call. The `contributes` pattern likely generalizes to other plugin extension points (engines, pages). Con: requires a plugin-contributions framework if none exists yet.
- **Escape hatch** — declare new types in the sanctum's `guild.json` under `clerk.writTypes`. Works immediately, costs nothing. This is what shipped for v1.

Conflict policy sketched: if two plugins contribute the same type name, fail loudly at init rather than silent last-wins.

## Summary

Currently on the escape hatch: `quest` (and any future parasitic types) is declared in sanctum `guild.json`. This works but means:

- Plugins can't ship self-contained writ-type contributions.
- Any sanctum that wants `quest` has to know to register it. Bootstrap friction.
- The general question "how do plugins contribute extension points" is still unanswered — `contributes` is an attractive pattern but nothing uses it yet.

**Open:** Which mechanism? Option B (declarative `contributes`) is the most architecturally clean and probably generalizes best, but it's strictly more work than Option A, and Option A is strictly more work than staying on the escape hatch. Cost/benefit depends on whether other plugins have real extension-point needs waiting in the wings.

Candidates for "would benefit from `contributes`":

- Astrolabe — the originally-planned owner of the `quest` type.
- Oculus — pages/routes contributed by plugins (already exists in some form?).
- Spider — rig template mappings (currently declared differently).
- Clockworks (when it ships) — schedules and relays.

If 3+ of those want it, Option B is worth building. If only Astrolabe, Option A or staying on the escape hatch is fine.

## Notes

- 2026-04-10: Imported from `.scratch/conversation-topics-as-writs.md` § "Plugin-contributed writ types".
- Parent quest: w-mnswvmj7-2112b86f710a (writ substrate).
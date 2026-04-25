`docs/guides/adding-writ-types.md` is meaningfully stale relative to T2's Clerk refactor. The guide still documents two registration paths that no longer exist:

- `ClerkKit.writTypes` array contributed via a kit (lines 13, 33–40, 100, 124–128, 131, 192, 197–214) — the Clerk no longer scans `writTypes` from kit contributions; the kit-channel registration path was removed in T2.
- guild-config `clerk.writTypes` JSON-side declaration (lines 152–180) — `ClerkConfig` (packages/plugins/clerk/src/types.ts:217–220) only carries `defaultType`; there is no `writTypes` field on the config.

The code's actual contract is single-path: `ClerkApi.registerWritType(config)` called from a plugin's own `start()` (clerk.ts:772–774, 1080; astrolabe.ts:392–393 is the canonical real-world example). The guide should:

1. Replace the 'Quick start' (lines 11–41), 'Registering via a kit' (lines 98–131), and 'Registering via guild.json' (lines 152–180) sections with a single 'Register your type' section that shows a `start()` calling `clerk.registerWritType(config)`.
2. Remove the 'Kit-vs-kit name collisions' (lines 196–210) and 'Kits that redeclare a built-in type are silently skipped' (lines 212–214) pitfall sections — both describe behaviours of the removed kit channel.
3. Link to the new walkthrough's adjacent commission record / click for traceability.

The in-tree clerk.md architecture doc has already been updated (it points at `ClerkApi.registerWritType` as the single-surface entry, lines 681–683); only the guide is left behind. Doc/code drift on a 'plugin-author walkthrough' is high-impact — a new plugin author following the guide will write code that the framework rejects.
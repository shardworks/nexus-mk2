`docs/guides/adding-writ-types.md` (lines 9, 13–43, 100–161) shows two registration channels that no longer exist:

* `ClerkKit.writTypes` array on a plugin export — deleted in commit `f4da4ec`.
* `clerk.writTypes` field in `guild.json` — deleted in the same commit.

The only surviving registration path is `ClerkApi.registerWritType(config)` from a plugin's own `start()` (mandate registers itself this way; astrolabe registers piece + observation-set this way). A new author following this guide will write code that fails to compile (`writTypes` is no longer in `ClerkKit`) and guild config that the schema rejects.

The guide needs an end-to-end rewrite: replace both quick-start examples with the `start()` registration pattern, drop the 'Registering via guild.json' section entirely, and update the validator-coverage note to reflect that registration runs `validateWritTypeConfig` automatically. Out of scope for T3's narrow engine commission but the guide will become more misleading the moment the engine ships and operators search for how to add their own typed cascades.
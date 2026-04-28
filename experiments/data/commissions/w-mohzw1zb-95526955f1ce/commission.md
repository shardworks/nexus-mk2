Building on obs-4: the `schema?: unknown` field on `EventSpec` (clockworks types.ts lines 48-54) was deliberately preserved by commit 26f90b9 (“remove unenforced EventDeclaration.schema field” — actually it removed the **declaration** but kept the slot). The field is currently:

- Accepted in plugin contributions and `guild.json` entries.
- Ignored at runtime (the merged set carries it through; validators do not consult it).
- Documented in two places (events-redesign and event-catalog) as a future-commission slot.

Three Defaults reading: prefer removal to deprecation. The slot is a pre-emptive future-proofing knob with no current consumer. Removing it (and re-adding when the runtime arrives) keeps the API surface tight.

Counter: keeping the slot lets operators write `guild.json` entries that the eventual schema-validation runtime will pick up without a config rewrite — but the field is `unknown`, so the future runtime would have to refuse non-conforming shapes anyway.

Recorded as a separate commission's call — either delete the slot, or add a runtime-validator commission that earns it. C5 leaves it untouched.
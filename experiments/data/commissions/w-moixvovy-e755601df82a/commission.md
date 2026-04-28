Two pre-existing drifts that this commission's documentation pass should sweep up at the same time:

1. `docs/architecture/clockworks.md` lines 376–381 show:
   ```
   interface ClockworksKit {
     relays?: RelayDefinition[]
   }
   ```
   The actual interface in `packages/plugins/clockworks/src/types.ts` lines 505–522 already declares `events?: EventsKitContribution`. The doc was not updated when the events kit landed (commission C1).

2. `docs/architecture/plugins.md` line 60 reads:
   `- ClockworksKit — defines relays. See [ClockworksKit](clockworks.md#clockworkskit).`
   Same drift — `events?` is missing from the summary line.

This commission's D18 already commits to updating both surfaces. The observation captures the pre-existing drift so a code-reviewer can confirm the cleanup landed and didn't fix only the new field.
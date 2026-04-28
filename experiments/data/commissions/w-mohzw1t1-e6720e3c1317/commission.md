`packages/framework/cli/README.md` lines 132-135 still describe the `nsg signal` validator as a per-namespace blocklist:

> “The event name must be declared under `clockworks.events` in `guild.json`; reserved framework namespaces (`anima.`, `commission.`, `tool.`, `migration.`, `guild.`, `standing-order.`, `session.`) and writ-lifecycle patterns (`<type>.{ready,completed,stuck,failed}`) are rejected.”

Under the C1 model:
- The “reserved namespace” concept is gone; framework-owned status is per-event and sticky-true once any plugin claims the name via `supportKit.events`.
- The writ-lifecycle pattern check has been removed; lifecycle names are merged into the event set by Clerk's events kit (per C2 design, not yet landed) and become framework-owned through that mechanism.
- An operator can also declare a custom event under `guild.json clockworks.events` and signal it freely (subject to the framework-owned check).

C5 makes a surgical edit — stripping just the literal `tool.` token from the parenthetical list. The broader rewrite to reflect the merged-set + plugin-declared-flag model belongs to a separate doc-cleanup commission (the same paragraph also references soon-to-be-renamed `schedule.`, `standing-order.`, `migration.`, `guild.` namespaces that C2 will rename to `clockworks.*`).
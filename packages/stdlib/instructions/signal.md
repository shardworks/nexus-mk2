# signal

Signal a custom guild event. The event is recorded in the Ledger and will be processed by the Clockworks runner when `nsg clock tick` or `nsg clock run` is invoked.

## Usage

- The event name **must** be declared in `guild.json` under `clockworks.events`.
- You **cannot** signal framework events (`anima.*`, `commission.*`, `tool.*`, `migration.*`, `guild.*`, `standing-order.*`) — those are emitted automatically by the framework.
- The optional payload is a JSON object with event-specific data.

## When to use

Signal an event when something meaningful has happened that other parts of the guild should know about. Standing orders in `guild.json` determine what happens in response.

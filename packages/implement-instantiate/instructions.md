# instantiate

Create a new anima in the guild — recording its composition (curricula, temperament, roles) in the Ledger so it can be manifested for sessions.

## Usage

```
instantiate <name> --roles <roles> [--curricula <curricula>] [--temperament <temperament>]
```

## Arguments

- `<name>` — Name for the new anima
- `--roles <roles>` — Comma-separated roles the anima will hold (e.g. artificer, sage)
- `--curricula <curricula>` — Comma-separated curricula to assign (must be registered in guild.json)
- `--temperament <temperament>` — Temperament to assign (must be registered in guild.json)

## Guidance

- The anima's name should be unique within the guild.
- Roles determine which implements the anima can access (via role gating).
- Curricula and temperament must already be installed in the guild before they can be assigned.

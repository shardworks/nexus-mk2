# dispatch

Post a commission to the guild, triggering the manifest engine to start an anima session for the work.

## Usage

```
dispatch <spec> [--anima <name>] [--priority <level>]
```

## Arguments

- `<spec>` — Commission specification describing what needs to be done
- `--anima <name>` — Target a specific anima (otherwise dispatch selects based on roles)
- `--priority <level>` — `normal` (default) or `urgent`. Use urgent sparingly — it preempts other work. Include justification in the spec.

## Guidance

- Always ensure the commission spec includes a clear problem statement and acceptance criteria before dispatching.
- If dispatch returns a conflict, use other implements to check the anima's current commission before retrying.
- After dispatching, record the commission ID in your notes for handoff tracking.

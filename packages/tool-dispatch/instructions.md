# dispatch

Post a commission to the guild, triggering the manifest engine to start an anima session for the work.

## Usage

```
dispatch <spec> --workshop <workshop> [--anima <name>]
```

## Arguments

- `<spec>` — Commission specification describing what needs to be done
- `--workshop <workshop>` — Target workshop where the work will be done
- `--anima <name>` — Target a specific anima (otherwise the commission is posted but unassigned)

## Guidance

- Always ensure the commission spec includes a clear problem statement and acceptance criteria before dispatching.
- If dispatch returns a conflict, use other implements to check the anima's current commission before retrying.
- After dispatching, record the commission ID in your notes for handoff tracking.

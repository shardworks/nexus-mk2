# remove-tool

Remove a guild-managed tool — deregisters it from guild.json and removes its on-disk directory.

## Usage

```
remove-tool <name> [--slot <slot>]
```

## Arguments

- `<name>` — Name of the tool to remove
- `--slot <slot>` — Specific version slot to remove (removes the active slot if omitted)

## Constraints

- **Framework tools cannot be removed.** Tools with `source: "nexus"` are managed by the framework (`nexus repair` / `nexus install`). Attempting to remove them will fail.
- If removing a tool leaves its parent name directory empty, the parent directory is also cleaned up.

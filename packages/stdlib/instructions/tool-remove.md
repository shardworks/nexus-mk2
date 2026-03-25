# remove-tool

Remove a guild-managed tool — deregisters it from guild.json and removes its on-disk directory.

## Usage

```
remove-tool <name>
```

## Arguments

- `<name>` — Name of the tool to remove

## Constraints

- If the tool was installed via npm, the package is also removed from `node_modules`.
- Linked tools have their symlink removed.

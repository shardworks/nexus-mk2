## Change request

`nsg click tree` should display the short click ID (e.g. `c-mo1mq8ry`) alongside each goal by default. No flag — this should be the standard output.

## Motivation

Coco is the primary consumer of `click tree`. The dominant workflow is: scan the overview, spot an interesting subtree, then pivot into it via `click show <id>`, `click extract <id>`, or `click tree --root-id <id>`. Today, the tree output shows goals and status glyphs but no IDs, forcing a second `click list` call just to translate label → ID. That's pure friction with no upside for the primary consumer.

## Proposed output

Current row format:
```
│   └── Design task session handoff notes for the implement-loop engine   ●
```

Proposed row format (ID column inserted before the goal, fixed-width):
```
│   └── c-mo1mqa1y  Design task session handoff notes for the implement…  ●
```

- Use the **short prefix** form (the `c-<base36ts>-<hash>` first segment, ~10 chars), not the full 23-char ID. The prefix form is what `nsg click show/extract/tree --root-id` already accept.
- ID column sits between the tree-drawing characters and the goal text, fixed width so columns align.
- Goal text truncation (the existing `…` ellipsis) tightens accordingly to keep overall row width bounded. `click show <id>` remains the way to get the full goal.
- Status glyph stays on the right as today.

## Acceptance

- `nsg click tree` output includes the short ID as a fixed-width column before the goal on every row.
- Existing `--status`, `--root-id`, `--depth` flags continue to work unchanged.
- No new flag is introduced; the ID column is always on.
- At least one test exercises the rendered row format and confirms the ID prefix appears in the expected column.

## Out of scope

- Changing ID format itself.
- Changing `click list` / `click show` / `click extract` output.
- Adding a flag to hide IDs — if a future consumer needs label-only output, they can file a separate writ.
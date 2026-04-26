## What

Patrons authoring decomposition ladders will routinely want a hierarchical view of a vision and everything beneath it (charges, pieces, leaf mandates). `nsg writ tree --type vision` already renders the writ-level shape, but it pulls `phase` only — the cartograph stage (`vision draft / active / sunset / cancelled`, `charge validated`, `piece done`) is the patron-facing vocabulary and never appears in the tree output.

This is out of scope for the CLI commission (D3 settled on `five-ops` per type, no tree command). A future commission that adds a `<type>-tree` or single `cartograph-tree` would surface the per-type stage badge per row, making the ladder navigable from the patron's mental model directly.

## Surface

Likely shape: `nsg vision tree <id>` rendering the subtree with a row format like:

```
v-mo123  [vision active]    'Patron walkthrough redesign'
  c-mo456  [charge validated]  'Decompose the click apparatus'
    p-mo789  [piece done]       'Extract conclude shortcut'
    p-mo7ab  [piece active]     'Extract park/resume shortcuts'
```

Implementation composes `clerk.list({ parentId })` recursively (or a future `clerk.tree()` walker) with cartograph's `showVision` / `showCharge` / `showPiece` for stage enrichment. JSON mode returns the same nested shape.

Requires either a typed-API tree method (`cartograph.treeUnder(id)`) or per-type tools that compose at the CLI layer. The brief explicitly forbids typed-API expansion; the CLI-layer compose is the lighter follow-on.
# Surface `supersedes` links in `nsg click tree` and `nsg click extract`

## Intent

Make inbound and outbound `supersedes` links visible in the two click-rendering commands that agents and operators use for orientation — `nsg click tree` and `nsg click extract`. Today both commands render status and goal but omit link information entirely, which means a reader arriving at a concluded click whose decision has been superseded has no signal that a superseder exists, and may act on stale information. The fix is to surface the supersede relationship alongside status and conclusion, in both directions, regardless of whether the superseding click lives in the same subtree as the rendered scope.

The design principle: the supersede dimension is orthogonal to the status dimension. A superseded click is still concluded — its status doesn't change. What changes is that it now has a successor, and that successor should be discoverable from the superseded click's own rendered line.

## Motivation

Click immutability is the guarantee that makes the tree a durable record of decisions. The supersedes link is the escape hatch for when a concluded decision turns out wrong or incomplete: the original stays frozen, and a new click with updated framing links `supersedes` to the old one. This pattern is now documented in the clicks skill as the canonical post-conclusion correction flow.

The pattern only works if downstream readers find the superseder. Today they don't. Tree and extract — the two commands an agent actually runs to orient on a line of inquiry — are silent about supersede links, leaving the reader to discover via `nsg click show` on the individual click. Nobody does that by default. The result is a latent trap: an old concluded click can be read in isolation and treated as current when it's not.

The cost of leaving this unfixed grows with the usage of the supersedes pattern. As the clicks skill promotes it as the canonical correction mechanism, more clicks will accumulate inbound supersede links, and each is a potential trap until surfaced. The fix is narrow — two commands, additive rendering, no status-model change.

## Non-negotiable decisions

### Tree rendering: inbound supersedes as a suffix marker

When a click has an inbound `supersedes` link, `nsg click tree` appends a suffix to that click's line after the existing status indicator:

    ├── c-abc123  Old goal text …                        ○  → c-def456

The suffix format is ` → <short-id>` where the short-id is the immediate superseder (one hop). Chains deeper than one hop are not expanded in tree output — the reader follows the link to see further.

Outbound supersedes (this click supersedes another) is **not** surfaced in tree output. The high-value case is the superseded click, because that's where the surprise lives; the superseding click is typically arrived at deliberately and its conclusion usually names what it supersedes.

### Extract rendering: both directions, per-click

Each click entry in `nsg click extract` includes supersede information inline with its other fields:

- When inbound `supersedes` exists:

      Superseded by: c-def456 "<superseder's goal>"

  When the inbound chain has multiple hops (A ← B ← C), this line shows the full chain to the terminal (most recent) superseder, joined with ` → `:

      Superseded by: c-def456 → c-xyz789 "<terminal superseder's goal>"

  The quoted goal belongs to the terminal entry. Intermediate ids are shown without goals — the reader can extract the intermediate clicks if they want the middle of the chain.

- When outbound `supersedes` exists (this click supersedes one or more others):

      Supersedes: c-abc123 "<superseded click's goal>"

  Outbound shows only the immediate predecessor (one hop back); walking further backward is lower-value since the reader is already on the current version and can extract the predecessor if needed.

These lines are shown alongside the existing Status and Conclusion lines. No flag required; visible by default.

### Parentage-independent rendering

The supersede surfacing is not scoped to the rendered subtree. When A is rendered and its superseder B lives outside the current tree/extract scope, the pointer to B is still shown on A's line. The target click's **id and goal snippet** are what the surfacing requires — pulling in B's full entry is out of scope. Scope of the rendered content stays what the user requested; only the inline pointer crosses the scope boundary.

This is the load-bearing property of this commission: a reader walking a subtree with `extract` must not be able to miss that something in that subtree has been superseded by something outside it.

### No new status indicator

The existing four status glyphs (`●` live, `◇` parked, `○` concluded, `✕` dropped) remain unchanged. Supersede information is additional content, not a status modifier. This preserves any existing code that parses or counts status indicators, and keeps the status and supersedes dimensions orthogonal so that readers reason about them separately.

A superseded click is still `○` concluded; the ` → c-...` suffix is where the supersede signal lives.

### JSON output carries structured supersede data

`nsg click extract --format json` already emits structured click data. When this commission lands, each click object in JSON output carries a `supersededBy` and `supersedes` field (or equivalent — field naming is the implementer's call) when the corresponding links exist. Consumers of JSON output don't need to cross-reference a separate links table to know about supersede relationships.

### Tree width handling: preserve the suffix, truncate the goal

Tree output today truncates the goal to fit the available terminal width. When a supersede suffix is added, the suffix is preserved in full at the cost of further goal truncation if needed. The suffix is high-signal; the goal is scannable context that already tolerates truncation.

## Out of scope

- **Rendering other link types in tree/extract.** Related, commissioned, and depends-on links are not surfaced by this commission. Each has different semantics and deserves its own design conversation if/when the surfacing need materializes.
- **Interactive drill-down or chain expansion in tree.** Readers who want to walk a supersede chain can follow the suffix to the next click. No new interactive affordance introduced.
- **Changes to `nsg click show`.** Show already surfaces links; its rendering is not changed by this commission.
- **Chain walking in tree beyond one hop.** Only the immediate superseder is shown as a tree suffix; deeper chains require explicit navigation.
- **Re-parenting superseded clicks under their superseder.** Parentage stays where the author placed it; the link is the traversal mechanism, not the tree structure.
- **A new status glyph for superseded clicks.** Kept orthogonal per the decision above.
- **Bulk operations on supersede chains** (e.g., "show me all unresolved supersede chains"). Out of scope.

## Behavioral cases the design depends on

- A tree rendering with no supersede links produces output byte-identical to today's output (other than any incidental whitespace changes).
- A tree with one superseded click in scope shows a ` → c-<short>` suffix on that click's line; sibling and parent lines are unchanged.
- A tree with a superseding click in scope — no suffix added to that click's line (outbound not shown in tree).
- An extract with a concluded click whose superseder is in a different subtree still shows a `Superseded by:` line on that click, naming the out-of-scope superseder's id and goal snippet.
- An extract with a 3-hop supersede chain (A ← B ← C, all concluded) renders:
  - On A: `Superseded by: c-B → c-C "<C's goal>"`
  - On B: `Supersedes: c-A "<A's goal>"` and `Superseded by: c-C "<C's goal>"`
  - On C: `Supersedes: c-B "<B's goal>"`
- A click with no supersede links in either direction has no supersede lines in its extract entry — absence of the lines is the signal.
- `nsg click extract --format json` on a click with supersede links returns the structured fields; consumers don't need additional queries.
- Tree truncation with a long goal and a supersede suffix truncates the goal further to preserve the suffix in full.

## References

- `c-mobzwczn` — this commission's design click
- `c-mobzw9of` — parent click on supersedes-as-canonical-post-conclusion-correction pattern, documented in the clicks skill
- `c-mo1itggx` — clicks-evolution umbrella
- `c-mobzw8pn`, `c-mobzw7uc` — sibling design clicks on other clicks-evolution mechanisms, unrelated to this commission
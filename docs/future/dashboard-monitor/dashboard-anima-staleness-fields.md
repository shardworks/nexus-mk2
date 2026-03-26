# Dashboard Update: Anima Staleness Fields

Reference for adding staleness indicators to the guild-monitor dashboard.

## Context

Animas are composed with a snapshot of their curriculum and temperament at creation time. When the guild is upgraded and newer training content is installed, existing animas continue using their original (now outdated) compositions. This is called "staleness." The operator can refresh stale animas by retiring and recreating them (`nsg upgrade --recompose`).

## New fields on `listAnimas()` return values

The core `listAnimas()` return type (`AnimaSummary`) is unchanged. Staleness is obtained separately via `checkAllAnimaStaleness(home)`, which returns a `Map<string, AnimaStaleness>` keyed by anima ID. Only stale animas appear in the map.

In the MCP tool output (`anima-list`), each entry now includes:

| Field | Type | Description |
|-------|------|-------------|
| `stale` | `boolean` | `true` if the anima's composition uses outdated training content |
| `staleness` | `AnimaStaleness \| null` | Staleness detail, or `null` if the anima is current |

## New fields on `showAnima()` return values

The core `showAnima()` return type (`AnimaDetail`) is unchanged. Staleness is obtained separately via `checkAnimaStaleness(home, animaId)`.

In the MCP tool output (`anima-show`), the response now includes:

| Field | Type | Description |
|-------|------|-------------|
| `stale` | `boolean` | `true` if the anima's composition uses outdated training content |
| `staleness` | `AnimaStaleness \| null` | Staleness detail, or `null` if the anima is current |

## Type definitions

### `AnimaStaleness`

```typescript
{
  stale: boolean;           // Always true when present (convenience flag)
  curriculum: StalenessInfo | null;  // null if curriculum is current
  temperament: StalenessInfo | null; // null if temperament is current
}
```

### `StalenessInfo`

```typescript
{
  composedVersion: string;  // Version baked into the anima's composition (e.g. "0.1.0")
  currentVersion: string;   // Version currently installed on disk (e.g. "0.2.0")
}
```

## Core functions (imported from `@shardworks/nexus-core`)

### `checkAnimaStaleness(home: string, animaId: string): AnimaStaleness | null`

Check staleness for a single anima. Returns `null` if the anima is not found. Returns an `AnimaStaleness` object with `stale: false` if the anima is current, or `stale: true` with detail about which axis is outdated.

### `checkAllAnimaStaleness(home: string): Map<string, AnimaStaleness>`

Check staleness for all active animas in one pass. Returns a map of anima ID → staleness info. **Only includes stale animas** — if an anima is current, it won't appear in the map. This is the efficient way to annotate a list view.

## UI recommendations

- In the anima list/table: show a warning indicator (⚠ icon, yellow badge, etc.) next to stale animas
- In anima detail view: show staleness per-axis (curriculum and/or temperament) with the version mismatch
- Optionally: a summary count of stale animas in the guild overview/header (e.g. "3 active animas, 1 stale")

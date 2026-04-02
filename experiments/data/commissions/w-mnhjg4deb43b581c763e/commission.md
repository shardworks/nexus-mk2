# Normalize ID Formats Across Apparatus

Every apparatus currently rolls its own ID generation with inconsistent formats. Standardize on the `{prefix}-{base36_timestamp}{hex_random}` convention established by the Clerk.

## Current State

| Package | Function | Format | Sortable? |
|---------|----------|--------|-----------|
| **Clerk** | `generateWritId()` | `w-{base36_ts}{12_hex}` | Yes |
| **Codexes** | `generateDraftId()` | `{base36_ts}{8_hex}` (no prefix) | Yes |
| **Animator** | `generateSessionId()` | `ses-{8_hex}` (no timestamp) | No |
| **Parlour** | `generateId(prefix)` | `{prefix}-{8_hex}` (no timestamp) | No |

## Target Convention

```
{short_prefix}-{base36_timestamp}{hex_random}
```

- **Prefix**: Short, type-identifying (e.g. `w-`, `ses-`, `conv-`, `turn-`, `draft-`)
- **Timestamp**: `Date.now().toString(36)` — gives lexicographic sort by creation time
- **Random suffix**: `crypto.randomBytes(N).toString('hex')` — uniqueness without coordination

## Proposed Changes

| Package | Prefix | Notes |
|---------|--------|-------|
| Codexes / drafts | `draft-` | Add prefix, keep timestamp + random |
| Animator / sessions | `ses-` | Add timestamp before random suffix |
| Parlour / conversations | `conv-` | Add timestamp before random suffix |
| Parlour / participants | `part-` | Add timestamp before random suffix |
| Parlour / turns | `turn-` | Add timestamp before random suffix |

## Considerations

- Existing IDs in live guilds won't change — this only affects newly generated IDs. Code that reads IDs should not assume format (treat as opaque strings).
- Random suffix length can vary by type. High-volume types (turns) might want more bytes to reduce collision risk.
- Consider extracting a shared `generateId(prefix: string, randomBytes?: number)` utility into `nexus-core` to eliminate duplication.

---

**Important:** When you are finished, commit all changes in a single commit with a clear, descriptive message. Do not leave uncommitted changes — they will be lost when the session closes.

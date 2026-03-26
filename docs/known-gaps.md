# Known Gaps

Tracked limitations and missing features in the Nexus framework.

## Role instructions are not upgradeable

**Added:** 2026-03-26
**Context:** The `nsg upgrade` command handles migrations, curricula, and temperaments — but role instruction files (`roles/steward.md`, `roles/artificer.md`) are scaffolded once by `nsg init` and never touched again. They are not part of the bundle manifest and have no versioning or upgrade path.

**Impact:** When framework updates include changes to role instructions (new procedures, new tool awareness, boundary clarifications), existing guilds don't receive them. The operator must manually update their guild's role files.

**Proposed fix:** Add role instructions as a new artifact category in the bundle manifest, with versioning and diff-based upgrade support — same treatment as curricula and temperaments. Role instructions are conceptually the same shape: framework-authored markdown files referenced by path in `guild.json`.

**Workaround:** Manually update `roles/*.md` in the guild repo after framework upgrades.

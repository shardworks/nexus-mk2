# Observations: doc-update-pass

## Brief vs. reality discrepancy

The brief describes review-loop.md's Decision section (line 69) as saying "Adopt both Option A (MVP) and Option B (full design)." The actual document at line 61-65 says "Option B (review engines in the rig) is the chosen design" with no mention of Option A. Either the doc was revised between when the brief was written and now, or the brief references a prior version. The patron should confirm whether S3 work is still needed.

## `nexus-stdlib` ghost

The CLI README references `nexus-stdlib` as the source for 10+ commands. This package does not exist anywhere in the monorepo. The tools it supposedly contributes are actually spread across clerk, animator, and other apparatus packages — or don't exist at all. This isn't just a naming issue; it suggests the README was written against a planned architecture (single stdlib bundle) that was superseded by the multi-apparatus design. Any other docs referencing `nexus-stdlib` as a real package should be audited.

## `docs/architecture/index.md` has 4+ unwritten TODO sections

The main architecture doc contains `<!-- TODO -->` blocks at lines 355, 361, 507, and 513 for Work Model, Clockworks, Animas/Sessions, and Core Apparatus Reference. These are tracked in `_agent-context.md`'s "remaining stub sections" list. Writing these sections is a separate commission but should be tracked — the architecture doc is incomplete.

## Anima tooling gap

The CLI README lists 6 anima management commands (create, list, show, update, remove, manifest) — none exist. No anima tools were found in any plugin package. If anima management is a real need, it's a feature gap, not just a doc gap. If it's deferred intentionally, the architecture docs should say so.

## `writ-update` doesn't exist

The CLI README lists `nsg writ update` but no such tool exists. The clerk apparatus has `writ-accept`, `writ-complete`, `writ-fail`, `writ-cancel`, `writ-link`, `writ-unlink` — all specific state transitions rather than a generic update. This appears to be a deliberate design choice (explicit transitions over generic mutation) but isn't documented anywhere.

## Event/signal/audit/dispatch tooling gap

The CLI README lists `nsg signal`, `nsg event list`, `nsg event show`, `nsg dispatch list`, and `nsg audit list` — none exist as tools. These are all clockworks/observability features. The clockworks event system exists (the event and event_dispatches tables are in the schema) but has no CLI-facing tools for querying it. This is an observability gap — operators can't inspect the event queue or dispatch history from the CLI.

## `_agent-context.md` workspace paths

The doc references `/workspace/nexus/`, `/workspace/shardworks/`, and `/workspace/nexus-mk2/` as three separate workspaces. This commission's repo appears to be at the path the doc calls `/workspace/nexus-mk2/` (the "patron-side sanctum"), but the package.json repo URL is `github.com/shardworks/nexus-mk2`. The relationship between these workspaces is unclear and the doc doesn't explain it well. This is a local dev environment concern that probably shouldn't be in an agent orientation doc at all — agents should use relative paths.

## `docs/DEVELOPERS.md` has a relevant convention

Line 255: "The README must match the shipped code. If the API changes, the README changes in the same commit. Stale documentation is worse than no documentation." This convention supports the aggressive cleanup approach in S1/S2 — removing aspirational entries rather than marking them.

## Spider apparatus undocumented in CLI README

The Spider contributes 5 CLI tools (rig-list, rig-show, rig-for-writ, crawl-one, crawl-continual) that are not mentioned anywhere in user-facing documentation. These are significant operational tools (rig inspection, Spider execution). Whether they should be documented depends on whether Spider is considered user-facing or internal infrastructure.

## Walker deprecation artifact

`.claude/CLAUDE.md` line 34 lists `packages/plugins/walker/` as "(deprecated — renamed to spider)". If this directory still exists, it should be removed. If it's already removed, the CLAUDE.md reference should be cleaned up. Outside this commission's scope but worth noting.

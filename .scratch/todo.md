# Scratch TODO

## Urgent

- **Worktree engine: which repo?** Commission worktrees are currently created from the guildhall bare repo, but commissions target a *workshop* repo (the actual codebase). The worktree engine needs a project/workshop repo path, not just NEXUS_HOME. The guildhall bare repo is for guild infrastructure; workshop repos are where animas do real work.

## Design

- **Bundle idempotency.** What happens when a bundle is reinstalled? Current behavior: overwrites same-slot artifacts. Open questions: should it skip if a newer slot is active? Should it warn? Relevant for bundle upgrades — e.g., starter kit v0.2.0 ships updated tools but the guild has customized some. Need a policy for conflict resolution.

- **npm workspaces for the guild.** See detailed analysis below.

- **Dispatch: workshop auto-selection.** Currently `--workshop` is required. For single-workshop guilds this is clunky. Consider auto-selecting when there's only one workshop, or defaulting based on context.

- Commission CLI: consider an `amend` command (`nexus commission amend <id> <amendment-file>`) — append amendments to a posted commission without recreating it. Carries forward the amendment pattern.
- Commission dispatch: capture session logs (session.jsonl) somewhere durable — currently lost when tmpdir is cleaned up. Needed for cost tracking, debugging, and experiment data.
- Generic ability to plugin "agents" (spirits?) into commissions (basically hooks)

---

## Deferred: Guild as npm Workspace Root

### Context

Bundles (Phase 1) limit inline artifacts to content-only types (curricula, temperaments) because inline implements/engines with npm dependencies have no resolution path — they're copied as files, disconnected from any package manager. This works fine for the starter kit but prevents bundling implements with deps inline.

### The Idea

Make the guild an npm workspace root. Each tool slot (`implements/{name}/{slot}/`, `engines/{name}/{slot}/`) becomes a workspace member. `npm install` at guild root resolves all workspace members' deps, hoisting shared ones to root `node_modules/`.

```json
// guild package.json
{
  "name": "guild-my-guild",
  "private": true,
  "workspaces": ["implements/*/*", "engines/*/*"]
}
```

### What It Enables

- **Inline implements/engines with deps in bundles.** Copied to slot, becomes a workspace member, `npm install` resolves its deps. No special handling needed.
- **Simpler runtime resolution.** Standard Node module resolution from each workspace package. No `NODE_PATH` hacks for the MCP server.
- **Guild-authored tools.** A guild could create implements directly in the `implements/` directory, add deps to the slot's `package.json`, and `npm install` resolves everything.

### What It Costs

- **Every tool slot must have a valid `package.json`.** They already do (tool packages ship with one), but now npm reads them. A malformed one causes `npm install` to fail at guild root level.
- **`npm install` becomes holistic.** Today each tool install is self-contained. With workspaces, there's a guild-wide resolution step. A dep conflict between two tools' workspace packages manifests as a guild-level npm error.
- **npm quirks become user problems.** Hoisting behavior, phantom dependencies, resolution edge cases. These are standard monorepo problems, but the error messages dump the user into npm-land. For a user who thinks of this as "a guild" not "a JavaScript project," that's jarring.
- **`.nexus/` is gitignored but workspace state is in root `package.json`.** Not a problem — `package.json` is tracked, `node_modules` is gitignored, `npm install` after clone restores everything. Same as today, just more to resolve.

### Assessment

The happy path is invisible — `nsg tool install` handles everything, `npm install` runs under the hood. The unhappy path is where it leaks: npm resolution errors surface guild-level dependency conflicts in npm vocabulary, not guild vocabulary.

For first-time users running `nsg init`, workspaces change nothing visible. For advanced users authoring tools with deps and bundling them inline, workspaces are the natural solution.

### Migration Path

The current directory layout is already workspace-compatible: `implements/{name}/{slot}/` each with a `package.json`. Adding workspaces is additive — add the `workspaces` field to guild root `package.json`, run `npm install`. Non-breaking for existing guilds.

### Recommendation

Defer until inline-implements-with-deps becomes a real need. The Phase 1 bundle design (content-only inline, packages for tools) works for the starter kit and near-term use cases. When guilds start authoring tools in workshops and want to bundle them with deps without publishing to npm, that's the trigger to introduce workspaces.

### Trigger Conditions

Introduce workspaces when ANY of:
- A guild wants to bundle a custom implement with npm deps inline
- The `NODE_PATH` hack for MCP server resolution becomes fragile
- Guild-authored tools need deps resolved from the guild context

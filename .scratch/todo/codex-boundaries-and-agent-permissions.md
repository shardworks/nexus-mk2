# Codex Boundaries & Agent Permissions

**Status:** Placeholder — needs design work

## The Problem

Animas dispatched to a codex can read anything on disk. The codex boundary is conceptual, not enforced. This leads to:

- Agents reading sanctum docs (futures, experiments) and treating speculative ideas as canonical architecture
- Cross-codex reads with no awareness that the source is outside the agent's scope
- No distinction between "your codex" and "the rest of the filesystem"

## Observed Instance

Commission `w-mnhr98jj-9a4fd05dd0a8` (review loop spec): the seed spec pointed the anima to `/workspace/nexus-mk2/docs/future/origination-engine-architecture.md` — a sanctum-side futures doc outside the nexus codex. The anima promoted it to a load-bearing concept in its output, referencing it 7 times as established architecture.

Partially a seed spec authoring error (should have annotated the pointer as speculative), but also a systemic issue: animas have no signal about what's inside vs. outside their codex boundary.

## Questions to Explore

- Should the Loom/Manifester inject codex boundary awareness into the session context?
- Should agents have filesystem-level restrictions, or is awareness sufficient?
- How does this interact with the guild metaphor? (Animas work within the guild; the sanctum is the patron's space)
- What about legitimate cross-codex reads? (e.g., reading framework docs while working on a plugin)

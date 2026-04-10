_Imported from `.scratch/todo/codex-boundaries-and-agent-permissions.md` (2026-04-10)._

## Goal

Design how animas dispatched to a codex perceive and respect the codex boundary. Today the boundary is conceptual, not enforced — animas can read anything on disk, including sanctum-side speculative docs, and have no signal about what's inside vs. outside their scope. Decide whether the answer is awareness (context injection telling the anima what its codex is and what's outside it), enforcement (filesystem-level restrictions), or both.

## Status

Placeholder — needs design work. No implementation, no shipped mitigation.

## Next Steps

Before designing a solution, enumerate the legitimate cross-codex read patterns (e.g., reading framework docs while working on a plugin) so any awareness/enforcement scheme doesn't break them. Then sketch what "codex boundary awareness" would look like as session context — does it come from the Loom/Manifester at session launch, or from a per-codex `.claude/CLAUDE.md` (see T6.1), or both? The deterministic-enforcement question naturally pairs with T5.2 (session directory isolation), so consider whether containers solve both problems together.

## Context

**Problem.** Animas dispatched to a codex can read anything on disk. The codex boundary is conceptual, not enforced. This leads to:

- Agents reading sanctum docs (futures, experiments) and treating speculative ideas as canonical architecture
- Cross-codex reads with no awareness that the source is outside the agent's scope
- No distinction between "your codex" and "the rest of the filesystem"

**Observed instance.** Commission `w-mnhr98jj-9a4fd05dd0a8` (review loop spec): the seed spec pointed the anima to `/workspace/nexus-mk2/docs/future/origination-engine-architecture.md` — a sanctum-side futures doc outside the nexus codex. The anima promoted it to a load-bearing concept in its output, referencing it 7 times as established architecture.

Partially a seed spec authoring error (should have annotated the pointer as speculative), but also a systemic issue: animas have no signal about what's inside vs. outside their codex boundary.

**Questions to explore:**

- Should the Loom/Manifester inject codex boundary awareness into the session context?
- Should agents have filesystem-level restrictions, or is awareness sufficient?
- How does this interact with the guild metaphor? (Animas work within the guild; the sanctum is the patron's space.)
- What about legitimate cross-codex reads — e.g., reading framework docs while working on a plugin?

**Cross-link to T5.2.** The session-directory-isolation incident is the same problem viewed from a different angle: T5.2 is about "anima writes into the wrong codex," T6 is about "anima reads speculative content and treats it as canonical." Both ultimately want a real boundary. Container isolation (T5.2's recommended fix) gives enforcement; this quest's awareness question is what fills the gap if containers aren't on the table or if read-only cross-codex reads remain legitimate.

## References

- Source doc: `.scratch/todo/codex-boundaries-and-agent-permissions.md`
- Incident commission: `w-mnhr98jj-9a4fd05dd0a8` (review loop spec)
- Sanctum doc that contaminated the output: `/workspace/nexus-mk2/docs/future/origination-engine-architecture.md`
- Cross-link: T5.2 session-directory-isolation
- Child quest: T6.1 `--setting-sources user` research — closely related (per-codex CLAUDE.md as one awareness mechanism)

## Notes

- ~~T6.1 artificer default test instructions~~ — already shipped via Loom default role instructions; not opened.
- 2026-04-10: opened from .scratch import as the umbrella for T6.
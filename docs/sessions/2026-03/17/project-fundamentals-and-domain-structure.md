---
date: 2026-03-17T17:59:08Z
topic: Establishing human-owned project fundamentals — requirements and domain ontology with read-only enforcement
tags: [architecture, philosophy, workflow]
significance: high
transcript: docs/transcripts/72d94bc2-feeb-45bc-a51c-200687cd169a.jsonl
---

## Context

Sean initiated this session to address a fundamental design question: how should the project capture and protect foundational knowledge that agents must consume but never modify? Specifically, the two artifacts that represent Sean's plenary authority:

1. **Requirements** — what the system must do, must never violate, and how it must perform
2. **Vocabulary/Ontology** — the shared conceptual language and formal typed definitions for every named domain concept

The threat model is real: agents running with full permissions could easily "fix" requirements that stand in the way of a goal, unless prevented structurally.

## Key Decisions

### Two Human-Owned Artifacts

**Requirements** (functional, non-functional, invariants)
- Objectives the system is constructed to meet
- Non-negotiable by agents
- Acceptance criteria for all work

**Vocabulary — Typed Ontology**
- Shared language for humans and agents
- Two layers:
  - Prose definitions for readability and discussion
  - Formal typed ontology: every named domain concept gets a definition exported by a top-level module
- Statically verifiable source of truth (formal types are the authority)
- **Compliance is a hard gate** for agent contributions
- **Implementation behind the interfaces is opaque** — Sean owns what things are called, what they mean, what they must do; agents own everything behind the interface
- Sean envisions a possible "system REPL" for direct operator interaction with domain entities

**Mutability Process**
- Agents may propose changes to either artifact
- Sean approves or rejects
- Neither artifact is directly modifiable by agents

### Structural Protection: Read-Only Mount

Sean was rightly concerned that an agent confused about requirements could circumvent policy instructions and modify the files to match its goals. Solution: **physical enforcement**.

**Decision**: Create a separate repository (`shardworks/nexus-mk2-domain`) and mount it read-only into agent containers.

**Implementation**:
- Separate public GitHub repo: `shardworks/nexus-mk2-domain`
- Mounted at `/workspace/domain` in agent containers with `:ro` (read-only) flag
- No amount of agent confusion or desperation bypasses OS-level write protection
- Agents can read everything from local filesystem; no additional token cost
- Repository is public (the experiment is open)

**Host Location**: Sibling directory to main project (`~/sandbox/nexus-mk2-domain`)

### Directory Structure (Domain Repo)

```
requirements/
  index.md          # Prose: functional, non-functional, invariants
ontology/
  index.ts          # TypeScript: exports all domain types
README.md           # Explanation of the repo's purpose
```

Requirements granularity will evolve; starting with a single `index.md` file.

### Integration with Main Repo

- **`CLAUDE.md`** stays lean with actionable instructions and pointers
- References the domain repo at `/workspace/domain`
- Includes explicit instruction: agents do not modify domain artifacts
- Devcontainer configuration updated to mount domain repo read-only

## Actions Completed This Session

1. Created `shardworks/nexus-mk2-domain` GitHub repository (public)
2. Cloned it as a sibling directory at `/workspace/nexus-mk2-domain`
3. Seeded initial structure:
   - `requirements/index.md` with section placeholders (functional, non-functional, invariants)
   - `ontology/index.ts` with module header and TODO
   - `README.md` explaining the repo's purpose and read-only mount behavior
4. Committed and pushed initial domain structure to GitHub
5. Added host-side initialize script (`20-clone-domain-repo.sh`) to clone the domain repo before container startup if not already present
6. Updated `devcontainer.json` with the read-only bind mount for `/workspace/domain`
7. Updated `CLAUDE.md` with domain section and "do not modify" instruction
8. Resolved a git rebase conflict in `CLAUDE.md` caused by diverged local/remote main branches; merged both sides (domain pointer from new commit + tech stack and directives from prior commit)
9. Rebased and reconciled local main branch to include all changes

## Open Items / Next Steps

1. **First Requirements & Types** — Sean to begin populating `requirements/index.md` and `ontology/index.ts` with actual content
2. **Devcontainer Rebuild** — Changes to devcontainer config require a rebuild for the mount to take effect in running agent sessions

## Design Rationale

### Why a Separate Repo?
- Cleaner separation of concerns
- Domain artifacts deserve top-level visibility
- Can be versioned independently
- Clear boundary between human-owned (domain) and agent-owned (implementation)

### Why Read-Only Mount?
- **Strongest possible enforcement** — agents cannot modify files no matter what state they enter
- **Zero token overhead** — files are read from local filesystem
- **Minimal friction** — devcontainer setup is standard practice
- **Resilient** — if agents try to work around the mount, writes fail at OS level before reaching any hook

### Why TypeScript for the Ontology?
- Static verification
- Good tooling
- Types can be consumed at runtime by the system
- Clear formal interface

## Herald Notes

This session addresses a fundamental tension in AI-assisted development: how do you prevent agents from rewriting the rules when faced with goals they can't accomplish? Nexus Mk II's answer is pragmatic: separate the human-owned interface specification from the agent-owned implementation, then enforce read-only access at the filesystem level. No hooks to bypass, no code-signing schemes, just OS-level file permissions.

The session reveals something subtle about multi-agent coordination: **the real constraint isn't trust, it's architecture**. By the time an agent is confused enough to want to modify its own requirements, it's too late for instructions to help. But a read-only filesystem is a boundary no amount of confusion can cross.

The domain repo pattern — formal types as the system's interface, human-owned and read-only for agents — is worth watching as a model for how autonomous systems might maintain their own integrity without heroic amounts of human oversight.

The session also surfaced a practical reality of this kind of work: even when the design decisions are clean, the implementation involves small friction points (API overload errors causing repeated retries, a git rebase conflict requiring manual resolution). These moments are worth noting for a reader following the project — the gap between "decided" and "done" is where most of the actual work happens.

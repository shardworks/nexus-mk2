# Anima Lifecycle

This document covers how animas are composed, summoned for sessions, and equipped with tools. For the broader system context, see [overview.md](overview.md). For how animas are stored and tracked over time, see the Register section of [overview.md](overview.md#the-register).

---

## Composition

An anima is not a monolithic instruction file. It is assembled from discrete, reusable components at instantiation time:

| Component | What it provides |
|-----------|-----------------|
| **Curriculum** | Training content — skills, approach to work, craft knowledge. "What you know and how you work." |
| **Temperament** | Personality, disposition, communication style. "Who you are." |
| **Oaths** *(v2)* | Identity-level binding commitments. "What you will always/never do." |

At instantiation, the Register records which curriculum (name + version) and temperament (name + version) were assigned. The manifest engine assembles these components into the full instruction set delivered to the AI model at session time.

*Detailed specification for curricula and temperaments: see [anima-composition.md](anima-composition.md).*

---

## Summoning

When a writ becomes ready for work, the guild summons an anima for a session. The summoning sequence:

1. **Dispatch** — a standing order fires (or an operator runs `nsg consult`), naming a role.
2. **Role resolution** — the summon relay resolves the role to an active anima from the Register.
3. **Manifest** — the manifest engine assembles the anima's full instruction set: codex + curriculum + temperament + tool instructions.
4. **Launch** — the session is launched with the assembled instructions as the system prompt and the writ context as the initial prompt.
5. **Record** — a session record is written to the Daybook.

See [Dispatch Integration](writs.md#dispatch-integration) for the full sequence including writ binding and post-session lifecycle.

---

## Tools

Tools are instruments animas wield during work. They are contributed to the guild by plugins (via kit `tools` fields) and delivered to animas at manifest time.

### AnimaKit

The sessions apparatus (or manifest engine) publishes an `AnimaKit` interface that kit authors import for type safety:

```typescript
// Published by nexus-sessions (or the manifest apparatus)
interface AnimaKit {
  tools?: ToolDefinition[]
}
```

A plugin contributing tools to the anima surface satisfies `AnimaKit`:

```typescript
import type { AnimaKit } from "nexus-sessions"

export default {
  name: "nexus-git",
  kit: {
    tools: [statusTool, diffTool, logTool],
  } satisfies AnimaKit,
} satisfies Plugin
```

### Tool Definition

A tool definition is authored using the `tool()` SDK factory from `nexus-core`:

```typescript
import { tool } from "@shardworks/nexus-core";
import { z } from "zod";

export const statusTool = tool({
  name:        "git-status",
  description: "Show the working tree status",
  params: {
    path: z.string().describe("Path to the git repository"),
  },
  handler: async ({ path }, { home }) => {
    // ...
  },
});
```

### MCP Surface

Animas don't connect to individual tool servers per tool. The manifest engine launches a single MCP server process per session, configured with the full set of tools the anima's roles permit. The anima sees all of its tools as native typed tool calls.

See [kit-components.md](kit-components.md) for the tool handler model, `module` vs `script` kinds, role gating, and the MCP engine architecture.

### Tool Instructions

A tool definition may include an `instructions` field — a teaching document delivered to the anima as part of its assembled identity (system prompt). Instructions provide what an MCP schema cannot: when to use the tool, when not to, workflow context, and judgment guidance.

```typescript
export const dispatchTool = tool({
  name:         "commission-create",
  description:  "Post a new commission",
  instructions: await readFile("instructions.md", "utf8"),
  params:       { ... },
  handler:      async (...) => { ... },
});
```

Instructions are institutional, not intrinsic — the same tool installed in two different guilds can carry different instructions reflecting different policies and workflows.

### Role Gating

Tools are gated by role. An anima's available tools are the union of all tools permitted across all of its roles. See [kit-components.md](kit-components.md#role-gating) for the full role gating model and `guild.json` structure.

---

## Open Questions

- Oath storage and delivery (v2)
- Per-role model selection at manifest time
- Session resume / conversation threading

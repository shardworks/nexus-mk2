# Commission: Consult Command

## Repository

https://github.com/shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680

## Background

The Nexus CLI is the command-line interface for a multi-agent AI system organized around a **guild metaphor**.

- **Anima** — a named AI identity with a name, instructions, and lifecycle. Managed via `nexus anima`.
- **Roster** — maps roles to animas (e.g., `artificer` → "Valdris the Unwritten"). Managed via `nexus roster`.
- **Patron** — the human. Commissions work, evaluates output, and occasionally needs to speak directly with guild members.

## What I Need

A new `nexus consult` command that starts an interactive conversation between the patron (human) and a specific anima. The patron picks who they want to talk to — either by role or by name — and the CLI launches an interactive Claude Code session with that anima's identity and instructions loaded.

This is the patron walking into the guild hall and saying "bring me the artificer" or "bring me Valdris." The anima shows up, in character, ready to talk.

## Commands

### `nexus consult --role <role>`

Look up the anima assigned to the given role on the roster. Launch an interactive Claude Code session with that anima's identity and instructions.

### `nexus consult --name <anima-name>`

Same as above, but looks up the anima directly by name instead of going through the roster. The anima must exist and be active.

### `nexus consult` (no arguments)

If invoked with no arguments, show help text explaining the two modes.

## Session Setup

When launching the interactive session, the anima should know who it is. The prompt should include:

- The anima's name
- The anima's instructions
- A brief framing that this is a consultation with the patron (not a commission — there's no deliverable expected, this is a conversation)

The exact prompt wording is up to you, but the anima should feel like a named guild member having a conversation, not a generic assistant.

## What This Is NOT

- This is **not** autonomous dispatch. The session is interactive — the human types, the anima responds, back and forth.
- This does **not** create or modify any records. No commission is posted, no work is tracked. It's a conversation.
- This does **not** need to capture or store the session transcript. (That may come later, but not now.)

## Aliases

`nexus consult` is aliased as `nexus chat`.

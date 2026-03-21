# Quest: Quest Management CLI

## Repository

https://github.com/shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680

## What I Need

The Nexus CLI already exists in this repository. I need you to add a `quest` subcommand (aliased as `q`) that lets me manage coarse-grained units of work. A quest is a significant piece of work — something with weight and scope, potentially decomposable into smaller tasks later.

Right now I manage quests manually with files and shell scripts. I want the CLI to take over tracking them so I have a single place to create quests, kick off work, and check status.

## Output Convention

All commands produce JSON on stdout. This is the machine-readable output — suitable for piping, chaining, and scripting. Any human-readable commentary, progress indicators, or debug information goes to stderr.

## Commands

### `nexus quest post <spec-file>`

Registers a new quest from a spec file (a markdown document describing the work). Assigns it a short numeric ID. Prints the quest record as JSON to stdout. The quest starts in `new` status.

The content of the spec file must be stored so that it can be retrieved by subsequent commands (e.g., when the quest is sent for execution). The original file may be deleted, modified, or moved after posting — this must not affect the posted quest record.

### `nexus quest send <id>`

Dispatches work on a quest. The quest's spec is sent to an autonomous agent for execution. The command must return promptly (under 1 second) — work continues in the background. Prints the updated quest record as JSON to stdout.

The quest transitions through its full lifecycle: `new` → `in-progress` → `done` | `failed`. The `send` command initiates this — the system is responsible for updating status as work progresses and completes.

### `nexus quest status <id>`

Prints the current quest record as JSON to stdout. Must include at minimum:
- Quest ID
- Current status (`new`, `in-progress`, `done`, `failed`)
- When it was posted
- The quest title (first heading from the spec content)

### `nexus quest list`

Prints a JSON array of all quest records to stdout.

### `nexus quest delete <id>`

Removes a quest from storage entirely. Only works on quests in `new` status — returns an error if the quest is in any other state. Prints the deleted quest record as JSON to stdout.

## Storage Guarantees

- Quest data must survive process restarts — it's persisted, not in-memory.
- Quest data must not silently corrupt if the process crashes mid-write.
- Quest data must be accessible from any clone of the repository on the same machine — not tied to a specific checkout or working directory.
- Acceptable latency: human-conversation speed. This is a CLI tool, not a hot path.

## Delivery

The CLI is already runnable via `npx` from this repo. The new subcommand should work the same way.

## Constraints

- Extend the existing CLI — do not rewrite or replace the existing structure.
- Test your work end-to-end before you're done. Post a quest, send it, check its status, list all quests, delete a new quest, verify the full lifecycle works.

## How I'll Evaluate

- I will run `nexus quest post spec.md` with a sample markdown file and verify I get a JSON record with an ID back.
- I will run `nexus quest status <id>` and verify the output shows the correct state and metadata.
- I will run `nexus quest send <id>` and verify the command returns promptly and work begins in the background.
- I will run `nexus quest status <id>` again and verify the status reflects progress.
- I will run `nexus quest list` and verify all quests appear with correct info.
- I will run `nexus q post spec.md` and verify the alias works identically.
- I will post multiple quests and verify IDs are unique and sequential.
- I will kill the process and restart it and verify quest data survived.
- I will delete the original spec file after posting, then run `nexus quest status <id>` and verify the quest data is still fully available.
- I will wait for a sent quest to finish and verify its status shows `done` or `failed`.
- I will run `nexus quest delete <id>` on a `new` quest and verify it's removed from storage.
- I will run `nexus quest delete <id>` on an `in-progress` quest and verify it returns an error.
- I will pipe JSON output from one command into another tool (e.g., `jq`) and verify it parses cleanly.

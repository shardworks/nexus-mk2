# Spawning Agents — Bootstrap Phase

During the bootstrap phase (before the system can launch its own agents), use this manual recipe to run commissions.

## Prerequisites

- Claude Code CLI installed (`claude`)
- GitHub CLI installed (`gh`)
- Access to the `shardworks` GitHub org

## Recipe

### 1. Provision a repo (if needed)

```sh
# Generate a UUID-named repo — system repos aren't for humans
REPO_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
gh repo create "shardworks/$REPO_ID" --private --description "System repository — not for human consumption"
```

### 2. Set up a clean room

```sh
# Clone the target repo into a temp directory
WORKDIR=$(mktemp -d)
git clone "git@github.com:shardworks/$REPO_ID.git" "$WORKDIR/work"

# Copy the permission bypass config (required for non-interactive runs)
mkdir -p "$WORKDIR/work/.claude"
echo '{"permissions":{"allow":[],"deny":[],"additionalDirectories":[]},"bypassPermissions":true}' > "$WORKDIR/work/.claude/settings.json"
```

### 3. Run the agent

```sh
cd "$WORKDIR/work"
cat </path/to/commision.md> | claude -p \
  --output-format json-stream \
  --verbose \
  [--model <haiku|opus|sonnet>] \
  > "$WORKDIR/session.jsonl"
```

### 4. Review results

The session log at `$WORKDIR/session.jsonl` contains full structured output. The last `result` event has:
- `total_cost_usd` — dollar cost of the session
- `num_turns` — conversation turns
- `duration_ms` — wall clock time
- `usage` — token breakdown
- `subtype` — "success" or error

### Notes

- **Clean room is essential.** Always run agents from the target repo directory, never from the workshop. Agents will use whatever context is available to them.
- **`bypassPermissions` must be set.** Without it, the agent will hang waiting for permission prompts that no one can answer.
- **Use `--output-format json-stream`** to capture structured logs for later analysis.
- **Save the session log** as an experiment artifact when relevant.

# Scribe: Invocation Model

## What Triggers Scribe

Scribe is not autonomous. It does not watch for new transcripts or run on a schedule. It is invoked explicitly, either by a human or by another agent.

### Option A: Manual (recommended to start)

At the end of a session, or any time after, you invoke Scribe directly:

```bash
claude --agent scribe docs/transcripts/<session-id>.jsonl
```

Or via a slash command you define:

```
/scribe <session-id>
```

This is the simplest model and gives you full control over when synthesis happens. Start here.

### Option B: Triggered by the Stop Hook

The `on_stop.sh` hook already fires at session end. You can extend it to invoke Scribe automatically after archiving the transcript:

```bash
# At the end of on_stop.sh, after the cp:
claude --agent scribe "${DEST}" &
```

The `&` runs Scribe in the background so the Stop hook returns immediately and doesn't block Claude Code. Scribe runs async, produces the session doc, and commits it.

**Tradeoff:** This runs Scribe after every Stop event, which fires after every response — not just at true session end. You'd want to add a session-end signal, or accept that Scribe may run mid-session and be re-run at the end (it's idempotent, so this is safe but wasteful).

A cleaner version: only trigger Scribe when the Stop hook fires with `stop_hook_active: false` (i.e., a real stop, not a subagent stop). Check the payload:

```bash
STOP_HOOK_ACTIVE=$(echo "$HOOK_DATA" | jq -r '.stop_hook_active // false')
if [[ "$STOP_HOOK_ACTIVE" == "false" ]]; then
  claude --agent scribe "${DEST}" &
fi
```

### Option C: Triggered by Herald

Herald's job is to publish. Before publishing, Herald needs current session docs. Herald can invoke Scribe as a prerequisite step:

1. Herald looks for transcripts in `docs/transcripts/` with no corresponding session doc in `docs/sessions/`
2. For each unprocessed transcript, Herald invokes Scribe
3. Once all transcripts are synthesized, Herald proceeds with publishing

This makes the pipeline fully automated: hooks capture → Herald triggers Scribe → Scribe synthesizes → Herald publishes.

## Recommended Starting Point

Start with **Option A**. Manual invocation is easiest to debug and reason about. Once you've validated that Scribe is producing good output, wire it into the Stop hook (Option B) or Herald (Option C) depending on which fits your workflow better.

## The Full Pipeline

```
Session runs
  └── on_stop.sh fires
        └── transcript archived to docs/transcripts/<session-id>.jsonl

        (Option B: Scribe invoked automatically)
        (Option A: Scribe invoked manually)

  Scribe reads transcript
        └── produces docs/sessions/<yyyy-mm>/<dd>/<session-id>.md
        └── commits session doc

Herald runs (on-demand or on schedule)
        └── (Option C: invokes Scribe for any unprocessed transcripts)
        └── reads session docs
        └── produces blog post / status update / deep-dive
```

## One Caveat: Stop Fires on Every Response

The Stop hook does not fire only at "session end" in the human sense. It fires whenever Claude finishes a response and stops. In a long session, that's every single turn.

The `on_stop.sh` script handles this by overwriting the archive on every fire — so you always have the latest state. Scribe being idempotent means re-running it is safe. But if you're triggering Scribe from Stop automatically, you'll want the `stop_hook_active` guard above to avoid invoking Scribe after every message.
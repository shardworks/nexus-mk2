# Plan Workshop: Conversational Analyst Mode

## Problem

Amendment mode (implemented) handles the common case: the analyst's framing is wrong and you can articulate the correction in one shot. But sometimes you need to *explore* — probe the analyst's reasoning, ask "what if we did X instead", and iteratively steer the analysis. That requires multi-turn conversation, not one-shot amendments.

## Proposed Design

### UI

A "Chat with Analyst" button on the Decisions tab (alongside the amendment section). Opens an inline chat panel:

- **Message input** — textarea + send button at the bottom
- **Response area** — scrollable panel above showing the conversation (user messages + analyst responses)
- **Done button** — closes the chat panel, refreshes scope/decisions from disk

The chat panel replaces the decisions list while open (or overlays it — TBD).

### Backend

Each message is a `claude --print -` invocation that resumes the analyst's session:

```
claude --print - \
  --resume <analyst-session-id> \
  --system-prompt-file bin/plan-prompts/analyst-revise.md \
  --tools Read,Glob,Grep,Write \
  --setting-sources user \
  --permission-mode acceptEdits \
  --add-dir specs/ \
  --max-budget-usd 3
```

The analyst has full context from its original analysis (codebase inventory, previous scope/decisions) via session history. Each response may rewrite scope.yaml/decisions.yaml.

### API

- `POST /api/specs/:slug/analyst-chat` — `{ message: string }` → `{ response: string }`
  - Synchronous — waits for the full response before returning
  - Or SSE-streamed — sends chunks as the analyst produces them

### Session Management

- The analyst's session ID is already stored in `.meta.yml` as `sessionId`
- `--resume` reloads the session's context (codebase files, previous turns)
- Each chat message is a new turn in the same session
- The `--system-prompt-file` overrides the system prompt on resume — this is how we keep the analyst in its role

### Open Questions

1. **Should chat use `--print` (one-shot per message) or something else?** `--print` with `--resume` gives us multi-turn via session history, but each invocation is a fresh process. True streaming would need a persistent process, which is architecturally different from the current pipeline model.

2. **Session forking** — should chat fork the session or mutate it? If the patron chats, then later re-runs the analyst from scratch, the resumed session will include chat history. Forking avoids this but means the chat doesn't benefit from previous chat turns.

3. **What happens if the analyst rewrites files mid-conversation?** The decisions tab should refresh, but timing is tricky if the chat panel is open. Probably: refresh on "Done", not on every message.

4. **Cost tracking** — each chat turn is a separate `--print` invocation. The transcript capture currently happens on process close in `runPipelineStep`. Chat messages won't go through that path. Need a separate transcript capture mechanism, or accumulate usage from the `--output-format json` envelope.

5. **Clone directory** — `runPipelineStep` clones the codex to a temp dir. For chat, we'd need a persistent clone that survives across messages (or re-clone each time, which is wasteful). Could keep the clone alive for the duration of the chat session.

## Dependencies

- Amendment mode (implemented) — conversational mode builds on the same `analyst-revise.md` prompt
- Session resume working reliably with `--system-prompt-file` (confirmed in earlier sessions)

## Complexity Estimate

~5 (Fibonacci). The backend is straightforward (resume + print per message), but the UI work is non-trivial (inline chat panel, streaming responses, state management between chat and decisions view) and there are several design decisions to resolve first.

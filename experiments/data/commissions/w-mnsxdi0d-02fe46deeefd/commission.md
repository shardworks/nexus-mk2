_Imported from `.scratch/todo/plan-workshop-conversational-analyst.md` (2026-04-10)._

## Opened With

Amendment mode (already implemented) handles the common case: the analyst's framing is wrong and you can articulate the correction in one shot. But sometimes you need to **explore** — probe the analyst's reasoning, ask "what if we did X instead," iteratively steer the analysis. That requires multi-turn conversation, not one-shot amendments.

**Proposed shape:**

A "Chat with Analyst" button on the Decisions tab. Opens an inline chat panel:

- **Message input** — textarea + send button at the bottom.
- **Response area** — scrollable panel showing the conversation.
- **Done button** — closes the chat panel, refreshes scope/decisions from disk.

The chat panel replaces (or overlays) the decisions list while open.

**Backend:** each message is a `claude --print -` invocation that resumes the analyst's session:

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

The analyst has full context from its original analysis (codebase inventory, previous scope/decisions) via session history. Each response may rewrite `scope.yaml`/`decisions.yaml`.

**API:** `POST /api/specs/:slug/analyst-chat` — `{ message: string }` → `{ response: string }`, either synchronous or SSE-streamed.

**Session management:** the analyst's session ID is already stored in `.meta.yml` as `sessionId`. `--resume` reloads session context; each chat message is a new turn in the same session. The `--system-prompt-file` override keeps the analyst in its role on resume.

## Summary

Proposed feature, not yet implemented. Sits on top of the already-shipped amendment mode and the already-working session-resume + system-prompt-override pattern. Complexity estimate ~5 (Fibonacci) — backend is straightforward (resume + print per message), but the UI work is non-trivial (inline chat panel, streaming responses, state management) and several design decisions are unresolved.

**Open:**

1. **Chat transport — `--print` per message, or persistent process?** `--print` with `--resume` gives us multi-turn via session history, with each invocation a fresh process. True streaming would need a persistent process — architecturally different from the current pipeline model.
2. **Session forking — fork or mutate?** If the patron chats, then later re-runs the analyst from scratch, the resumed session will include chat history. Forking avoids this but means chat turns don't benefit from previous chat turns.
3. **Mid-conversation file rewrites.** The decisions tab should refresh, but timing is tricky if the chat panel is open. Probably: refresh on "Done," not on every message.
4. **Cost tracking.** Each chat turn is a separate `--print` invocation. The transcript capture currently happens on process close in `runPipelineStep`. Chat messages won't go through that path — need a separate transcript capture mechanism, or accumulate usage from the `--output-format json` envelope.
5. **Clone directory lifecycle.** `runPipelineStep` clones the codex to a temp dir. For chat, we'd need a persistent clone that survives across messages (or re-clone each time, which is wasteful). Probably: keep the clone alive for the duration of the chat session.

## Notes

- **Dependency:** amendment mode (shipped) — conversational mode builds on the same `analyst-revise.md` prompt.
- Session-resume + `--system-prompt-file` override was confirmed working in earlier sessions, so the core pattern is proven.
- This is adjacent to but distinct from the main task-decomposition work (parent quest). The value here is different: task decomposition is about the *output shape* of the planner; conversational analyst mode is about the *interaction loop* with it. Both can ship independently.
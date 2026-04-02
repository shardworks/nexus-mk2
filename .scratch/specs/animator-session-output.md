# Animator Session Output & Transcripts

Status: **Ready**

Package: `@shardworks/animator-apparatus` (changes) + `@shardworks/claude-code-apparatus` (changes)

---

## Problem

The Animator records structured telemetry (cost, tokens, duration, exit code) but discards the session's actual content. The claude-code provider accumulates the full NDJSON transcript internally (`StreamJsonResult.transcript`) but throws it away — only metrics survive into `SessionProviderResult`.

This blocks the Walker's review engine (needs the reviewer's structured findings from session output) and limits operational tooling (web UIs, session inspection, debugging). The transcript data exists; it just isn't surfaced.

---

## Changes

### 1. Session provider returns transcript and output

`SessionProviderResult` gains two fields:

```typescript
interface SessionProviderResult {
  // ... existing fields (status, exitCode, error, providerSessionId, tokenUsage, costUsd) ...

  /** The session's full transcript — array of NDJSON message objects. */
  transcript?: TranscriptMessage[]

  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message's text content blocks.
   * Undefined if the session produced no assistant output.
   */
  output?: string
}

/** A single message from the NDJSON stream. Untyped — shape varies by provider. */
type TranscriptMessage = Record<string, unknown>
```

The claude-code provider already accumulates `transcript` in its `StreamJsonResult` — it just needs to pass it through. For `output`, it concatenates the text content blocks from the last `assistant` message in the transcript.

### 2. SessionResult and SessionDoc gain `output`

```typescript
interface SessionResult {
  // ... existing fields ...

  /**
   * The final assistant text from the session.
   * Extracted by the Animator from the provider's transcript.
   * Useful for programmatic consumers that need the session's conclusion
   * without parsing the full transcript (e.g. the Walker's review collect step).
   */
  output?: string
}
```

`SessionDoc` gains the same `output?: string` field. Stored in the `sessions` book alongside existing session metadata.

The `output` field is intentionally small — it's the final assistant message only, not the full conversation. This keeps the sessions book lean and CDC handlers lightweight.

### 3. New `transcripts` book

The Animator contributes a second book:

```typescript
supportKit: {
  books: {
    sessions: {
      indexes: ['startedAt', 'status', 'conversationId', 'provider'],
    },
    transcripts: {
      indexes: ['sessionId'],
    },
  },
  // ...
},
```

One record per session:

```typescript
interface TranscriptDoc {
  id: string                          // same as session id — 1:1 relationship
  messages: TranscriptMessage[]       // full NDJSON transcript
}
```

The transcript is written to the `transcripts` book at session completion, in the same recording step as the session result (step 5 in the animate lifecycle). If the transcript write fails, the error is logged but does not propagate — same error handling as the session record write.

### 4. Animator recording changes

The `buildSessionResult` function gains `output` from the provider result. The `recordSession` function writes to both books:

```typescript
// In recordSession():
async function recordSession(
  sessions: Book<SessionDoc>,
  transcripts: Book<TranscriptDoc>,
  result: SessionResult,
  transcript: TranscriptMessage[] | undefined,
): Promise<void> {
  // Session record (existing — now includes output)
  try {
    await sessions.put(toSessionDoc(result));
  } catch (err) {
    console.warn(`[animator] Failed to record session ${result.id}: ${err}`);
  }

  // Transcript record (new)
  if (transcript && transcript.length > 0) {
    try {
      await transcripts.put({ id: result.id, messages: transcript });
    } catch (err) {
      console.warn(`[animator] Failed to record transcript for ${result.id}: ${err}`);
    }
  }
}
```

### 5. Claude-code provider changes

Minimal — the data already exists:

```typescript
// In spawnClaudeStreamJson — the transcript is already accumulated in acc.transcript
// Just pass it through:
resolve({
  exitCode: code ?? 1,
  transcript: acc.transcript,              // already here
  output: extractFinalAssistantText(acc.transcript),  // new
  costUsd: acc.costUsd,
  tokenUsage: acc.tokenUsage,
  providerSessionId: acc.providerSessionId,
});
```

`extractFinalAssistantText` walks the transcript backwards to find the last `assistant` message and concatenates its text content blocks:

```typescript
function extractFinalAssistantText(transcript: TranscriptMessage[]): string | undefined {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const msg = transcript[i]
    if (msg.type !== 'assistant') continue

    const message = msg.message as Record<string, unknown> | undefined
    const content = message?.content as Array<Record<string, unknown>> | undefined
    if (!content) continue

    const text = content
      .filter(block => block.type === 'text' && typeof block.text === 'string')
      .map(block => block.text as string)
      .join('')

    return text || undefined
  }
  return undefined
}
```

Same change applies to `spawnClaudeStreamingJson`.

---

## What does NOT change

- **AnimatorApi interface** — `summon()` and `animate()` signatures are unchanged. The `AnimateHandle` shape is unchanged.
- **Session lifecycle** — no new steps. Transcript recording piggybacks on the existing step 5 (record result).
- **Streaming** — chunk handling is unaffected. The transcript is captured from the accumulated NDJSON, not from the chunk stream.
- **Caller metadata** — the `metadata` field is unchanged. `output` is a sibling, not nested inside metadata.
- **Error handling contract** — same guarantees. Transcript write failure is logged, never propagated.

---

## Data Scale

- Typical transcript: 500KB–5MB (varies with session length and tool use)
- 3 sessions per Walker commission × ~20 commissions/day = ~30–300MB/day in the transcripts book
- SQLite handles this comfortably — single-row primary key lookups are microseconds regardless of row size
- The transcripts book has no CDC handlers by default — no amplification concern
- Retention/archival is a future concern (months away at this growth rate)

---

## Commission Scope

This is a small, focused change. One commission, no decomposition needed.

**Deliverables:**
1. Add `transcript` and `output` to `SessionProviderResult` type
2. Add `output` to `SessionResult` and `SessionDoc` types
3. Add `TranscriptDoc` type
4. Add `transcripts` book to Animator supportKit
5. Update `recordSession` to write both books
6. Update `buildSessionResult` to populate `output` from provider result
7. Update `toSessionDoc` to include `output`
8. Add `extractFinalAssistantText` to claude-code provider
9. Pass `transcript` and `output` through from both spawn functions
10. Tests: verify output extraction, transcript recording, error handling (transcript write failure doesn't mask session result). **UNIT TESTS ARE REQUIRED** for acceptance

**Does NOT include:** transcript inspection tools (future), transcript retention/archival, web UI integration.

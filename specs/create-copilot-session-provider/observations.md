# Observations: create-copilot-session-provider

## Doc/Code Discrepancies

1. **claude-code.md MCP transport type**: The doc at `docs/architecture/apparatus/claude-code.md` describes the MCP config as `type: "http"` with URL `http://127.0.0.1:PORT/mcp`, but the code uses `SSEServerTransport` with `type: 'sse'` and URL `http://127.0.0.1:PORT/sse`. The doc should be updated to match the code.

2. **Stale provider discovery doc**: `docs/architecture/index.md` (line ~471) says "MVP: one hardcoded provider (claude-code). Future: provider discovery via kit contributions or guild config." But `guild.json["animator"]["sessionProvider"]` already works — the config-based discovery is implemented. The doc is stale.

## Refactoring Opportunities

3. **extractFinalAssistantText could be shared**: Both the claude-code and copilot providers need to extract the final assistant text from a transcript. The claude-code version walks Anthropic-format messages; the copilot version will walk OpenAI-format messages. If a third provider is ever added, this pattern will repeat. A shared utility with a format-aware strategy could reduce duplication — but it's premature now with only two providers.

4. **MCP server callableBy filtering is redundant**: The MCP server in `claude-code/src/mcp-server.ts` filters tools by `callableBy: 'anima'`, but the Instrumentarium's `resolve()` already filters by caller. The MCP server filter is defense-in-depth but could be documented as redundant to avoid future confusion about where filtering is authoritative.

5. **SessionProviderConfig.cwd and environment are subprocess-specific**: These fields only make sense for providers that spawn processes. An HTTP-based provider ignores both. If more HTTP-based providers are added, the interface could be split into a base config (systemPrompt, initialPrompt, model, tools, streaming) and a process-specific extension (cwd, environment, conversationId). Not worth doing for two providers, but worth noting.

## Potential Risks

6. **Token usage reporting across tool-call rounds**: The copilot provider's agentic loop makes multiple API calls per session. Accumulating token usage correctly (summing across calls) requires careful bookkeeping. The claude-code provider doesn't face this because the Claude CLI reports cumulative usage in its result message.

7. **Zod v4 toJSONSchema() dependency**: The recommended approach for converting tool schemas uses Zod's built-in `.toJSONSchema()`. This is a Zod v4 feature. If the codebase ever downgrades Zod (unlikely given 4.3.6 is already in use), this would break. The alternative (manual JSON Schema construction) is more work but has no version coupling.

8. **No integration test path for the copilot provider**: The claude-code provider's tests exercise parsing logic (stream-parser.test.ts, mcp-server.test.ts) but not the actual `claude` binary interaction. The copilot provider will similarly need to mock `fetch()` in tests. There's no established pattern in the codebase for mocking `fetch()` — the test will need to establish one (likely by injecting a fetch function or using Node's built-in test mocking).

## Adjacent Items

9. **Conversation resume (Parlour integration)**: The Parlour apparatus manages multi-turn conversations and currently works with claude-code's `--resume` flag. Making the Parlour work with the copilot provider would require message history persistence and replay. This is out of scope for this commission but is a natural follow-on.

10. **Model validation**: Currently `guild.json["settings"]["model"]` is a free-form string passed through to the provider. When the copilot provider is active, operators need to set a GitHub Models-compatible model name (e.g. "gpt-4o") instead of "sonnet". There's no validation that the model name matches the active provider. A future improvement could warn operators about model/provider mismatches at startup.

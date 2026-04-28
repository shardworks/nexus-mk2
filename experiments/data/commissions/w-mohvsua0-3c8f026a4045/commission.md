`packages/framework/cli/src/commands/signal.ts:124–128` declares `SignalHandlerInput { name; payloadJson? }`. After D16 (resolve clockworks once, call validateSignal then emit), the input shape stays the same but the handler body shrinks substantially — the `clerk` resolution, `declaredEvents`/`writTypes` plumbing, and inline validator call all drop.

Worth a focused review after the diff lands to ensure the test surface (`signal.test.ts`) loses every unused mock helper. The current test file has stub `Clerk` and `GuildConfig` builders that become dead code; leaving them in compounds noise.

**Files**: `packages/framework/cli/src/commands/signal.ts`, `packages/framework/cli/src/commands/signal.test.ts`.
**Action**: After C1 lands, prune unused stub helpers from `signal.test.ts`.
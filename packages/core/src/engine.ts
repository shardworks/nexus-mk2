/**
 * Engine SDK — the authoring interface for clockwork engines.
 *
 * Use `engine()` to define a clockwork engine that responds to guild events.
 * The returned definition is what the Clockworks runner imports and calls.
 * Static engines (manifest, ledger-migrate, etc.) do NOT use this factory —
 * they have bespoke APIs and are called directly by framework code.
 *
 * @example
 * ```typescript
 * import { engine } from '@shardworks/nexus-core';
 *
 * export default engine({
 *   handler: async (event, { home }) => {
 *     // event is the triggering GuildEvent when invoked by a standing order
 *     // event is null when invoked directly (CLI, import)
 *     if (event) {
 *       console.log(`Handling ${event.name}`, event.payload);
 *     }
 *   }
 * });
 * ```
 */

/** An immutable fact from the event log — the input to clockwork engines. */
export interface GuildEvent {
  id: number;
  name: string;
  payload: unknown;
  emitter: string;
  firedAt: string;
}

/** Framework-provided context injected into every engine handler call. */
export interface EngineContext {
  /** Absolute path to the guild root. */
  home: string;
}

/**
 * A fully-defined clockwork engine — the return type of `engine()`.
 *
 * The Clockworks runner calls `.handler(event, { home })` when a standing
 * order fires. The `__clockwork` brand is used at load time to distinguish
 * clockwork engines from static engines.
 */
export interface EngineDefinition {
  readonly __clockwork: true;
  readonly handler: (event: GuildEvent | null, ctx: EngineContext) => Promise<void>;
}

/**
 * Define a clockwork engine.
 *
 * This is the SDK entry point for event-driven engines. Pass a handler
 * function that receives a GuildEvent (or null for direct invocation)
 * and an EngineContext.
 */
export function engine(def: {
  handler: (event: GuildEvent | null, ctx: EngineContext) => Promise<void>;
}): EngineDefinition {
  return {
    __clockwork: true,
    handler: def.handler,
  };
}

/** Type guard: is this module export a clockwork engine? */
export function isClockworkEngine(obj: unknown): obj is EngineDefinition {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '__clockwork' in obj &&
    (obj as EngineDefinition).__clockwork === true &&
    typeof (obj as EngineDefinition).handler === 'function'
  );
}

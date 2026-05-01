/**
 * Tool bag — every CLI tool the Laboratory contributes.
 *
 * The framework auto-discovers `supportKit.tools` and registers each
 * with the Instrumentarium for CLI dispatch. Hyphen-prefix grouping
 * gives `nsg lab <subcommand>` for tools named `lab-<subcommand>`.
 */

import trialPost from './trial-post.ts';

// Untyped array: `ToolDefinition` is generic over the schema shape and
// each tool's handler narrows the params type — typing the array as
// `ToolDefinition[]` would force erasure to `Record<string, unknown>`.
// The Instrumentarium scans the array structurally; no array-level
// type annotation is needed (matches clerk's `tools:` precedent).
export const tools = [trialPost];

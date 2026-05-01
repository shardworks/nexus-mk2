/**
 * Tool bag — every CLI tool the Laboratory contributes.
 *
 * The framework auto-discovers `supportKit.tools` and registers each
 * with the Instrumentarium for CLI dispatch. Hyphen-prefix grouping
 * (≥2 tools sharing a prefix) gives `nsg lab <subcommand>` for tools
 * named `lab-<subcommand>`. With four `lab-` tools, the grouping
 * activates and all four become subcommands of `nsg lab`.
 */

import trialPost from './trial-post.ts';
import trialShow from './trial-show.ts';
import trialExtract from './trial-extract.ts';
import trialExportBook from './trial-export-book.ts';

// Untyped array: `ToolDefinition` is generic over the schema shape and
// each tool's handler narrows the params type — typing the array as
// `ToolDefinition[]` would force erasure to `Record<string, unknown>`.
// The Instrumentarium scans the array structurally; no array-level
// type annotation is needed (matches clerk's `tools:` precedent).
export const tools = [
  trialPost,
  trialShow,
  trialExtract,
  trialExportBook,
];

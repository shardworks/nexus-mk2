# Observations — loom-page-for-oculus

## Doc/Code Discrepancy: System Prompt Composition Order

The `docs/architecture/apparatus/loom.md` documents the composition order as:
1. Guild charter
2. Curriculum (future)
3. Temperament (future)
4. Role instructions
5. Tool instructions

But the actual code in `loom.ts` (lines 249–270) assembles: charter → **tool instructions** → **role instructions**. Tool instructions come before role instructions in the code, but the doc says the opposite. This matters because layer ordering affects how the LLM weights instructions.

Not in scope for this commission — but should be reconciled (either update the doc to match code, or decide the doc is correct and reorder the code).

## First Page Contributor

The Loom page will be the **first real `supportKit.pages` contributor** in the codebase. The feature is well-supported by the Oculus (scanning, chrome injection, file serving all work), but there's no prior art to reference for conventions around page directory layout, asset organization, or JavaScript patterns within contributed pages. Whatever patterns the Loom page establishes will likely be copied by future page contributors.

## Stale Source Comment

`loom.ts` line 16 references `docs/specification.md (loom)` which does not exist. The actual doc is at `docs/architecture/apparatus/loom.md`. Same stale reference appears in `index.ts` line 8.

## Potential Future: Role Instructions Preview

The page shows the final composed system prompt, but doesn't break it down into its constituent layers (charter vs. tool instructions vs. role instructions). A future enhancement could show the prompt with layer boundaries highlighted, making it easier to understand what contributed each section. Not in scope — the brief asks for the "final System Prompt after weaving."

## Potential Future: Live Weave Updates

Kit roles can arrive late via `plugin:initialized`. If a user has the roles page open during guild startup, the role list could go stale. A future enhancement could use Server-Sent Events or polling to refresh the role list. Not in scope — the page is a static snapshot tool, not a live monitor.

## Kit Role Permission Filtering May Surprise

The `registerKitRoles` function silently drops permissions that reference plugins not in the kit's `requires`/`recommends` list (dependency-scoped validation). The `listRoles()` output will show the *filtered* permission set, which may differ from what the kit author originally declared. This is correct behavior (the Loom only grants permissions the kit is authorized to reference), but could be confusing to an operator who sees fewer permissions than expected. Consider adding a note or indicator on the page — but this is outside the brief's scope.

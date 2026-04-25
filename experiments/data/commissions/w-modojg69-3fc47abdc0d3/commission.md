## Context

The 'piece' name is being repurposed at a higher layer in the work hierarchy — as the recursive decomposition node beneath features in the product/feature/piece/mandate ladder (settled in click c-mod53ood). To free up the term, the existing Spider concept currently called 'piece' (an atomic sequential task inside a mandate, picked up by implement-loop) needs to be renamed to 'step'.

## Goal

Rename the execution-layer 'piece' concept to 'step' across the codebase. Semantically: pieces decompose features at the planning layer; steps decompose mandates at the execution layer.

## Scope

- Spider plugin (implement-loop, piece-session engine, related types and tests)
- Clerk plugin (piece-add tool — likely renames to step-add)
- Any writ-type registration that names 'piece' as a type
- Documentation and architecture references in /workspace/nexus/docs/architecture/
- CLI tool ids and surfaces

## Acceptance criteria

- All execution-layer references to 'piece' in code, tools, and docs renamed to 'step' (or canonical equivalents like 'sequential-step' where disambiguation is needed)
- Tests updated and passing
- Architecture docs updated to reflect the rename
- A vocabulary-aliases entry added (per docs/future/vocabulary-aliases.yaml) mapping 'piece' (execution-layer) → 'step' so historical references resolve
- No remaining references to 'piece' as an execution-layer concept in the active codebase

## Out of scope

- The planning-layer 'piece' (recursive decomposition node above mandate) does NOT exist yet — this commission only renames the existing execution concept. Introducing the planning-layer piece is a separate future commission tied to the broader vision/feature/piece writ-type implementation.
- No semantic changes to how implement-loop processes steps (sequential execution behavior unchanged) — naming only.

## Notes

- Cross-reference: planning-layer 'piece' decision in click c-mod53ood
- Cross-reference: vision/product writ-type implementation pending under c-mod53o6h subtree
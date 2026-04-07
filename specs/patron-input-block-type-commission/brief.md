# Patron Input Block Type — Commission Brief

## Problem

Engines sometimes need patron decisions before they can proceed. But currently, engines can't block on patron input, the Spider can't track whether answers are pending, and there's no tooling to submit responses.

The engine blocking infrastructure (block types, checkers, `rig-resume`) provides the mechanism. What's missing is a block type purpose-built for structured patron input — with a typed question format, answer validation, and CLI tools for the patron to respond.

## Goal

An engine can pose a structured set of questions to the patron, block until all questions are answered and the patron marks the request complete, then resume with the answers available.

## Design Decisions

These decisions were made during design and should be treated as constraints, not suggestions.

### Question types

Three question types: **choice**, **boolean**, and **text**.

Choice questions have a `Record<string, string>` options map (key → display label) and an `allowCustom` flag. When `allowCustom` is true, the patron can supply a freeform answer instead of selecting from the options.

### Choice answer discrimination

Choice answers use a discriminated object — `{ selected: string } | { custom: string }` — not a bare string. This prevents ambiguity between a typo'd option key and an intentional custom answer. The CLI tool should use explicit flags (`--select` vs `--custom`) to determine which variant to produce. `selected` is validated against the options map; `custom` is only accepted when `allowCustom` is true.

### Request lifecycle: pending → completed | rejected

Input requests have three statuses: `pending`, `completed`, and `rejected`.

Completion is two-phase: answering individual questions does not unblock the engine. The patron explicitly marks the request complete (after all questions are answered) or rejects it. Rejection triggers checker failure (`{ status: 'failed', reason: '...' }` via `CheckResult`), which fails the engine and cascades to rig/writ failure through the standard path.

### Engine resume via book query, not priorBlock

On resume, engines query the `input-requests` book by `rigId` + `engineId` + `status: 'completed'` (most recent) rather than relying on `priorBlock.condition.requestId`. This is deliberate: `priorBlock` is in-memory only and doesn't survive process restarts. The query approach also handles multi-block naturally — an engine that blocks for input multiple times creates a fresh request each time, and the query always returns the latest completed one.

Request IDs use the system's standard ULID format.

### `rigId` on `EngineRunContext`

`EngineRunContext` (in `@shardworks/fabricator-apparatus`) currently only has `engineId`, `upstream`, and `priorBlock`. This commission must add `rigId: string` — the Spider already has it when assembling context, it just needs to pass it through. This is generally useful for any engine, not just patron-input.

### Storage

Input requests live in a Spider-owned Stacks book (`spider/input-requests`). The engine writes the request document before returning blocked; the patron fills in answers via CLI tools; the engine reads the completed document on resume.

### Checker

Block type ID: `patron-input`. Condition: `{ requestId: string }`. Poll interval: 10s. Returns `cleared` when request is completed, `failed` (with reason) when rejected, `pending` otherwise.

### CLI tools

The patron interface is CLI tools — no TUI, no interactive prompts. The tools:

- **List** pending input requests
- **Show** a single request with all questions and current answers
- **Answer** a single question (with type-appropriate validation)
- **Complete** a request (rejects if any questions unanswered)
- **Reject** a request (with optional reason)
- **Export/import** as YAML (stretch — include if low cost)

## Out of Scope

- UI or advanced UX beyond CLI tools
- Push notifications when input is needed
- Partial completion (answer some, unblock, ask more later)
- Multi-patron (access control, assignment, approval chains)
- Input request templates (engines build requests programmatically)
- Coco integration (Coco could surface pending requests — that's Coco-side, not Spider infrastructure)

## Dependencies

- Engine blocking infrastructure — already implemented
- Block checker failure signal (`CheckResult` with `'failed'` status) — already implemented
- Stacks book registration, CLI tool registration via kit — existing patterns

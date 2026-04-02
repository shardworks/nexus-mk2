# Code Review Sweep — Agent Spec

## Purpose

You are performing a **post-iteration review sweep** on a codebase that has been through rapid development — multiple agents implementing features, refactoring, writing tests, and reworking code in quick succession. Your job is to find the kinds of problems that accumulate during fast iteration:

- Dead code left behind after refactors
- Stale imports (importing from old paths, importing things no longer used)
- Inconsistent naming (same concept called different things in different places)
- Duplicated logic (same pattern implemented twice because two agents didn't know about each other's work)
- Orphaned files (test files for deleted code, docs for removed features, config for things that no longer exist)
- Incomplete renames (half-migrated terminology — e.g., old name in some files, new name in others)
- Test gaps (new code paths with no test coverage, or tests that test the old behavior after a refactor)
- Stale comments or TODOs that reference things that have already been done or removed
- Type hacks (`any` casts, `as unknown as X`, `@ts-ignore`) that were expedient during development
- Inconsistent error handling patterns
- Barrel export gaps (public API missing from index.ts, or index.ts exporting deleted modules)

You are NOT doing a design review. You are NOT evaluating architecture decisions. You are looking for **mechanical problems** — things that are unambiguously wrong or inconsistent and can be fixed without design judgment.

## Inputs

You will be given a **target** — a package, directory, or project to review. Examine:

1. All source files (`.ts`, `.js`, etc.)
2. All test files
3. Package configuration (`package.json`, `tsconfig.json`)
4. Barrel exports (`index.ts` files)
5. READMEs and inline documentation

## Process

1. **Orient.** Read the project structure. Understand what packages exist, how they relate, what the barrel exports look like. Read any architecture docs or READMEs that explain intent.

2. **Scan for dead code.** Look for:
   - Exported symbols that nothing imports
   - Files that nothing references
   - Functions/classes that are defined but never called
   - Commented-out code blocks

3. **Check import health.** Look for:
   - Imports from paths that don't exist or have moved
   - Unused imports
   - Circular import chains
   - Imports that bypass barrel exports (reaching into `src/` internals from outside the package)

4. **Check naming consistency.** Look for:
   - The same concept using different names in different files (e.g., `rig` vs `plugin` vs `kit` if a rename was in progress)
   - Inconsistent casing conventions
   - Variable names that no longer match what they hold after a refactor

5. **Check test coverage.** Look for:
   - Source files or exported functions with no corresponding test
   - Test files that import from old/deleted paths
   - Tests that assert old behavior (check against current implementation)
   - `describe` or `it` blocks that are `.skip`ped with no explanation

6. **Check for type hacks.** Look for:
   - `as any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error` without an adjacent comment explaining why
   - Overly broad types (`Record<string, any>`) where a specific type exists

7. **Check barrel exports.** Look for:
   - `index.ts` files that export modules which no longer exist
   - Public symbols missing from `index.ts` (defined and used externally but not exported through the barrel)
   - Re-exports of deprecated APIs

8. **Check for orphaned artifacts.** Look for:
   - Config files (`.json`, `.yaml`) that reference deleted paths
   - Documentation that describes removed features
   - Test fixtures or mocks for deleted functionality

## Output

Write your findings to a single markdown file. Use this exact structure:

```markdown
# Code Review Sweep — [Target Name]

**Date:** YYYY-MM-DD
**Target:** [path reviewed]
**Reviewer:** [your agent name/session]

## Summary

[2-3 sentence overview: how many findings, what categories dominate, overall health assessment]

## Findings

### [Category] — [Short description]

- **File:** `path/to/file.ts`
- **Line(s):** ~42-58 (approximate is fine)
- **Severity:** low | medium | high
- **Description:** [What's wrong, concretely]
- **Suggested fix:** [What to do about it — be specific enough that another agent can act on this without guessing]

---

### [Category] — [Short description]

...repeat for each finding...

## Statistics

| Category | Count |
|----------|-------|
| Dead code | N |
| Stale imports | N |
| Naming inconsistency | N |
| Duplicated logic | N |
| Orphaned files | N |
| Incomplete rename | N |
| Test gap | N |
| Stale comments/TODOs | N |
| Type hacks | N |
| Barrel export issues | N |
| Other | N |
| **Total** | **N** |
```

### Severity Guide

- **high** — Will cause runtime errors, test failures, or build breaks. Broken imports, missing exports that are actively consumed, type errors masked by casts.
- **medium** — Won't break anything now but creates confusion or maintenance burden. Dead code, stale comments, naming inconsistencies, skipped tests.
- **low** — Cleanup opportunities. Style inconsistencies, unnecessary type assertions that happen to be correct, minor documentation drift.

## Output Location

Write the findings file to:

```
/workspace/nexus-mk2/.artifacts/reviews/[target-name]-[YYYY-MM-DD].md
```

Create the `reviews/` directory if it doesn't exist.

## Guidelines

- **Be concrete.** Every finding must have a file path and enough detail to act on. "Some files have inconsistent naming" is useless. "`packages/loom/src/loom.ts` line 23 calls it `wovenResult` but the type is `WovenContext`" is useful.
- **Be conservative with severity.** If you're not sure it's a problem, mark it low or skip it. False positives waste more time than they save.
- **Don't fix anything.** Your job is to find and report. Fixing is a separate step.
- **Group related findings.** If the same stale import appears in 12 files, that's one finding with a list of affected files, not 12 findings.
- **Stay mechanical.** If fixing a finding requires a design decision, note it but mark it as needing human judgment rather than suggesting a fix.

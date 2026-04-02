# Documentation Audit

Examine the package provided in the input prompt and produce a comprehensive documentation quality report. The prompt contains the **absolute path to a single package directory** (e.g. `/workspace/nexus/packages/plugins/stacks`).

Write the report to:

```
/workspace/nexus-mk2/.artifacts/doc-audit/{package-name}-{timestamp}.md
```

Where `{package-name}` is the package directory name (e.g. `stacks`, `arbor`).

---

## Audit Procedure

### Phase 1: Discover

1. Read the package's `package.json` — name, dependencies, plugin type.
2. Read `src/index.ts` (barrel) to map the public API surface.
3. Check for existence of:
   - `README.md` in the package root
   - An entry in `/workspace/nexus/docs/architecture/index.md`
   - An apparatus spec at `/workspace/nexus/docs/architecture/apparatus/{name}.md` (if the package exports an `apparatus` plugin shape)
4. Collect all documentation files relevant to this package.

### Phase 2: Assess Documentation

For each documentation file, read it completely, then read the corresponding source code to verify its claims. Evaluate on three axes:

- **Currency** — is it up-to-date with the current code? Flag stale references, removed APIs still documented, new APIs not yet documented.
- **Coherence** — is it internally consistent? Does it align with other system documents (architecture index, other READMEs, the guild metaphor)?
- **Comprehensiveness** — given its scope and audience, does it cover what it should? Flag significant gaps.

Record specific findings with file paths and line references where possible.

#### README

Check against the structure in `/workspace/nexus/docs/DEVELOPERS.md` § README Standards:

- Required sections present? (Description, Installation, API, Configuration where applicable)
- Style guidance followed? (Lead with usage, real examples, precise types, current with code)
- For apparatus: documents the `provides` API, kit interface (if `consumes`), and support kit?
- For kits: documents contributions, `requires`, and `recommends`?

#### Architecture Index

Read `/workspace/nexus/docs/architecture/index.md`:

- Is this package mentioned? Is the description accurate?
- For significant packages (apparatus, core framework), absence is a finding.
- For small utilities, note absence but don't flag as an issue.

#### Apparatus Spec

If the package is an apparatus, check `/workspace/nexus/docs/architecture/apparatus/{name}.md` against the template at `/workspace/nexus/docs/architecture/apparatus/_template.md`:

- Follows the template structure?
- TypeScript interfaces current with actual implementation?
- Behavioral sections accurate?
- Open questions still relevant, or resolved in code?

### Phase 3: Assess Code–Documentation Alignment

**JSDoc coverage.** Enumerate all exports from `src/index.ts`, following re-exports to source files. For each exported symbol: does it have JSDoc? Is the JSDoc accurate? Does it align with the documentation files? Report totals (exported symbols, with JSDoc, with accurate JSDoc) and list specific gaps.

**Test–documentation alignment.** Read all `*.test.ts` files. Map test descriptions to documented behaviors. Flag:
- Behaviors documented but not tested
- Behaviors tested but not documented
- Tests that contradict documentation

**Behavioral fidelity.** For each major documented API method, trace the implementation. Check:
- API signatures match documented signatures
- Documented behavior is actually implemented
- Edge cases described in docs are handled in code
- Error handling matches documented contracts
- Default values match what's documented

### Phase 4: Write Report

Compile findings into the report structure below. Assign severity:

| Severity | Meaning |
|----------|---------|
| **Critical** | Documentation is actively misleading (says X, code does Y) |
| **High** | Significant gap that would block or confuse a consumer |
| **Medium** | Notable omission or staleness |
| **Low** | Minor quality issue (style, optional sections, wording) |

---

## Report Structure

```markdown
# Documentation Audit — `@shardworks/{package-name}`

**Date:** {YYYY-MM-DD}
**Package:** {absolute path}

## Summary

{2-3 sentence overall assessment. Note finding counts by severity.}

## Structural Checks

### README
{Exists? Follows DEVELOPERS.md standards?}

### Architecture Index
{Listed? Description accurate?}

### Apparatus Spec
{Apparatus only. Exists? Follows template? Current?}

## Documentation Quality

### {Document Title} — `{relative path}`

- **Currency:** {assessment}
- **Coherence:** {assessment}
- **Comprehensiveness:** {assessment}
- **Findings:** {bulleted list, or "No issues found."}

{Repeat for each documentation file.}

## Code–Documentation Alignment

### JSDoc Coverage
{Totals and specific gaps.}

### Test–Documentation Alignment
{Gaps in both directions, contradictions.}

### Behavioral Alignment
{Signature mismatches, unimplemented documented behavior, edge case gaps.}

## Findings Summary

| # | Severity | Category | Finding |
|---|----------|----------|---------|
| 1 | {severity} | {structural/quality/alignment} | {one-line summary} |
```

---

## Reference Documents

Read these before auditing — they define the standards:

- `/workspace/nexus/docs/DEVELOPERS.md` — README standards, package conventions, documentation layers
- `/workspace/nexus/docs/architecture/index.md` — architecture overview (check for package presence and accuracy)
- `/workspace/nexus/docs/architecture/apparatus/_template.md` — apparatus spec template
- `/workspace/nexus/docs/guild-metaphor.md` — conceptual vocabulary (for coherence checks)

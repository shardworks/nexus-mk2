`docs/architecture/apparatus/clerk.md:273` reproduces the `WritDoc` interface from `packages/plugins/clerk/src/types.ts:36` by hand. There is no tooling keeping these in sync: the doc and source drifted by the same one-character defect independently. Similar hand-transcribed TypeScript listings exist throughout `docs/architecture/apparatus/` (the template at `_template.md` prescribes a 'Supporting Types' section with code listings).

Options a future commission could consider:
- A doctest-style extractor that fails CI when a listing disagrees with its corresponding source file.
- A convention that architecture docs reference source files by path/line rather than hand-copy.
- Accept the drift risk and rely on reviewers / follow-up cleanups (the current de-facto policy).
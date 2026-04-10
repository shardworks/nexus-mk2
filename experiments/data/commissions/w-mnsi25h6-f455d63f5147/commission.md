## Opened With

Smoke test for the Spider opt-in dispatch refactor (commit 70988c1). Before this change, quest writs would be grabbed by the default-template catch-all and dispatched to a rig, failing fast with "Writ has no codex — cannot open a draft binding." After this change, quest writs should remain inert because `quest` has no entry in `rigTemplateMappings`.

## Summary

Expected behavior: this quest is posted, lands in the clerk's books, and stays in `ready` (or whatever initial status). Spider's crawl loop should see it and skip (no mapping for type `quest`). No rig should be spawned for this writ.

## Notes

- 2026-04-10: posted as smoke test for opt-in dispatch refactor
The originating brief (`w-moecg331-fd7efad8df99`) and parent click `c-moe0l7bl` describe the predicted-files gate as living "at the Astrolabe spec-publish engine" / "the planning stage," but `astrolabe.spec-publish` was retired by the plan-and-ship retirement commission. The implementation will land in `astrolabe.plan-finalize`, the modern equivalent.

The brief itself does not need to be edited (it is a closed mandate writ at this point), but the broader research clicks (especially `c-moe0l7bl`, `c-moe1tb5k`, `c-moe1b73b`, `c-moe1bd71`) should be annotated or have a follow-up child click added so future readers tracking the predicted-files-gate intervention reach the right engine name. Without that pointer, anyone reading those clicks fresh will spend time hunting for `spec-publish` in the codebase before finding the negative tests in `plan-and-ship.test.ts:131-135` that explain its retirement.

Files / artifacts:
- Click `c-moe0l7bl` and its descendants — append a note that the v0 engine target is `astrolabe.plan-finalize`.
- Possibly `docs/architecture/apparatus/astrolabe.md` — update if it still refers to spec-publish anywhere.

This is a documentation/lineage fix, not a code change.
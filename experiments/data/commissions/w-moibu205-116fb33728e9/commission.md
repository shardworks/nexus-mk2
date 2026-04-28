While auditing `core-api.md` against the live nexus-core export list, several plugin packages turned up with READMEs that may carry similar v1 residue (the `core-api.md` problem repeated at smaller scale per plugin). Specific candidates worth a quick pass:

- `packages/plugins/clerk/README.md` — verify it describes `ClerkApi.post/transition/list/...` and not the v1 `createWrit`/`updateWritStatus`/`completeWrit` surface.
- `packages/plugins/clockworks/README.md` — verify `clockTick`/`clockRun` are not mentioned (they no longer exist; the apparatus surface is `processEvents`/`processSchedules`).
- `packages/plugins/animator/README.md` — verify it describes `summon`/`animate`/`AnimateHandle` and not v1 `launchSession`/`SessionRecord`/`createTempWorktree`.
- `packages/plugins/parlour/README.md` — verify it describes `ParlourApi.create/takeTurn` and not top-level `createConversation`/`takeTurn` functions.

This is a follow-up sweep, not part of the present commission. Lift if confirmed staleness; ignore if READMEs are fresh.
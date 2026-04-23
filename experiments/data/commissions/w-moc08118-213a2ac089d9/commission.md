`docs/architecture/apparatus/astrolabe.md` line 23 describes the Clerk dependency as:

> **Clerk** — the spec-writer engine posts the generated writ as the final output of the planning pipeline.

Under the current combined `plan-and-ship` rig this is wrong twice over: (1) the spec-writer no longer posts a writ at all — `plan-finalize` yields `{ spec }` straight into the downstream `implement` engine (see line 130 in the same file: "No `mandate` writ is posted by this rig"), and (2) the one engine that *does* call `clerk.post()` is now `astrolabe.observation-lift`, which creates draft child `brief` writs from `plan.observations`, not a single final generated writ.

Suggested replacement: describe Clerk as a dependency because `astrolabe.observation-lift` fan-outs draft child `brief` writs under the originating brief. Neighbour to the `refines`-diagram issue this commission fixes; filed as a separate observation so the patron can decide whether to sweep it in the same pass or log a follow-up.
The current clockwork 'sealing' engine attempts a fast-forward only rebase of work completed for a writ. If there are other changes that land, this means the engine will seize due to the conflict and the whole rig becomes stuck. We should make this process more robust as follows:

- If the clockwork sealing engine fails, it should graft a new tail into the rig
- The new tail should consist of two new engines:
  - a quick engine, which instructs an anima to rebase the writ changes onto the new HEAD, or fail if it cannot do so unambiguously or without risk of error or loss from either change. The anima should output as its final message some structured content indicating if the merge was successful or not. This engine should fail if the anima indicates failure
  - a new clockwork engine which runs after the quick engine, and uses same/similar logic as the default sealing engine -- attempt to push to main, rebasing (ff-only) if needed with a limited set of retries
  - if this second clockwork engine cannot push due to conflicts, it should just fail and allow the rig to become stuck (i.e. only one attempt at manual merging via llm)
# Implement ability to pause rigs for external dependency

Currently, once a rig is created the Spider continually starts each engine as its ready, and engines can only 'succeed' (with yields) or 'fail' (causing the whole rig to fail). We want some engines to be able to enter a paused/waiting state if they detect a situation that must be resolved outside the rig. The engine should terminate in some non-failure way and have a status applied which signals to the Spider that the engine cannot run yet, but has not failed. Once the condition which forced the pause is resolved, the Spider should detect the status change and restart the engine--which may then run to completion, fail, or possibly enter a paused state again.

Reasons for a pause (examples not exhaustive):

- feedback needed from a human operator
- waiting for a dependency on an external system
- waiting for a specific time to continue running

The metadata around the pause probably need to be persisted in a Book in the Stacks, but must be flexible enough to support a growing list of pause reasons. Additionally, there needs to be some mechanism to determine when the condition has been met. We should consdier if this should event-driven somehow, implemented via polling, or both.

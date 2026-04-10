<!-- Live body for this quest is a file in the vibers guild. See .claude/skills/quests/SKILL.md. -->
<!-- Do not edit this row body while the quest is live. -->

## Goal

Decide how the spider should detect and recover from engines that were marked `running` but whose summon was interrupted by a daemon shutdown — and, separately, whether the daemon should shut down more gracefully in the first place so the problem doesn't arise as often. The outcome is a chosen design (one or a blend of reaping, atomicity, and graceful-shutdown approaches) ready to be commissioned as a mandate.
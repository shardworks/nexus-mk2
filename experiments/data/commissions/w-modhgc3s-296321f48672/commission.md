Lifted from the planning run of "Clerk refactor — config-driven state machine with plugin-registered writ types" (w-mod6458g-992589fcce60). Each numbered observation below is a draft mandate ready for curator promotion.

1. Spider's literal `'mandate'` couples to type-name string after BUILTIN_WRIT_TYPE export goes away
2. post()'s transaction wrap is conditional on parentId; parent-classification check races against parent state changes only when parentId is set
3. writ-tree.ts and writs page hardcode phase indicators over mandate's six phases — non-mandate types render glyphless
4. Cross-apparatus `phase === 'stuck'` and terminal-phase literals duplicate the classification primitive T2 introduces
5. Doc/code: clerk index.ts module docstring still describes a fixed mandate phase machine as universal
6. Asymmetry: linkKinds kit channel survives, writTypes kit channel is removed
7. ClerkConfig.writTypes drop needs a guild.json migration story for any guild already carrying the field
8. registerWritType startup-window seal depends on the framework's apparatus:started lifecycle event firing exactly once after all apparatuses start

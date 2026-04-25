Lifted from the planning run of "Refresh spider.js dashboard badge mappings for the new status enums" (w-mod4z7y6-11333ace6663). Each numbered observation below is a draft mandate ready for curator promotion.

1. Unify badgeClass conventions across Spider, Animator, Feedback dashboards
2. spider.css .elapsed-running rule is dead
3. rig-list dropdown is hand-coded; no enum-driven build
4. Pipeline-node lacks an aria-label for screen-reader status announcements
5. engine.holdCondition rendering is JSON-stringify, even for known shapes
6. tools/rig-list.ts and types.ts both retain 'stuck'/'blocked' in their public enums
7. writ-rescue-stuck.ts duplicates legacy-status awareness

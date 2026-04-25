The repo root carries a `_plan/` directory whose `00-meta.md` declares plan id `w-modf696g-466fb615667c` ("Scheduled standing orders MVP-1" — a Clockworks commission unrelated to cartograph). The plan was committed mid-process and never cleaned up.

**Tactical fix:** Delete the stale `_plan/` directory once the cron commission is fully shipped (or has been abandoned). Currently a navigation hazard for anyone running grep across the repo with the assumption that `_plan/` carries the active plan.

Files affected: `_plan/00-meta.md`, `_plan/01-inventory.md`, `_plan/02-scope.md`, `_plan/03-decisions-part1.md`, `_plan/03-decisions-part2.md`, `_plan/04-observations.md`, `_plan/05-spec.md`, `_plan/06-clicks.md`. Out of scope for the cartograph commission.
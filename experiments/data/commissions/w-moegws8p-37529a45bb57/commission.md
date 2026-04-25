Lifted from the planning run of "Animator SessionDoc writeback reducer" (w-moegbwbr-c7487411f1c0). Each numbered observation below is a draft mandate ready for curator promotion.

1. Migrate claude-code pending pre-write to the new SessionTransition reducer
2. Eliminate dispatchAnimate's success/error cancel-check duplication
3. Retire the in-process attached path (audit candidate B)
4. Centralize lifecycle event emission via SessionDoc CDC observer (audit candidate C)
5. recordSession does not read existing before terminal write
6. SessionDoc and SessionResult share a duplicated field set
7. Heartbeat tool reads doc twice on the happy path post-refactor
8. rate-limit-backoff.ts NON_RATE_LIMIT_TERMINAL_STATUSES is the manual inverse of TERMINAL_STATUSES
9. session-running tool's TERMINAL_STATUSES is defined inside the handler
10. Audit's source click c-moe0m38e is still live and should be concluded after candidate A lands

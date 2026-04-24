Lifted from the planning run of "Writ-type config schema and validator" (w-mod644tf-236f3f2ecfc4). Each numbered observation below is a draft mandate ready for curator promotion.

1. Current Clerk cascade silently lacks all-success auto-completion—T2+T3 will change behavior
2. `clerk.md` state-diagram ASCII art goes stale post-T2
3. Existing `ClerkConfig.writTypes` shape becomes dead substrate after T2
4. Spider engine and Astrolabe plan state machines could consume the same config schema
5. Validator's reachability check is O(V*(V+E)) BFS per transition target—negligible for v0 but worth noting
6. Piece and observation-set writ types already exist and will need their own config when T2 generalizes
7. Brief's 'No state with no inbound transitions (unless classified initial)' check may conflict with terminal-only dead ends
8. T1's validator error format becomes the ergonomic bar for all downstream config validators

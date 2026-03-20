# X001 Results — Fruit Delivery

## Outcome: Success (Attempt 2)

The system produced a runnable CLI tool. Sean can execute it with a single command without cloning the source repo.

```sh
npx github:shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680
```

Output:
```
Nexus CLI v1.0.0
Last updated: 2026-03-20T20:32:36.577Z
```

Repository: https://github.com/shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680

---

## Attempt 1 — Failed (run from workshop directory)

### Issues

1. **Agent modified the workshop repo.** Committed changes back to nexus-mk2. The commission said "build this in the repository you've been given" but didn't say "do NOT modify any other repo."
2. **Required cloning to run.** README said `git clone && npm run build && npm start`. Violates the boundary.
3. **Chose TypeScript (context contamination).** Saw `tsconfig.json` in the workshop and inferred TypeScript was expected.
4. **Two commands chained.** `npm run build && npm start` — not a single atomic command.

### Fixes Applied to Commission v2

- "Do not modify any other repository or directory" — explicit negative constraint
- "I will not clone your repository" — makes boundary crossing unmistakable
- "Not a chain of commands" — tightens single-command requirement
- "Do not infer preferences from any other project" — breaks context contamination

---

## Attempt 2 — Success (clean room)

Ran `cat /path/to/commision.md | claude -p`, from `/tmp/work` (a fresh clone of the target repo). Required copying `bypassPermissions` config to the clean room.

### What Went Right

- **Agent stayed in its lane.** No workshop modifications. Clean room worked.
- **Chose `npx github:shardworks/...`** — genuine single-command execution, no cloning required.
- **Self-corrected a bug.** First test showed "Last updated: unknown" because `build-timestamp.txt` was gitignored and npm `prepare` didn't fire via npx. Agent diagnosed, un-gitignored, committed the file, retested.
- **Verified end-to-end.** Tested both locally and via npx from GitHub.
- **README present** with clear instructions.
- **Chose plain Node.js** (not TypeScript). Clean room removed the workshop signal.

### Debatable Points

- **Timestamp semantics.** The "last updated" time comes from the `prepare` script which runs at *install* time on the user's machine, not when the agent last pushed. Acceptable per our leeway but not ideal.
- **Still chose Node.js.** Natural habitat for Claude Code agents. Not wrong, but not surprising.
- **npm warning noise.** `npm warn gitignore-fallback` in output — fixable with `.npmignore`.

### Session Stats

| Metric | Value |
|--------|-------|
| Duration | 106s (89s API) |
| Turns | 17 |
| Cost | $0.30 |
| Input tokens | 16 |
| Output tokens | 3,604 |
| Cache creation | 12,547 |
| Cache read | 263,657 |

---

## Meta-Learnings

- **Clean room execution is essential.** Attempt 1 proved agents will use whatever's available. Attempt 2 proved a simple `/tmp` clone is sufficient isolation for now.
- **Negative constraints need to be explicit.** "Build in this repo" ≠ "don't touch anything else." Agents optimize for completion.
- **The `bypassPermissions` config is needed** for non-interactive runs. Must be provisioned in the clean room.
- **Agents self-correct when they test.** The timestamp bug was found and fixed because the agent actually ran its own tool. Testing behavior should be encouraged or required in commissions.
- **Delivery is the hard part.** Building the CLI was fast. Getting it runnable without cloning was the real challenge.
- **Commission clarity compounds.** The v2 commission produced a much better result with minimal changes — just sharper language around constraints and expectations.

## Artifacts

- `artifacts/agent-session-2.jsonl` — full JSONL log from the successful attempt (attempt 2)

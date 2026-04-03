# X007: Smoke Test 1

Prior to the real commission for X007 we are going to perform some smoke tests just to ensure the pipeline works, and avoid "explosions on the launchpad" where we don't get any useful data because the agent isn't executed correctly, or has a broken environment, or whatever. These smoke tests will be "toys" and hello world type things, so don't meet the selection criteria for this experiment. Nevertheless, I thought I'd capture these efforts here.

## Attempt 1

- Created new guild with `nsg init`
- Consulted with advisor to get directions on how to commission something
- Advisor consultation failed:
  - MCP server failure
  - Claude says I was not authenticated
- Resolution:
  - Fixed MCP tool import bug introduced in recent refactor
  - Fixed regression in Claude CLI args introduced in refactor

## Attempt 2

- Created new guild with `nsg init`
- Asked basic question about guild roster:
  - Authentication was working
  - Was able to roster information from DB, although lack of tool for that was noted
- Asked: "How do I get something commissioned in a git repository which doesn't exist yet?"
- Post commission: 'create a hello world cli program in javascript'
- Commission was posted, but clockwork delivery failed before anima was summoned
- Resolution:
  - Fix subpath export problem in the tool/engine stdlib

### Command Log

```bash
vscode ➜ /workspace/shardworks (master) $ nsg status

Nexus Mk 2.1 — v0.1.26
Guild: shardworks
Root:  /workspace/shardworks

Roles:
  advisor (1 seat) — 0 role tools, instructions: roles/advisor.md
  artificer (unbounded) — 0 role tools, instructions: roles/artificer.md

Base tools (all animas): install-tool, remove-tool, commission, instantiate, nexus-version

Engines:
  ✓ workshop-prepare
  ✓ workshop-merge
Implements:
  ✓ install-tool
  ✓ remove-tool
  ✓ commission
  ✓ instantiate
  ✓ nexus-version

7/7 operational

vscode ➜ /workspace/shardworks (master) $ nsg workshop create
error: missing required argument 'repo'
vscode ➜ /workspace/shardworks (master) $ nsg workshop create --help
Usage: nsg workshop create [options] <repo>

Create a new GitHub repository and register it as a workshop

Arguments:
  repo           Repository name in org/name format

Options:
  --public       Create a public repository (default: private)
  --name <name>  Workshop name (default: derived from repo name)
  -h, --help     display help for command
vscode ➜ /workspace/shardworks (master) $ nsg workshop create shardworks/hello-from-guild
Workshop "hello-from-guild" created.
  Repository: https://github.com/shardworks/hello-from-guild
  Remote: https://github.com/shardworks/hello-from-guild.git
  Bare clone: /workspace/shardworks/.nexus/workshops/hello-from-guild.git
vscode ➜ /workspace/shardworks (master) $ nsg commission 'create a hello world cli program in javascript' --workshop hello-from-guild
Commission #1 posted to workshop "hello-from-guild"
  Run `nsg clock run` to process through Clockworks.
vscode ➜ /workspace/shardworks (master) $ nsg clock list
2 pending events:

  #1  session.started  (framework, 2026-03-25 05:22:52) — {"sessionId":1,"anima":"Advisor","trigger":"consult","workshop":null,"workspaceK
  #2  commission.posted  (framework, 2026-03-25 05:27:56) — {"commissionId":1,"workshop":"hello-from-guild"}
vscode ➜ /workspace/shardworks (master) $ nsg clock run
Processed 3 events:

  #1  session.started
    No matching standing orders.
  #2  commission.posted
    ✗ engine: workshop-prepare — No "exports" main defined in /usr/local/share/nvm/versions/node/v24.14.0/lib/node_modules/@shardworks/nexus/node_modules/@shardworks/nexus-stdlib/package.json imported from /usr/local/share/nvm/versions/node/v24.14.0/lib/node_modules/@shardworks/nexus/node_modules/@shardworks/nexus-core/dist/clockworks.js
  #3  standing-order.failed
    No matching standing orders.
```

## Attempt 3

- Created new guild with `nsg init`
- Attempted to post the same commission as Attempt #2
- Initially had some errors during the worktree prep caused by workshop initial problems. I resolved these manually, and patched the related `nsg` tool bugs.
- A second attempt got through the clockworks.
  - **NOTE**: Should investigate the stdin warning
- Captured session log in `./anima-session-logs/ca5ba394-69f0-4774-a887-4171c6146250.json`. Logging has bugs: (1) missing transcript missing token counts and cost; (2) missing transcript. We should resolve these issues before doing a real test.
- Changes were not pushed to remote.
- Hello world code was weird, but functional: https://github.com/shardworks/hello-from-guild/tree/main

### Command Log

```bash
vscode ➜ /workspace/shardworks (master) $ nsg commission 'create a hello world cli program in javascript' --workshop hello-from-guild
Commission #2 posted to workshop "hello-from-guild"
  Run `nsg clock run` to process through Clockworks.
vscode ➜ /workspace/shardworks (master) $ nsg clock run
Warning: no stdin data received in 3s, proceeding without it. If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.
Done. Here's what was built:

- **`index.js`** — A CLI program (`#!/usr/bin/env node`) that prints `Hello, <name>!`. Pass a name as an argument or it defaults to "World".
- **`test.js`** — Three tests covering default greeting, custom name, and extra argument handling. All passing.
- **`package.json`** — Configured with a `bin` entry so `npm install -g` would make a `hello` command available.

Usage:
```
node index.js          → Hello, World!
node index.js Alice    → Hello, Alice!
```
Processed 7 events:

  #3  commission.posted
    ✓ engine: workshop-prepare
  #4  commission.ready
    ✓ anima: Unnamed Artificer
  #5  session.started
    No matching standing orders.
  #6  session.started
    No matching standing orders.
  #7  session.ended
    No matching standing orders.
  #8  commission.session.ended
    ✓ engine: workshop-merge
  #9  commission.completed
    No matching standing orders.
```
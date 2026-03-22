# Scratch TODO

- Commission CLI: consider an `amend` command (`nexus commission amend <id> <amendment-file>`) — append amendments to a posted commission without recreating it. Carries forward the amendment pattern.
- Commission dispatch: capture session logs (session.jsonl) somewhere durable — currently lost when tmpdir is cleaned up. Needed for cost tracking, debugging, and experiment data.
- Generic ability to plugin "agents" (spirits?) into commissions (basically hooks)

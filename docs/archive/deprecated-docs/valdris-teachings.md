# Valdris's Teachings

Craft knowledge from the guild's founding artificer, extracted for use in academy training.

---

## For Sages

### Planning with Integrity

If your implementation plan only partially achieves the commission's stated goal, or if the commission describes a desired outcome that could be interpreted multiple ways, block with a clarification request rather than choosing an interpretation silently. The patron would rather answer a question than discover the wrong thing was built.

---

## For Artificers

### Approaching Commissions

You receive a commission spec and deliver working code. Be thorough: test your work end-to-end before marking it done. When a commission is vague, use your judgment about how much planning it needs before you start building. Simple, clear specs can go straight to implementation. Vague or complex ones deserve a planning phase first.

### Craft Standards

- **Work on your commission branch.** You will land in a worktree with a commission-specific branch already checked out. Do your work there. Commit and push your branch when done — do not merge to main yourself. The golem handles the merge.
- **Self-document for other agents.** Write commit messages, code comments, and documentation assuming your audience is other animas who will continue the work. Be precise and concise.
- **Test your work.** Run the full lifecycle end-to-end before you're done. If the commission spec includes evaluation criteria, verify each one.
- **Always commit and push before finishing.** This is critical. Your work happens in an ephemeral environment — when your session ends, anything uncommitted or unpushed is destroyed. The last thing you do before finishing any commission is `git add`, `git commit`, `git push`. No exceptions. If you're unsure whether you've pushed, push again.

### Tools

The guild operates through the Nexus CLI, which tracks commissions, anima identities, and role assignments. The workshop's README describes how to invoke it. Consult it when you need to understand the CLI's capabilities.

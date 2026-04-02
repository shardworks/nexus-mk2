# Artificer Default Instructions: Always Write Tests

**Priority:** High — do this as soon as the Loom supports default role instructions.

## Problem

We're seeing a recurring pattern: the artificer implements code correctly but ships without tests, even when the package.json has a test script scaffolded. Multiple commissions have scored test_quality=1 because of this. The spec shouldn't have to say "write tests" every time — that should be baked into the role.

## Action

When the Loom supports default instructions per role (curriculum or standing instructions), add to the artificer's defaults:

- Always write tests for new code. If you set up a test script in package.json, populate it.
- Test coverage should exercise the public API at minimum.
- Follow the testing patterns of sibling packages in the same workspace.

## Evidence

- w-mnhy86ga-fedf0135a60c (Fabricator): test_quality=1, no tests despite test script in package.json
- w-mnho6jxd-c8139f50006c (Anima Git Identity): test gap required follow-up commission (w-mnhq6gpv)

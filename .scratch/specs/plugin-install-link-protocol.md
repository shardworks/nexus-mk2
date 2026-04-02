# Plugin Install — Use `link:` Protocol for Local Directories

## Context

`nsg plugin-install --type link` (and auto-detected local directory installs) currently shells out to `npm install --save file:<path>`. This works with npm, which creates a symlink in `node_modules`. But when a guild uses pnpm, `file:` copies the package into pnpm's virtual store instead of symlinking. This creates separate module instances and breaks singleton patterns — specifically `guild()`, which relies on all plugins sharing one copy of `@shardworks/nexus-core`.

The `link:` protocol (supported by pnpm and yarn) creates a true symlink, preserving module identity and giving live source updates. npm doesn't support `link:` and errors with `EUNSUPPORTEDPROTOCOL`.

The fix: detect the guild's package manager and use the correct protocol for local installs.

## Changes

### 1. Add package manager detection helper

**File:** `packages/framework/cli/src/commands/plugin.ts`

Add a helper function that detects the guild's package manager by checking for lockfiles:

```typescript
/**
 * Detect the package manager used by the guild.
 *
 * Checks for lockfiles in order of specificity. Falls back to 'npm'
 * when no lockfile is present (e.g. fresh guilds before first install).
 */
function detectPackageManager(guildRoot: string): 'npm' | 'pnpm' {
  if (fs.existsSync(path.join(guildRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  return 'npm';
}
```

Only detect npm and pnpm — yarn support is out of scope. If we add it later, the enum and detection logic extend naturally.

### 2. Use detected package manager for install commands

Replace the hardcoded `npm` calls in the link install path with package-manager-aware logic.

**In `pluginInstall` handler**, replace:
```typescript
npm(['install', '--save', `file:${sourceDir}`], home);
```

with:
```typescript
const pm = detectPackageManager(home);
if (pm === 'pnpm') {
  pnpm(['add', `link:${sourceDir}`], home);
} else {
  npm(['install', '--save', `file:${sourceDir}`], home);
}
```

Add a `pnpm` helper alongside the existing `npm` helper:
```typescript
function pnpm(args: string[], cwd: string): string {
  return execFileSync('pnpm', args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
}
```

### 3. Use detected package manager for remove commands

**In `pluginRemove` handler**, the `npm(['uninstall', ...])` call should also respect the detected package manager:

```typescript
const pm = detectPackageManager(home);
if (pm === 'pnpm') {
  pnpm(['remove', packageName], home);
} else {
  npm(['uninstall', packageName], home);
}
```

### 4. Update tests

**File:** `packages/framework/cli/src/commands/plugin.test.ts`

The existing plugin-install tests create temp guilds with no lockfile, so `detectPackageManager` returns `'npm'` and existing tests pass unchanged (same `file:` behavior as before).

Add new tests for pnpm detection:

**In `plugin-install handler — link mode`:**

- `it('uses link: protocol when guild has pnpm-lock.yaml')` — create a temp guild, write an empty `pnpm-lock.yaml`, create a fake plugin, install with `type: 'link'`. Read the guild's `package.json` and assert the dependency value starts with `link:` (not `file:`). Also assert the plugin id appears in `guild.json` plugins array.

- `it('uses file: protocol when guild has no pnpm-lock.yaml')` — same setup but without the lockfile. Assert the dependency value starts with `file:`.

**Note:** These tests will call the real `pnpm` binary (just as the existing tests call the real `npm` binary). The test environment has pnpm available.

**In `plugin-remove handler`:**

- `it('calls pnpm remove when guild has pnpm-lock.yaml')` — create a guild with `pnpm-lock.yaml`, pre-populate the plugin in `guild.json` and `package.json`, call remove, assert the plugin is gone from both.

### 5. Export the detection helper for potential reuse

Export `detectPackageManager` from the module. The `init` command (which currently hardcodes `npm install`) may want it later, but that change is out of scope for this commission.

## Scope Boundary

- Do NOT modify `init.ts` — that's a separate concern (the init command's package manager choice is a broader design decision).
- Do NOT add yarn support — out of scope, extend later if needed.
- Do NOT modify the registry install path — only local directory installs are affected.
- Stay within `packages/framework/cli/src/commands/plugin.ts` and its test file.

## Verification

Run the plugin command tests:
```bash
cd packages/framework/cli && node --experimental-transform-types --test src/commands/plugin.test.ts
```

All existing tests must continue to pass. All new tests must pass.

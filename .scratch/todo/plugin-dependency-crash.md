# Plugin Dependency Crash Blocks All CLI Operations

**Discovered:** 2026-04-03
**Severity:** High — completely blocks guild operation

## Problem

If a plugin declares a dependency (via `recommends` or similar) that isn't installed, or if a plugin fails to load for any reason, the entire `nsg` CLI becomes unusable. This means you can't even use `nsg plugin install` to fix the problem, or `nsg plugin remove` to remove the broken plugin.

## Observed Behavior

Adding `dashboard` to guild.json when `walker` wasn't installed produced a warning (`"dashboard" recommends "walker" but it is not installed`) but still worked. However, harder dependency failures (e.g., missing packages, resolution errors) can block startup entirely.

The general pattern: any plugin load failure that throws rather than warns makes the entire CLI inaccessible, including the tools you'd use to fix the situation.

## Expected Behavior

Core CLI commands (especially `plugin install`, `plugin remove`, `status`, `version`) should remain functional even when individual plugins fail to load. Plugin load failures should be isolated — warn and skip, don't crash.

## Suggested Approach

- Plugin loading should catch per-plugin errors and continue
- Failed plugins should be reported via `nsg status` with their error
- Administrative commands should not require all plugins to be healthy

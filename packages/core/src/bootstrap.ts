import { execFileSync } from 'node:child_process';
import { installTool } from './install-tool.ts';
import { BASE_IMPLEMENTS, BASE_ENGINES } from './base-tools.ts';

/**
 * Install all framework base tools into a freshly-initialized guild.
 *
 * Uses `installTool({ framework: true })` for every base implement and engine —
 * the same code path used for all tool installation. Individual installs do not
 * commit; a single "Bootstrap base tools" commit is created at the end.
 *
 * @param home - Absolute path to the guild root.
 * @param resolvePackage - Resolves a package name to its root directory on disk.
 *   The caller owns resolution because it depends on the runtime module system
 *   (workspace links, node_modules layout, etc.) which varies by context.
 */
export function bootstrapBaseTools(
  home: string,
  resolvePackage: (packageName: string) => string,
): void {
  // Install base implements
  for (const ref of BASE_IMPLEMENTS) {
    const sourceDir = resolvePackage(ref.packageName);
    installTool({
      home,
      source: sourceDir,
      name: ref.name,
      roles: ref.roles ?? ['*'],
      framework: true,
      commit: false,
    });
  }

  // Install base engines
  for (const ref of BASE_ENGINES) {
    const sourceDir = resolvePackage(ref.packageName);
    installTool({
      home,
      source: sourceDir,
      name: ref.name,
      framework: true,
      commit: false,
    });
  }

  // Single commit for all bootstrap installs
  execFileSync('git', ['add', '-A'], { cwd: home, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'Bootstrap base tools'], { cwd: home, stdio: 'pipe' });
}

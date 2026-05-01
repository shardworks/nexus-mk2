/**
 * Stable-pin validation — the reproducibility gate for trial manifests.
 *
 * A trial manifest is an archived input: it lands on the trial writ at
 * `ext.laboratory.config`, gets snapshotted by `lab.probe-trial-context`
 * into the archive row, and is the canonical source for re-running a
 * trial later. That contract requires every plugin / CLI / tool pin
 * inside the manifest to resolve to the *same artifact* months or
 * years from now.
 *
 * Stable forms (whitelisted):
 *   - Exact npm semver:           `1.2.3`, `0.7.0-alpha.2`, `1.0.0+build.5`
 *   - Git URL with SHA fragment:  `git+https://github.com/foo/bar.git#a1b2c3d4...`
 *                                 `git+ssh://git@github.com/foo/bar.git#<sha>`
 *                                 `git+file:///path/to/repo#<sha>`
 *   - GitHub shorthand with SHA:  `foo/bar#a1b2c3d`, `github:foo/bar#a1b2c3d`
 *   - Registry tarball URL:       `https://registry.npmjs.org/foo/-/foo-1.2.3.tgz`
 *
 * Unstable forms (rejected with a specific reason):
 *   - `file:<path>`              — local paths aren't reproducible elsewhere
 *   - `link:<path>`              — same; also pnpm-only
 *   - `workspace:*`              — pnpm workspace ref, monorepo-local
 *   - `^1.2.3`, `~1.2.3`, `*`    — version ranges resolve differently over time
 *   - `latest`, `next`, dist-tags — moving targets
 *   - git URL with branch/tag    — branches move; tags can be re-pointed
 *
 * Strict, no escape hatch. Devs who need to iterate on the framework
 * source under a trial commit their changes locally and pin via
 * `git+file:///workspace/<repo>#<sha>` — the SHA is content-addressable,
 * the URL only tells the resolver where to fetch from.
 */

const SEMVER_EXACT_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const GIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

const GIT_URL_PATTERN = /^git\+[a-z]+:\/\/[^#]+#(.+)$/i;

const GITHUB_SHORTHAND_PATTERN = /^(?:github:)?[\w.-]+\/[\w.-]+#(.+)$/;

const REGISTRY_TARBALL_PATTERN = /^https?:\/\/.+\.tgz(?:\?[^#]*)?$/;

const RANGE_LEAD_CHARS = /^[\^~*><=]/;
const DIST_TAGS = new Set(['latest', 'next', 'beta', 'alpha', 'canary', 'rc']);

/**
 * Result of validating a single version pin. Errors carry a specific
 * reason so the manifest CLI can surface actionable feedback at the
 * `path.to.field` where the pin was authored.
 */
export type StablePinResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Validate that a package-version specifier resolves to the same
 * artifact every time. See module docstring for the full rule set.
 */
export function isStablePin(spec: string): StablePinResult {
  if (typeof spec !== 'string' || spec.length === 0) {
    return { ok: false, reason: 'version pin must be a non-empty string' };
  }

  // Whitelist — exact semver.
  if (SEMVER_EXACT_PATTERN.test(spec)) {
    return { ok: true };
  }

  // Whitelist — git URL with SHA fragment.
  const gitUrl = GIT_URL_PATTERN.exec(spec);
  if (gitUrl) {
    const ref = gitUrl[1]!;
    if (GIT_SHA_PATTERN.test(ref)) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `git ref "${ref}" must be a 7-40 char SHA, not a branch or tag`,
    };
  }

  // Whitelist — registry tarball URL.
  if (REGISTRY_TARBALL_PATTERN.test(spec)) {
    return { ok: true };
  }

  // Whitelist — GitHub shorthand with SHA.
  // Checked AFTER git+url so `git+https://...` doesn't accidentally match
  // (it won't — it has the `git+` prefix the shorthand pattern excludes).
  const gh = GITHUB_SHORTHAND_PATTERN.exec(spec);
  if (gh) {
    const ref = gh[1]!;
    if (GIT_SHA_PATTERN.test(ref)) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `GitHub ref "${ref}" must be a 7-40 char SHA, not a branch or tag`,
    };
  }

  // Blacklist with specific reasons — make the rejection actionable.
  if (spec.startsWith('file:')) {
    return { ok: false, reason: '"file:" refs are not reproducible across machines' };
  }
  if (spec.startsWith('link:')) {
    return { ok: false, reason: '"link:" refs are not reproducible (also pnpm-only)' };
  }
  if (spec.startsWith('workspace:')) {
    return { ok: false, reason: '"workspace:" refs are monorepo-local and not portable' };
  }
  if (RANGE_LEAD_CHARS.test(spec)) {
    return {
      ok: false,
      reason: `version range "${spec}" must be pinned to an exact version`,
    };
  }
  if (DIST_TAGS.has(spec)) {
    return {
      ok: false,
      reason: `dist-tag "${spec}" is a moving target — pin to an exact version`,
    };
  }

  // Catch-all.
  return {
    ok: false,
    reason:
      `cannot recognize "${spec}" as a stable pin (allowed forms: exact semver, ` +
      `git+<url>#<sha>, github-shorthand#<sha>, or a registry tarball URL)`,
  };
}

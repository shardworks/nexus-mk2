#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/release.sh <major|minor|patch>
# Bumps version in all workspace packages, commits, tags, and pushes.

BUMP="${1:?Usage: release.sh <major|minor|patch>}"

# Read current version from root package.json (canonical source)
CURRENT=$(node -e "console.log(require('./package.json').version)")
echo "Current version: $CURRENT"

# Compute next version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  *) echo "Invalid bump type: $BUMP (use major, minor, or patch)" >&2; exit 1 ;;
esac
NEXT="${MAJOR}.${MINOR}.${PATCH}"
echo "Next version: $NEXT"

# Ensure clean working tree
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree is not clean. Commit or stash changes first." >&2
  exit 1
fi

# Update version in root package.json
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$NEXT';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Update version in all workspace packages
for pkg in packages/*/package.json; do
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$pkg', 'utf8'));
    pkg.version = '$NEXT';
    fs.writeFileSync('$pkg', JSON.stringify(pkg, null, 2) + '\n');
  "
done

# Commit and tag
git add package.json packages/*/package.json
git commit -m "release v${NEXT}"
git tag "v${NEXT}"

echo ""
echo "Created commit and tag v${NEXT}"
echo "Run 'git push && git push --tags' to trigger the publish workflow."

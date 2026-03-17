#!/usr/bin/env bash
# Ensure the domain repo (nexus-mk2-domain) is cloned as a sibling
# of the main repo. This directory is mounted read-only into containers
# so agents can read but never modify domain definitions.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
DOMAIN_DIR="$(dirname "$REPO_ROOT")/nexus-mk2-domain"

if [ -d "$DOMAIN_DIR/.git" ]; then
    echo "[clone-domain-repo] Domain repo already present at $DOMAIN_DIR — pulling latest." >&2
    git -C "$DOMAIN_DIR" pull --ff-only || echo "[clone-domain-repo] Warning: pull failed, using existing checkout." >&2
else
    echo "[clone-domain-repo] Cloning domain repo to $DOMAIN_DIR..." >&2
    git clone git@github.com:shardworks/nexus-mk2-domain.git "$DOMAIN_DIR"
fi

echo "[clone-domain-repo] Done." >&2

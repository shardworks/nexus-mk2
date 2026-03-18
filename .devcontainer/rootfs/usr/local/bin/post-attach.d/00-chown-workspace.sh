#!/usr/bin/env bash
set -euo pipefail

# Chown /workspace but skip read-only bind mounts (e.g. /workspace/domain).
# We prune any path that isn't writable by root to avoid EROFS failures.
sudo find /workspace -mindepth 1 -maxdepth 1 | while IFS= read -r entry; do
  if sudo test -w "$entry"; then
    sudo chown -R vscode:vscode "$entry"
  fi
done
sudo chown vscode:vscode /workspace
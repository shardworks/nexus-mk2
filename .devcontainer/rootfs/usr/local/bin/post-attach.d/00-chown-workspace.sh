#!/usr/bin/env bash
set -euo pipefail

# Exclude read-only mounts (e.g. /workspace/domain) from recursive chown
sudo find /workspace -mount -exec chown vscode:vscode {} +

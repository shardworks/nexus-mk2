#!/usr/bin/env bash

set -euo pipefail

claude -p "Run an audit against all registered requirements." --agent auditor

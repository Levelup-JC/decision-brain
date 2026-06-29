#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../runtime/decision-brain" && pwd)"

export DECISION_BRAIN_DATA_DIR="${DECISION_BRAIN_DATA_DIR:-$HOME/.decision-brain-lobster}"
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-4177}"

exec "${NODE_BIN:-node}" "$PROJECT_ROOT/src/index.mjs"

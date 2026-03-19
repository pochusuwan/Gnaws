#!/bin/bash
set -euo pipefail

# This script ensures you always run the latest deployment logic.
# It updates the repo (git pull) in case deploy.sh has changed,
# then delegates execution to deploy.sh.
# Keep this script minimal. Do not add other behavior here.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

git pull --rebase --autostash
./deploy.sh "$@"

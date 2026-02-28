#!/bin/bash
set -eu

GNAWS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STDIN_FILE=$GNAWS_ROOT/server.stdin

. "$GNAWS_ROOT/gnaws-script.conf"
SERVER_COMMAND_SUPPORTED="${SERVER_COMMAND_SUPPORTED:-false}"

if [[ "$SERVER_COMMAND_SUPPORTED" == "false" ]]; then
    echo "Unsupported"
    exit 1
fi

COMMAND=$(printf '%s' "$1" | tr -d '[:cntrl:]')

if [[ -z "$COMMAND" ]]; then
    echo "Error: empty command"
    exit 1
fi

echo "$COMMAND" > "$STDIN_FILE"

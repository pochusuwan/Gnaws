#!/bin/bash

GNAWS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

while [[ $# -gt 0 ]]; do
    case $1 in
        --gameConfig)
            GAME_CONFIG="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

if [[ -n "$GAME_CONFIG" ]]; then
    echo "$GAME_CONFIG" | base64 --decode | jq -r 'to_entries[] | "\(.key)=\(.value)"' > "$GNAWS_ROOT/gnaws-game.conf"
fi

# Start systemd gnaws service from file in internal folder
systemctl daemon-reload
systemctl start gnaws

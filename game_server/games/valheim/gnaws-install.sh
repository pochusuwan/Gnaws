#!/bin/bash

export PATH="$PATH:/usr/games"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# SteamCMD sometimes fail. Install with retries
MAX_RETRIES=3
SLEEP=5
for i in $(seq 1 $MAX_RETRIES); do
    echo "SteamCMD attempt $i/$MAX_RETRIES"
    if steamcmd +force_install_dir "$SCRIPT_DIR" +login anonymous +app_update 896660 validate +quit; then
        echo "SteamCMD succeeded"
        exit 0
    fi
    echo "SteamCMD failed, retrying in ${SLEEP}s..."
    sleep "$SLEEP"
done

echo "SteamCMD failed after $MAX_RETRIES attempts"
exit 1

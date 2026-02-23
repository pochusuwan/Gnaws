#!/bin/bash
set -eu

GNAWS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

. "$GNAWS_ROOT/gnaws-script.conf"

GAME_SERVER_DIR=/opt/$SERVER_FOLDER_NAME
echo "Updating game"

# Update with SteamCMD sometimes fail. Update with retries
MAX_INSTALL_ATTEMPT="${MAX_INSTALL_ATTEMPT:-1}"
INSTALL_SLEEP=5
SERVER_USER="gnaws-user"

for i in $(seq 1 $MAX_INSTALL_ATTEMPT); do
    echo "Update attempt $i/$MAX_INSTALL_ATTEMPT"

    cd "$GAME_SERVER_DIR"
    if sudo -u "$SERVER_USER" "./gnaws-update.sh"; then
        echo "Update succeeded"
        exit 0
    fi

    if (( i < MAX_INSTALL_ATTEMPT )); then
        echo "Update failed, retrying in ${INSTALL_SLEEP}s..."
        sleep "$INSTALL_SLEEP"
    fi
done

echo "Update failed after $MAX_INSTALL_ATTEMPT attempts"
exit 1

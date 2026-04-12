#!/bin/bash
export templdpath=$LD_LIBRARY_PATH
export LD_LIBRARY_PATH=./linux64:$LD_LIBRARY_PATH
export SteamAppId=892970
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ -f "$SCRIPT_DIR/gnaws-game.conf" ]]; then
    . "$SCRIPT_DIR/gnaws-game.conf"
fi

echo "Starting server PRESS CTRL-C to exit"

SERVER_NAME="${CONFIG_serverName:-Gnaws Server}"
SERVER_PASSWORD="${CONFIG_serverPassword:-}"
IS_PUBLIC="${CONFIG_isPublic:-false}"

ARGS=(-name "$SERVER_NAME" -port 2456 -world "Dedicated" -crossplay -savedir "$SCRIPT_DIR/save")

# Force private if password is empty or less than 5 characters
if [[ ${#SERVER_PASSWORD} -lt 5 ]]; then
    SERVER_PASSWORD=""
    IS_PUBLIC="false"
fi

if [[ "$IS_PUBLIC" == "true" ]]; then
    ARGS+=(-public 1)
else
    ARGS+=(-public 0)
fi

if [[ -n "$SERVER_PASSWORD" ]]; then
    ARGS+=(-password "$SERVER_PASSWORD")
fi

# Tip: Make a local copy of this script to avoid it being overwritten by steam.
# NOTE: Minimum password length is 5 characters & Password cant be in the server name.
# NOTE: You need to make sure the ports 2456-2458 is being forwarded to your server through your local router & firewall.
exec ./valheim_server.x86_64 "${ARGS[@]}"

export LD_LIBRARY_PATH=$templdpath

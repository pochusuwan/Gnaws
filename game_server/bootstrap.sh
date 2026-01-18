#!/bin/bash
set -eu

# This bootstrap file is expected to run in folder matching repo structure.
# The first input is the game id which is the folder of the game configurations
GAME_ID="$1"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GAME_CONF="$SCRIPT_DIR/games/$GAME_ID/gnaws-script.conf"
GAME_INSTALL="$SCRIPT_DIR/games/$GAME_ID/install.sh"

[ -f $GAME_CONF ] || {
    echo "Missing gnaws-script.conf" >&2
    exit 1
}
[ -f $GAME_INSTALL ] || {
    echo "Missing install.sh" >&2
    exit 1
}

# Create user which will be used with screen to run game server
GAME_USER="gnaws-user"
id -u "$GAME_USER" >/dev/null 2>&1 || \
    useradd -m -s /bin/bash -p '!' "$GAME_USER"

# Read game server configurations
. "$GAME_CONF"
GAME_SERVER_DIR=/opt/$SERVER_FOLDER_NAME

# Create server folder and give ownership to gnaws-user
mkdir -p "$GAME_SERVER_DIR"
chown -R "$GAME_USER":"$GAME_USER" "$GAME_SERVER_DIR"
# Copy script configurations and create link
cp "$GAME_CONF" "$GAME_SERVER_DIR/gnaws-script.conf"
ln -sfn "$GAME_SERVER_DIR/gnaws-script.conf" "$SCRIPT_DIR/scripts/gnaws-script.conf"

# Copy install script to server folder
cp "$GAME_INSTALL" "$GAME_SERVER_DIR/install.sh"

rm -rf games
echo $GAME_SERVER_DIR

# Install game as gnaws-user
cd "$GAME_SERVER_DIR"
sudo -u "$GAME_USER" "./install.sh"

#!/bin/bash
set -eu

# This bootstrap script bundled with games and scripts folder. 
# The first input is the game id which is the folder of the game configurations
GAME_ID="$1"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GAME_CONF="$SCRIPT_DIR/games/$GAME_ID/gnaws-script.conf"
GAME_INSTALL="$SCRIPT_DIR/games/$GAME_ID/gnaws-install.sh"

# Verify minimum requirement files
[ -f $GAME_CONF ] || {
    echo "Missing gnaws-script.conf" >&2
    exit 1
}
[ -f $GAME_INSTALL ] || {
    echo "Missing gnaws-install.sh" >&2
    exit 1
}

# Create user which will be used with screen to run game server
USER="gnaws-user"
id -u "$USER" >/dev/null 2>&1 || \
    useradd -m -s /bin/bash -p '!' "$USER"

# Read game server configurations
. "$GAME_CONF"
GAME_SERVER_DIR=/opt/$SERVER_FOLDER_NAME

# Install game dependencies
APT_PACKAGES="${APT_PACKAGES:-}"
if [[ -n "$APT_PACKAGES" ]]; then
  apt install -y $APT_PACKAGES
fi

# Copy game server folder and give ownership to gnaws-user
cp -r "$SCRIPT_DIR/games/$GAME_ID" "$GAME_SERVER_DIR"
rm -rf "$SCRIPT_DIR/games"
chown -R "$USER":"$USER" "$GAME_SERVER_DIR"

# Create configurations link
ln -sfn "$GAME_SERVER_DIR/gnaws-script.conf" "$SCRIPT_DIR/scripts/gnaws-script.conf"

# Install game as gnaws-user
cd "$GAME_SERVER_DIR"
sudo -u "$USER" "./gnaws-install.sh"

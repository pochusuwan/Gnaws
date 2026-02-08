#!/bin/bash
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

. "$SCRIPT_DIR/gnaws-script.conf"

GAME_SERVER_DIR=/opt/$SERVER_FOLDER_NAME
cd "$GAME_SERVER_DIR"

echo "Updating game"
sudo -u "$USER" "./gnaws-update.sh"

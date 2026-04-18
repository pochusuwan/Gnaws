#!/bin/bash
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Download latest server zip
VERSIONS_URL=$(curl -s "https://terraria.org/api/get/dedicated-servers-names")
VERSION_ZIP=$(jq -r '.[0]' <<< "$VERSIONS_URL")
DOWNLOAD_URL="https://terraria.org/api/download/pc-dedicated-server/${VERSION_ZIP}"
curl -L "$DOWNLOAD_URL" -o "$SCRIPT_DIR/server.zip"
unzip -oq "$SCRIPT_DIR/server.zip"

# Remove old server files and install
rm -rf "$SCRIPT_DIR/Linux"
mv "$SCRIPT_DIR"/*/Linux "$SCRIPT_DIR/Linux"
chmod +x "$SCRIPT_DIR/Linux/TerrariaServer.bin.x86_64"

#!/bin/bash
set -eu

# Download latest server jar
MANIFEST=https://piston-meta.mojang.com/mc/game/version_manifest.json
MANIFEST=$(curl -s "$MANIFEST")
VERSION=$(jq -r '.latest.release' <<< "$MANIFEST")
VERSION_URL=$(jq -r ".versions[] | select(.id==\"$VERSION\") | .url" <<< "$MANIFEST")
DOWNLOAD_URL=$(curl -s "$VERSION_URL" | jq -r '.downloads.server.url')

curl -L "$DOWNLOAD_URL" -o server.jar

# Accept EULA
echo "eula=true" > eula.txt

#!/bin/bash

# https://docs.papermc.io/misc/downloads-service/
PROJECT="paper"
USER_AGENT="gnaws (pochusuwancode@gmail.com)"

# Get all versions for the project (using the same endpoint structure as the "Getting the latest version" example)
# The versions are organized by version group, so we need to extract all versions from all groups
# Then sort them properly as semantic versions (newest first)
VERSIONS=$(curl -s -H "User-Agent: $USER_AGENT" https://fill.papermc.io/v3/projects/${PROJECT} | \
    jq -r '.versions | to_entries[] | .value[]' | \
    sort -V -r)

# Iterate through versions to find one with a stable build
for VERSION in $VERSIONS; do
    VERSION_BUILDS=$(curl -s -H "User-Agent: $USER_AGENT" https://fill.papermc.io/v3/projects/${PROJECT}/versions/${VERSION}/builds)

    # Check if this version has a stable build
    STABLE_URL=$(echo "$VERSION_BUILDS" | jq -r 'first(.[] | select(.channel == "STABLE") | .downloads."server:default".url) // "null"')
    
    if [[ "$STABLE_URL" != "null" ]]; then
        PAPERMC_URL="$STABLE_URL"
        FOUND_VERSION="$VERSION"
        echo "Found stable build for version $VERSION"
        break
    fi
done

if [[ "$PAPERMC_URL" != "null" ]]; then
  # Download the latest Paper version
  curl -o server.jar $PAPERMC_URL
  echo "Download completed (version: $FOUND_VERSION)"
else
  echo "No stable builds available for any version :("
  exit 1
fi

# Accept EULA
echo "eula=true" > eula.txt

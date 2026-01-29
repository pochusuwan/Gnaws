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

# Install dependencies
export DEBIAN_FRONTEND=noninteractive
apt update
apt install -y zip unzip
if ! command -v aws >/dev/null; then
    curl -s https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o /tmp/awscliv2.zip
    unzip -q /tmp/awscliv2.zip -d /tmp
    /tmp/aws/install
    rm -rf /tmp/aws /tmp/awscliv2.zip
fi

# Create user which will be used with screen to run game server
USER="gnaws-user"
id -u "$USER" >/dev/null 2>&1 || \
    useradd -m -s /bin/bash -p '!' "$USER"

# Read game server configurations
. "$GAME_CONF"
GAME_SERVER_DIR=/opt/$SERVER_FOLDER_NAME

# Install game dependencies
APT_PACKAGES="${APT_PACKAGES:-}"
if echo " $APT_PACKAGES " | grep -qw "steamcmd"; then
    add-apt-repository -y multiverse
    dpkg --add-architecture i386
    apt update
    echo steam steam/license note '' | debconf-set-selections
    echo steam steam/question select "I AGREE" | debconf-set-selections
fi

if [[ -n "$APT_PACKAGES" ]]; then
    echo "Installing APT packages $APT_PACKAGES"
    apt install -y $APT_PACKAGES
fi

# Copy game server folder and give ownership to gnaws-user
mkdir -p "$GAME_SERVER_DIR"
cp -a "$SCRIPT_DIR/games/$GAME_ID/." "$GAME_SERVER_DIR"
rm -rf "$SCRIPT_DIR/games"
chown -R "$USER":"$USER" "$GAME_SERVER_DIR"

# Create configurations link
ln -sfn "$GAME_SERVER_DIR/gnaws-script.conf" "$SCRIPT_DIR/scripts/gnaws-script.conf"

# Install game as gnaws-user
cd "$GAME_SERVER_DIR"
echo "Installing game"
sudo -u "$USER" "./gnaws-install.sh"

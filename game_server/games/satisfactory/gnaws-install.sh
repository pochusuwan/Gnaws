#!/bin/bash

export PATH="$PATH:/usr/games"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

ln -sfn "/home/gnaws-user/.config/Epic/FactoryGame/Saved/SaveGames/server" "$SCRIPT_DIR/save"

steamcmd +force_install_dir "$SCRIPT_DIR" +login anonymous +app_update 1690800 validate +quit

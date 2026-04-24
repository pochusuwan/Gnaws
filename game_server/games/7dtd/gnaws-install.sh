#!/bin/bash

export PATH="$PATH:/usr/games"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

ln -sfn "/home/gnaws-user/.local/share/7DaysToDie/Saves" "$SCRIPT_DIR/gnaws-save"

steamcmd +force_install_dir "$SCRIPT_DIR" +login anonymous +app_update 294420 validate +quit

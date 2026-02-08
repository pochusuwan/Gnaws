#!/bin/bash

export PATH="$PATH:/usr/games"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

steamcmd +force_install_dir "$SCRIPT_DIR" +login anonymous +app_update 2394010 validate +quit

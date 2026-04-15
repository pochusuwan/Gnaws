#!/bin/bash
set -euo pipefail

# Modify server properties
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini"
DEFAULT_FILE="$SCRIPT_DIR/DefaultPalWorldSettings.ini"
CONF_FILE="$SCRIPT_DIR/gnaws-game.conf"

if [[ -f "$SCRIPT_DIR/gnaws-game.conf" ]]; then
    . "$SCRIPT_DIR/gnaws-game.conf"
fi

# Copy default if missing
if [[ ! -f "$CONFIG_FILE" ]]; then
    cp "$DEFAULT_FILE" "$CONFIG_FILE"
fi

set_property() {
    local key="$1"
    local config_var="$2"
    local type="$3"   # "bool" | "number" | "string"

    local value="${!config_var:-}"
    [[ -z "$value" ]] && return

    case "$type" in
        bool)
            # Only "true" becomes True, everything else False
            if [[ "$value" == "true" ]]; then
                value="True"
            else
                value="False"
            fi
            ;;
        number)
            if ! [[ "$value" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
                echo "Skipping invalid number for $key: $value"
                return
            fi
            ;;
        string)
            value="${value//\"/\\\"}"
            value="\"$value\""
            ;;
        *)
            echo "Unknown type for $key: $type"
            return
            ;;
    esac

    # Escape for sed
    local escaped
    escaped=$(printf '%s\n' "$value" | sed 's/[&/\]/\\&/g')

    # Replace or append
    if grep -q "${key}=" "$CONFIG_FILE"; then
        sed -i "s/${key}=[^,)]*/${key}=${escaped}/" "$CONFIG_FILE"
    fi
}

set_property "ServerName" CONFIG_ServerName string
set_property "ServerPassword" CONFIG_ServerPassword string
set_property "AdminPassword" CONFIG_AdminPassword string

set_property "BaseCampMaxNumInGuild" CONFIG_BaseCampMaxNumInGuild number
set_property "BaseCampWorkerMaxNum" CONFIG_BaseCampWorkerMaxNum number
set_property "BuildObjectDeteriorationDamageRate" CONFIG_BuildObjectDeteriorationDamageRate number
set_property "DayTimeSpeedRate" CONFIG_DayTimeSpeedRate number
set_property "NightTimeSpeedRate" CONFIG_NightTimeSpeedRate number
set_property "ExpRate" CONFIG_ExpRate number

set_property "PalEggDefaultHatchingTime" CONFIG_PalEggDefaultHatchingTime number
set_property "PalCaptureRate" CONFIG_PalCaptureRate number
set_property "PalSpawnNumRate" CONFIG_PalSpawnNumRate number
set_property "EnemyDropItemRate" CONFIG_EnemyDropItemRate number

# Start server
exec ./PalServer.sh -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS

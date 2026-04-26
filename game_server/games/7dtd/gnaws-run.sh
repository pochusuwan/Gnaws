#!/bin/bash
set -euo pipefail

# Modify server properties
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_CONFIG_FILE="$SCRIPT_DIR/serverconfig.xml"
GNAWS_CONFIG_FILE="$SCRIPT_DIR/gnaws.serverconfig.xml"
ADMIN_CONFIG_FILE="$SCRIPT_DIR/gnaws-save/serveradmin.xml"

if [[ -f "$SCRIPT_DIR/gnaws-game.conf" ]]; then
    . "$SCRIPT_DIR/gnaws-game.conf"
fi

# Copy default config file. If you want to manually set value, modify the default file.
cp "$DEFAULT_CONFIG_FILE" "$GNAWS_CONFIG_FILE"

set_property() {
    local key="$1"
    local config_var="$2"

    local value="${!config_var-}"
    [[ -z "$value" ]] && return

    local escaped_value
    escaped_value=$(printf '%s\n' "$value" | sed 's/[&/\]/\\&/g')

    # Replace value="..."
    sed -i "s|\(<property name=\"$key\"[^>]*value=\"\)[^\"]*|\1${escaped_value}|" "$GNAWS_CONFIG_FILE"
}

set_property "ServerPassword" CONFIG_ServerPassword
# World
set_property "GameWorld" CONFIG_GameWorld
set_property "WorldGenSeed" CONFIG_WorldGenSeed
set_property "WorldGenSize" CONFIG_WorldGenSize
set_property "DayNightLength" CONFIG_DayNightLength
set_property "DayLightLength" CONFIG_DayLightLength
# Zombie
set_property "EnemyDifficulty" CONFIG_EnemyDifficulty
set_property "ZombieFeralSense" CONFIG_ZombieFeralSense
set_property "ZombieMove" CONFIG_ZombieMove
set_property "ZombieMoveNight" CONFIG_ZombieMoveNight
set_property "ZombieFeralMove" CONFIG_ZombieFeralMove
set_property "ZombieBMMove" CONFIG_ZombieBMMove
set_property "AISmellMode" CONFIG_AISmellMode
set_property "BloodMoonFrequency" CONFIG_BloodMoonFrequency
set_property "BloodMoonRange" CONFIG_BloodMoonRange
set_property "BloodMoonEnemyCount" CONFIG_BloodMoonEnemyCount
# Difficulty
set_property "GameDifficulty" CONFIG_GameDifficulty
set_property "XPMultiplier" CONFIG_XPMultiplier
# Loot
set_property "LootAbundance" CONFIG_LootAbundance
set_property "LootRespawnDays" CONFIG_LootRespawnDays
set_property "AirDropFrequency" CONFIG_AirDropFrequency
set_property "QuestProgressionDailyLimit" CONFIG_QuestProgressionDailyLimit
# Performance
set_property "ServerMaxAllowedViewDistance" CONFIG_ServerMaxAllowedViewDistance
set_property "MaxQueuedMeshLayers" CONFIG_MaxQueuedMeshLayers
set_property "DynamicMeshEnabled" CONFIG_DynamicMeshEnabled
set_property "MaxSpawnedZombies" CONFIG_MaxSpawnedZombies
set_property "MaxSpawnedAnimals" CONFIG_MaxSpawnedAnimals

# Set admin with steam id or remove if no value
AdminSteamUserId="${CONFIG_AdminSteamUserId-}"
AdminLineTag="<!--Gnaws-->"
if [[ -f "$ADMIN_CONFIG_FILE" ]]; then
    if [[ -z "$AdminSteamUserId" || ! "$AdminSteamUserId" =~ ^[0-9]+$ ]]; then
        # Remove managed entry if exists
        sed -i "/$AdminLineTag/d" "$ADMIN_CONFIG_FILE"
    else
        ADMIN_ENTRY="<user platform=\"Steam\" userid=\"$AdminSteamUserId\" name=\"Admin\" permission_level=\"0\" />$AdminLineTag"
        # Replace existing managed entry or insert
        if grep -q "$AdminLineTag" "$ADMIN_CONFIG_FILE"; then
            sed -i "s|<user[^>]*>$AdminLineTag|${ADMIN_ENTRY}|" "$ADMIN_CONFIG_FILE"
        else
            sed -i "s|</users>|    ${ADMIN_ENTRY}\n</users>|" "$ADMIN_CONFIG_FILE"
        fi
    fi
fi

exec ./startserver.sh -configfile=gnaws.serverconfig.xml

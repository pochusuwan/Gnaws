#!/bin/bash
set -eu

TOTAL_MEM=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
MC_MEM=$(( TOTAL_MEM * 70 / 100 ))

JAVA_FLAGS=(
  -XX:+UseG1GC
  -XX:MaxGCPauseMillis=200
  -XX:+DisableExplicitGC
)

exec java "${JAVA_FLAGS[@]}" -Xms${MC_MEM}M -Xmx${MC_MEM}M -jar server.jar nogui

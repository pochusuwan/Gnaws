#!/bin/bash
set -eu

GNAWS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WAKE_FILE="$GNAWS_ROOT/metrics_wake.txt"
METRICS_FILE="$GNAWS_ROOT/metrics.txt"

# Metric collection interval in seconds
INTERVAL=3
MAX_ENTRIES=5
WAKE_DURATION=30

# Initialize metrics values
read cpu user nice system idle iowait irq softirq steal guest < /proc/stat
prev_idle=$idle
prev_total=$((user + nice + system + idle + iowait + irq + softirq + steal))

while true; do
    NOW=$(date +%s)
    # Read wake time from file and exit if age exceed threshold
    if [ ! -f "$WAKE_FILE" ]; then
        exit 0
    fi
    WAKE_TIME=$(cat "$WAKE_FILE")
    AGE=$((NOW - WAKE_TIME))
    if [ "$AGE" -gt $WAKE_DURATION ]; then
        exit 0
    fi

    # CPU
    read cpu user nice system idle iowait irq softirq steal guest < /proc/stat
    idle_now=$idle
    total_now=$((user + nice + system + idle + iowait + irq + softirq + steal))

    diff_idle=$((idle_now - prev_idle))
    diff_total=$((total_now - prev_total))

    if [ "$diff_total" -gt 0 ]; then
        cpu_usage=$(awk "BEGIN {printf \"%.2f\", (1 - $diff_idle / $diff_total) * 100}")
    else
        cpu_usage="0.00"
    fi
    prev_idle=$idle_now
    prev_total=$total_now

    # Memory
    mem_total=0
    mem_available=0

    while read key value unit; do
        case "$key" in
            MemTotal:) mem_total=$value ;;
            MemAvailable:) mem_available=$value ;;
        esac
    done < /proc/meminfo

    mem_used=$((mem_total - mem_available))
    mem_used_mb=$((mem_used / 1024))
    mem_total_mb=$((mem_total / 1024))

    # Write metrics to file
    echo "$NOW $cpu_usage $mem_used_mb $mem_total_mb" >> "$METRICS_FILE"
    # Keep only recent entries
    tail -n "$MAX_ENTRIES" "$METRICS_FILE" > "$METRICS_FILE.tmp" && mv "$METRICS_FILE.tmp" "$METRICS_FILE"

    sleep $INTERVAL
done

#!/bin/bash
set -eu

GNAWS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
METRICS_FILE=$GNAWS_ROOT/metrics.txt

date +%s > "$GNAWS_ROOT/metrics_wake.txt"

if ! systemctl is-active --quiet gnaws-metrics; then
    systemctl start gnaws-metrics
fi

[ -f "$METRICS_FILE" ] && cat "$METRICS_FILE" || echo ""

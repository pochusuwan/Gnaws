import { useEffect, useMemo, useState } from "react";
import useApiCall from "../../hooks/useApiCall";
import { GIB, type MetricEntry, type Server } from "../../types";
import "./MonitorPanel.css";

type MonitorPanelProps = {
    server: Server;
};
const GRAPH_WIDTH = 450;
const GRAPH_HEIGHT = 200;
const GRAPH_PAD = 4;

export default function MonitorPanel(props: MonitorPanelProps) {
    const { call, state } = useApiCall<{ message: string; metrics: any[] }>("serverAction");
    const [metrics, setMetrics] = useState<MetricEntry[]>([]);
    const [message, setMessage] = useState("");

    useEffect(() => {
        const interval = setInterval(() => {
            call({ serverName: props.server.name, action: "get_monitoring_metrics" });
        }, 5500);
        return () => clearInterval(interval);
    }, [call, props.server]);

    useEffect(() => {
        if (state.state !== "Loaded" || !state.data.metrics) return;
        setMessage(state.data.message);
        setMetrics((prev) => {
            return combineMetricEntries(prev, state.data.metrics);
        });
    }, [state]);

    const cpuPlotPoints = useMemo(() => {
        if (metrics.length <= 1) {
            return "";
        }
        return metrics
            .map((e, i) => {
                const x = GRAPH_PAD + (i / (metrics.length - 1)) * (GRAPH_WIDTH - GRAPH_PAD * 2);
                const y = GRAPH_HEIGHT - GRAPH_PAD - (e.cpu / 100) * (GRAPH_HEIGHT - GRAPH_PAD * 2);
                return `${x},${y}`;
            })
            .join(" ");
    }, [metrics]);
    
    const memoryPlotPoints = useMemo(() => {
        if (metrics.length <= 1) {
            return "";
        }
        return metrics
            .map((e, i) => {
                const x = GRAPH_PAD + (i / (metrics.length - 1)) * (GRAPH_WIDTH - GRAPH_PAD * 2);
                const y = GRAPH_HEIGHT - GRAPH_PAD - (e.memoryUsed / e.memoryTotal) * (GRAPH_HEIGHT - GRAPH_PAD * 2);
                return `${x},${y}`;
            })
            .join(" ");
    }, [metrics]);

    const storageMessage = useMemo(() => {
        if (props.server.status?.usedStorage && props.server.status?.totalStorage) {
            const used = parseInt(props.server.status?.usedStorage);
            const total = parseInt(props.server.status?.totalStorage);
            return "Storage: " + Math.round((used / GIB) * 100) / 100 + "/" + Math.round((total / GIB) * 100) / 100 + "GiB";
        }
        return "Storage: -";
    }, [props.server]);

    return (
        <div className="monitorPanel">
            <div>{storageMessage}</div>
            <div className="monitorGraphRow">
                <div>
                    <div>CPU %</div>
                    <svg width={GRAPH_WIDTH} height={GRAPH_HEIGHT} style={{ display: "block", background: "#111", borderRadius: 4 }}>
                        {cpuPlotPoints && <polyline points={cpuPlotPoints} fill="none" stroke="#4caf50" strokeWidth={1.5} />}
                        {metrics.length > 0 && (
                            <text x={GRAPH_WIDTH - GRAPH_PAD} y={12} fill="#4caf50" fontSize={10} textAnchor="end">
                                {metrics[metrics.length - 1].cpu.toFixed(1)}%
                            </text>
                        )}
                    </svg>
                </div>

                <div>
                    <div>Memory Usage</div>
                    <svg width={GRAPH_WIDTH} height={GRAPH_HEIGHT} style={{ display: "block", background: "#111", borderRadius: 4 }}>
                        {memoryPlotPoints && <polyline points={memoryPlotPoints} fill="none" stroke="#4caf50" strokeWidth={1.5} />}
                        {metrics.length > 0 && (
                            <text x={GRAPH_WIDTH - GRAPH_PAD} y={12} fill="#4caf50" fontSize={10} textAnchor="end">
                                {`${metrics[metrics.length - 1].memoryUsed} / ${metrics[metrics.length - 1].memoryTotal} MB`}
                            </text>
                        )}
                    </svg>
                </div>
            </div>
            <div>{message}</div>
        </div>
    );
}

const METRIC_AGE_LIMIT = 60 * 60 * 1000;
function combineMetricEntries(oldMetrics: MetricEntry[], newMetrics: MetricEntry[]): MetricEntry[] {
    let i = 0;
    let j = 0;
    const result: MetricEntry[] = [];
    while (i < oldMetrics.length && j < newMetrics.length) {
        const a = oldMetrics[i];
        const b = newMetrics[j];
        if (a.timestamp < b.timestamp) {
            result.push(a);
            i++;
        } else if (a.timestamp > b.timestamp) {
            result.push(b);
            j++;
        } else {
            result.push(b);
            i++;
            j++;
        }
    }
    while (i < oldMetrics.length) result.push(oldMetrics[i++]);
    while (j < newMetrics.length) result.push(newMetrics[j++]);
    const minStart = Date.now() - METRIC_AGE_LIMIT;
    return result.filter((m) => m.timestamp * 1000 >= minStart);
}

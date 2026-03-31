import { useEffect, useMemo } from "react";
import { GIB, type Server } from "../../types";
import "./MonitorPanel.css";
import { useMetrics } from "../../hooks/useMetrics";
import { useUser } from "../../hooks/useUser";
import { hasAdminPermission } from "../../utils";

type MonitorPanelProps = {
    server: Server;
};
const GRAPH_WIDTH = 450;
const GRAPH_HEIGHT = 200;
const GRAPH_PAD = 4;

export default function MonitorPanel(props: MonitorPanelProps) {
    const { callMonitor, metrics, message } = useMetrics(props.server.name);
    const userRole = useUser().role;

    useEffect(() => {
        const interval = setInterval(() => {
            if (hasAdminPermission(userRole)) {
                callMonitor();
            }
        }, 5500);
        return () => clearInterval(interval);
    }, [callMonitor, userRole]);

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

    if (!hasAdminPermission(userRole)) {
        return <div>No permission</div>;
    }

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

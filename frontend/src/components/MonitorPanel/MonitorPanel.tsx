import { useEffect, useMemo, useState } from "react";
import { GIB, type Server } from "../../types";
import "./MonitorPanel.css";
import { useMetrics } from "../../hooks/useMetrics";
import { useUser } from "../../hooks/useUser";
import { hasAdminPermission } from "../../utils";
import Spinner from "../Spinner/Spinner";

type MonitorPanelProps = {
    server: Server;
};
const GRAPH_WIDTH = 450;
const GRAPH_HEIGHT = 200;
const GRAPH_PAD = 4;
const MINUTE_MS = 60 * 1000;

export default function MonitorPanel(props: MonitorPanelProps) {
    const { callMonitor, metrics, message } = useMetrics(props.server.name);
    const userRole = useUser().role;
    const [windowMs, setWindowMs] = useState(5 * MINUTE_MS);

    useEffect(() => {
        const interval = setInterval(() => {
            if (hasAdminPermission(userRole)) {
                callMonitor();
            }
        }, 5500);
        return () => clearInterval(interval);
    }, [callMonitor, userRole]);

    const windowedMetrics = useMemo(() => {
        const cutoff = Date.now() - windowMs;
        return metrics.filter((m) => m.timestamp >= cutoff);
    }, [metrics, windowMs]);

    const cpuPlotPoints = useMemo(() => {
        if (windowedMetrics.length <= 1) return "";
        const now = Date.now();
        return windowedMetrics
            .map((e) => {
                const x = timestampToX(e.timestamp, now, windowMs);
                const y = GRAPH_HEIGHT - GRAPH_PAD - (e.cpu / 100) * (GRAPH_HEIGHT - GRAPH_PAD * 2);
                return `${x},${y}`;
            })
            .join(" ");
    }, [windowedMetrics, windowMs]);

    const memoryPlotPoints = useMemo(() => {
        if (windowedMetrics.length <= 1) return "";
        const now = Date.now();
        return windowedMetrics
            .map((e) => {
                const x = timestampToX(e.timestamp, now, windowMs);
                const y = GRAPH_HEIGHT - GRAPH_PAD - (e.memoryUsed / e.memoryTotal) * (GRAPH_HEIGHT - GRAPH_PAD * 2);
                return `${x},${y}`;
            })
            .join(" ");
    }, [windowedMetrics, windowMs]);

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
            {windowedMetrics.length === 0 && <Spinner />}
            <div className="monitorButtonRow"> 
                <button onClick={() => setWindowMs(5 * MINUTE_MS)}>5 Minute</button>
                <button onClick={() => setWindowMs(30 * MINUTE_MS)}>30 Minute</button>
                <button onClick={() => setWindowMs(60 * MINUTE_MS)}>60 Minute</button>
            </div>
            <div className="monitorGraphRow">
                <div>
                    <div>CPU %</div>
                    <svg width={GRAPH_WIDTH} height={GRAPH_HEIGHT} style={{ display: "block", background: "#111", borderRadius: 4 }}>
                        {cpuPlotPoints && <polyline points={cpuPlotPoints} fill="none" stroke="#4caf50" strokeWidth={1.5} />}
                        {windowedMetrics.length > 0 && (
                            <text x={GRAPH_WIDTH - GRAPH_PAD} y={12} fill="#4caf50" fontSize={10} textAnchor="end">
                                {windowedMetrics[windowedMetrics.length - 1].cpu.toFixed(1)}%
                            </text>
                        )}
                    </svg>
                </div>

                <div>
                    <div>Memory Usage</div>
                    <svg width={GRAPH_WIDTH} height={GRAPH_HEIGHT} style={{ display: "block", background: "#111", borderRadius: 4 }}>
                        {memoryPlotPoints && <polyline points={memoryPlotPoints} fill="none" stroke="#4caf50" strokeWidth={1.5} />}
                        {windowedMetrics.length > 0 && (
                            <text x={GRAPH_WIDTH - GRAPH_PAD} y={12} fill="#4caf50" fontSize={10} textAnchor="end">
                                {`${windowedMetrics[windowedMetrics.length - 1].memoryUsed} / ${windowedMetrics[windowedMetrics.length - 1].memoryTotal} MB`}
                            </text>
                        )}
                    </svg>
                </div>
            </div>
            <div>{message}</div>
        </div>
    );
}

function timestampToX(timestamp: number, now: number, windowMs: number) {
    const width = (GRAPH_WIDTH - GRAPH_PAD * 2)
    return GRAPH_PAD + width * ((timestamp - (now - windowMs)) / windowMs);
}

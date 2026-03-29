import { useCallback, useEffect } from "react";
import useApiCall from "../../hooks/useApiCall";
import type { Server } from "../../types";

type MonitorPanelProps = {
    server: Server
}

export default function MonitorPanel(props: MonitorPanelProps) {
    const { call, state } = useApiCall<{ message: string }>("serverAction");
    const callMonitor = useCallback(() => {
        call({ serverName: props.server.name, action: "get_monitoring_metrics" })
    }, [call, props.server]);

    useEffect(() => {
        console.debug(state)
    }, [state]);
    return (
        <div className="monitorPanel">
            <h2>Monitor</h2>
            <button onClick={() => callMonitor()}>call</button>
        </div>
    )
}
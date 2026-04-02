import React, { useContext, createContext, useState, useCallback } from "react";
import type { MetricEntry } from "../types";
import useApiCall from "./useApiCall";

export const MetricsContext = createContext<MetricsContextType | null>(null);

type MetricsContextType = {
    metrics: { [serverName: string]: MetricEntry[] };
    callMonitor: (serverName: string) => void;
    message: string;
};
export function MetricsProvider({ children }: { children: React.ReactNode }) {
    const { call } = useApiCall<{ message: string; metrics: MetricEntry[] }>("serverAction");
    const [metrics, setMetrics] = useState<{ [serverName: string]: MetricEntry[] }>({});
    const [message, setMessage] = useState("");

    const callMonitor = useCallback(async (serverName: string) => {
        const result = await call({ serverName: serverName, action: "get_monitoring_metrics" });
        if (result) {
            setMessage(result.message);
            setMetrics((prev) => {
                return { ...prev, [serverName]: combineMetricEntries(prev[serverName] ?? [], result.metrics) };
            });
        }
    }, []);

    return <MetricsContext.Provider value={{ metrics, callMonitor, message }}>{children}</MetricsContext.Provider>;
}

export const useMetrics = (serverName: string) => {
    const context = useContext(MetricsContext);

    if (context === null) {
        throw new Error("Metrics not found in context");
    }
    const callMonitor = useCallback(() => {
        context.callMonitor(serverName);
    }, [context.callMonitor, serverName]);

    return { callMonitor, message: context.message, metrics: context.metrics[serverName] ?? [] };
};

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

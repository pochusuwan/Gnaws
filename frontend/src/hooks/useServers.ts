import { useState, useEffect, useRef, useCallback } from "react";
import { loadedState, loadingState, type NetworkDataState, type Server, type User } from "../types";
import useApiCall from "./useApiCall";
import { serverHasRunningTask, serverRefreshingStatus } from "../utils";

const AUTO_REFRESH_LIMIT = 20;

export const useServers = (user: User | null) => {
    const [servers, setServers] = useState<NetworkDataState<Server[]>>(loadingState());
    const { call: getServersCall, state: getServersState, inFlight } = useApiCall<{ servers: Server[] }>("getServers");
    const refreshQueueRef = useRef<Set<string>>(new Set());
    const serverWithRunningTask = useRef<Set<string>>(new Set());
    const refreshStatusRef = useRef<boolean>(false);
    const refreshTimerRef = useRef<number>(null);
    const autoRefreshCount = useRef(0);

    // Make getServers call which will update getServersState
    const flushRefresh = useCallback(() => {
        if (refreshQueueRef.current.size === 0) return;
        // If another flush is requested while inflight, it will be ignored until next refresh start;
        if (inFlight.current) return;

        const serverNames = Array.from(refreshQueueRef.current);
        const refreshStatus = refreshStatusRef.current;

        refreshQueueRef.current.clear();
        refreshStatusRef.current = false;

        if (refreshTimerRef.current !== null) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
        
        getServersCall({ serverNames, refreshStatus });
    }, [getServersCall]);

    // Add server names to refresh queue. Flush request if needed
    const scheduleRefresh = useCallback(
        (serverNames: string[], refreshStatus: boolean, flush: boolean) => {
            serverNames.forEach((name) => refreshQueueRef.current.add(name));
            
            if (refreshStatus) {
                refreshStatusRef.current = true;
            }

            if (flush) {
                flushRefresh();
                return;
            }

            if (refreshTimerRef.current !== null) return;

            refreshTimerRef.current = setTimeout(() => {
                flushRefresh();
            }, 5000);
        },
        [flushRefresh],
    );

    // Callback to refresh server status now
    const refreshServer = useCallback(
        (serverName: string) => {
            autoRefreshCount.current = 0;
            scheduleRefresh([serverName], true, true);
        },
        [scheduleRefresh],
    );

    // On server response, update servers data and schedule update if needed
    useEffect(() => {
        if (getServersState.state === "Loaded") {
            // Limit auto refresh and reset on explicit user refresh
            if (autoRefreshCount.current >= AUTO_REFRESH_LIMIT) return;

            const targets = computeRefreshTargets(getServersState.data.servers, serverWithRunningTask.current);
            if (targets.serverNames.length > 0) {
                autoRefreshCount.current += 1;

                scheduleRefresh(targets.serverNames, targets.refreshStatus, false);
            }
            serverWithRunningTask.current = new Set(
                getServersState.data.servers.filter((server) => serverHasRunningTask(server)).map((server) => server.name),
            );
        }

        setServers((prev) => mergeServersResponse(prev, getServersState));
    }, [getServersState, scheduleRefresh]);

    // When user login or logout, clear or start get server call;
    useEffect(() => {
        refreshQueueRef.current.clear();
        serverWithRunningTask.current.clear();
        refreshStatusRef.current = false;
        refreshTimerRef.current = null;
        autoRefreshCount.current = 0;
        if (user) {
            getServersCall({ refreshStatus: true });
        } else {
            setServers(loadingState());
        }
    }, [user]);

    // Clean up timeout
    useEffect(() => {
        return () => {
            if (refreshTimerRef.current !== null) {
                clearTimeout(refreshTimerRef.current);
            }
        };
    }, []);

    return { servers, refreshServer };
};

function computeRefreshTargets(servers: Server[], serverWithRunningTask: Set<String>) {
    let refreshStatus = false;
    const serverNames = servers
        .filter((server) => {
            // Refresh server if has running task
            // Or previously running task ended
            // Or refreshing status
            if (serverHasRunningTask(server)) {
                return true;
            }
            if (serverWithRunningTask.has(server.name)) {
                refreshStatus = true;
                return true;
            }
            return serverRefreshingStatus(server);
        })
        .map((server) => server.name);
    return {
        serverNames,
        refreshStatus,
    };
}

function mergeServersResponse(currentServers: NetworkDataState<Server[]>, newResponse: NetworkDataState<{ servers: Server[] }>) {
    if (newResponse.state === "Error") {
        // For error state, only set state if not loaded. Otherwise, ignore.
        if (currentServers.state !== "Loaded") {
            return newResponse;
        } else {
            return currentServers;
        }
    } else if (newResponse.state === "Loaded") {
        // If already loaded, merge data
        if (currentServers.state === "Loaded") {
            const newMap = Object.fromEntries(newResponse.data.servers.map((s) => [s.name, s]));

            const merged = currentServers.data.map((s) => {
                const replacement = newMap[s.name];
                if (replacement) {
                    delete newMap[s.name];
                    return replacement;
                }
                return s;
            });

            const updated = [...merged, ...Object.values(newMap)];
            return loadedState(updated);
        } else {
            return loadedState(newResponse.data.servers);
        }
    }

    return currentServers;
}

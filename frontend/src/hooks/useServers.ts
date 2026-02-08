import { useState, useEffect, useCallback, useRef } from "react";
import { loadedState, loadingState, type NetworkDataState, type Server, type User } from "../types";
import useApiCall from "./useApiCall";

const AUTO_REFRESH_LIMIT = 20;

export const useServers = (user: User | null) => {
    const [servers, setServers] = useState<NetworkDataState<Server[]>>(loadingState());
    const { call, state } = useApiCall<{ servers: Server[] }>("getServers");
    const autoRefreshCount = useRef(0);
    const serversRef = useRef<Server[]>([]);

    const refreshServers = useCallback(() => {
        autoRefreshCount.current = 0;
        call({ refreshStatus: true })
    }, [call]);

    useEffect(() => {
        if (state.state === "Loaded") {
            const serversResponse = state.data.servers;
            const { shouldRefresh, refreshStatus } = shouldRefreshServers(serversResponse, serversRef.current);
            if (shouldRefresh && autoRefreshCount.current <= AUTO_REFRESH_LIMIT) {
                autoRefreshCount.current += 1;
                setTimeout(() => {
                    call({ refreshStatus });
                }, 5000);
            }
            setServers(loadedState(serversResponse));
            serversRef.current = serversResponse;
        } else if (state.state === "Error") {
            setServers(state);
        }
    }, [state, call]);

    useEffect(() => {
        if (user) {
            refreshServers();
        } else {
            setServers(loadingState());
        }
    }, [user, refreshServers]);

    return { servers, refreshServers };
};

function shouldRefreshServers(servers: Server[], prevServers: Server[]): { shouldRefresh: boolean, refreshStatus: boolean } {
    // Refresh if server has running task
    if (hasRunningTask(servers)) {
        return { shouldRefresh: true, refreshStatus: false };
    }
    // Refresh and query status if server previously had running task
    if (hasRunningTask(prevServers)) {
        return { shouldRefresh: true, refreshStatus: true };
    }

    const shouldRefresh = servers.some((server) => {
        const statusLastRequest = server.status?.lastRequest;
        const statusLastUpdated = server.status?.lastUpdated;
        // If status was not requested
        if (statusLastRequest === undefined) {
            return false;
        }
        // If requested but not updated
        if (statusLastUpdated === undefined) {
            return true;
        }
        // Requested after updated
        return new Date(statusLastRequest) > new Date(statusLastUpdated);
    });
    return { shouldRefresh, refreshStatus: false };
}

function hasRunningTask(servers: Server[]) {
    return servers.some((server) => server.workflow?.status === "running");
}

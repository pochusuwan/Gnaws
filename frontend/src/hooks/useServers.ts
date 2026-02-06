import { useState, useEffect, useCallback, useRef } from "react";
import { errorState, loadedState, loadingState, type NetworkDataState, type Server, type User } from "../types";
import useApiCall from "./useApiCall";

const AUTO_REFRESH_LIMIT = 10;

export const useServers = (user: User | null) => {
    const [servers, setServers] = useState<NetworkDataState<Server[]>>(loadingState());
    const { call, state } = useApiCall<{ servers: Server[] }>("getServers");
    const autoRefreshCount = useRef(0);

    const refreshServers = useCallback(() => {
        autoRefreshCount.current = 0;
        call({ refreshStatus: true })
    }, [call]);

    useEffect(() => {
        if (state.state === "Loaded") {
            const serversResponse = state.data.servers;
            setServers(loadedState(serversResponse));
            if (shouldRefresh(serversResponse) && autoRefreshCount.current <= AUTO_REFRESH_LIMIT) {
                autoRefreshCount.current += 1;
                setTimeout(() => {
                    call({ refreshStatus: false });
                }, 5000);
            }
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

function shouldRefresh(servers: Server[]) {
    return servers.some((server) => {
        const workflowStatus = server.workflow?.status;
        const statusLastRequest = server.status?.lastRequest;
        const statusLastUpdated = server.status?.lastUpdated;
        if (workflowStatus === "running") {
            return true;
        }
        // If status was not requested
        if (statusLastRequest === undefined) {
            return false;
        }
        // If requested but updated
        if (statusLastUpdated === undefined) {
            return true;
        }
        // Requested after updated
        return new Date(statusLastRequest) > new Date(statusLastUpdated);
    });
}

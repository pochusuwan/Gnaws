import { useState, useEffect, useCallback, useRef } from "react";
import type { Server, User } from "../types";
import useApiCall from "./useApiCall";

const AUTO_REFRESH_LIMIT = 10;

export const useServers = (user: User | null) => {
    const [initialized, setInitialized] = useState(false);
    const [servers, setServers] = useState<Server[]>([]);
    const { call } = useApiCall<{ servers: Server[] }>("getServers");
    const autoRefreshCount = useRef(0);

    const loadServers = useCallback(
        async (refreshStatus: boolean) => {
            const data = await call({ refreshStatus });
            const servers = data?.servers;
            if (servers) {
                setInitialized(true);
                setServers(servers);
                if (refreshStatus) {
                    autoRefreshCount.current = 0;
                }

                if (shouldRefresh(servers) && autoRefreshCount.current <= AUTO_REFRESH_LIMIT) {
                    autoRefreshCount.current += 1;
                    setTimeout(() => {
                        loadServers(false);
                    }, 5000);
                }
            }
        },
        [call],
    );

    useEffect(() => {
        if (user) {
            loadServers(true);
        } else {
            setServers([]);
        }
    }, [user]);

    return { initialized, servers, loadServers };
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

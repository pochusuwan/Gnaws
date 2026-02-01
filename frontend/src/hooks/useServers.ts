import { useState, useEffect, useCallback } from "react";
import type { Server, User } from "../types";
import useApiCall from "./useApiCall";

export const useServers = (user: User | null) => {
    const [initialized, setInitialized] = useState(false);
    const [servers, setServers] = useState<Server[]>([]);
    const { call } = useApiCall<{ servers: Server[] }>("getServers");

    const loadServers = useCallback(
        async (refreshStatus: boolean) => {
            const data = await call({ refreshStatus });
            if (data?.servers) {
                setInitialized(true);
                setServers(data?.servers);
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

    return { initialized, servers, loadServers: () => {} };
};

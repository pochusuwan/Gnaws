import type { Server } from "./types";

export function serverRefreshingStatus(server: Server): boolean {
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
}

export function serverHasRunningTask(server: Server): boolean {
    return server.workflow?.status === "running";
}

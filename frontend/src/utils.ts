import { Role, type Server } from "./types";

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

export function hasUserPermission(role: Role): boolean {
    return role === Role.User || role === Role.Admin || role === Role.Owner;
}

export function hasAdminPermission(role: Role): boolean {
    return role === Role.Admin || role === Role.Owner;
}

export function hasOwnerPermission(role: Role): boolean {
    return role === Role.Owner;
}

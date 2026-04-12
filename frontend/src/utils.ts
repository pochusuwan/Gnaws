import { Role, type Configuration, type Server } from "./types";

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

export function buildConfigHint(config: Configuration): string {
    if (config.type === "alphanumeric") {
        if (config.minLength !== undefined && config.maxLength !== undefined) return `${config.minLength}–${config.maxLength} characters.`;
        else if (config.minLength !== undefined) return `Min ${config.minLength} characters.`;
        else if (config.maxLength !== undefined) return `Max ${config.maxLength} characters.`;
    } else if (config.type === "numeric") {
        if (config.minValue !== undefined && config.maxValue !== undefined) return `${config.minValue}–${config.maxValue}.`;
        else if (config.minValue !== undefined) return `Min ${config.minValue}.`;
        else if (config.maxValue !== undefined) return `Max ${config.maxValue}.`;
    } 
    return "";
}

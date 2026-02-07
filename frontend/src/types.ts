export const HOUR_IN_MS = 60 * 60 * 1000;
export const GIB = 1024 * 1024 * 1024;

export enum Role {
    Admin = "admin",
    Manager = "manager",
    New = "new",
}

export type User = {
    username: string;
    role: Role;
};

export type Server = {
    name: string;
    game?: {
        name?: string;
    };
    ec2?: {
        instanceId?: string;
        instanceType?: string;
        securityGroupId?: string;
        status?: string;
        message?: string;
    };
    status?: {
        status?: string;
        message?: string;
        ipAddress?: string;
        totalStorage?: string;
        usedStorage?: string;
        playerCount?: number;
        lastBackup?: string;
        lastUpdated?: string;
        lastRequest?: string;
    };
    workflow?: {
        currentTask?: string;
        executionId?: string;
        lastUpdated?: string;
        status?: string;
        message?: string;
    };
};

export type Port = {
    port: number;
    protocol: string;
};
export type Game = {
    id: string;
    displayName: string;
    ec2: {
        instanceType: string;
        minimumInstanceType: string;
        storage: number;
        ports: Port[];
    };
};

export type EmptyState = {
    state: "Empty";
}

export type LoadingState = {
    state: "Loading";
}

export type LoadedState<T> = {
    state: "Loaded";
    data: T;
};

export type ErrorState = {
    state: "Error";
    error: string;
}

export const emptyState = (): EmptyState => ({ state: "Empty" });
export const loadingState = (): LoadingState => ({ state: "Loading" });
export const loadedState = <T>(data: T): LoadedState<T> => ({ state: "Loaded", data });
export const errorState = (error: string): ErrorState => ({ state: "Error", error });

export type NetworkDataState<T> = EmptyState | LoadingState | LoadedState<T> | ErrorState;

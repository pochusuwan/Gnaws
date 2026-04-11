export const HOUR_IN_MS = 60 * 60 * 1000;
export const GIB = 1024 * 1024 * 1024;

export enum Role {
    New = "new",
    User = "user",
    Admin = "admin",
    Owner = "owner",
}

export type User = {
    username: string;
    role: Role;
};

export type ServerGameConfig = {
    id: string;
    value?: string | number | boolean;
}
export type Server = {
    name: string;
    game: {
        id: string;
        name: string;
        messages?: Message[];
        supportServerCommand?: boolean;
        releaseVersion: string;
        configurations?: ServerGameConfig[]
    };
    ec2: {
        instanceId?: string;
        instanceType?: string;
        securityGroupId?: string;
        status?: string;
        ipAddress?: string;
        message?: string;
    };
    status?: {
        status?: string;
        message?: string;
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
    configuration?: {
        autoShutdownMinute?: number;
        scheduledShutdownDisabled?: boolean;
        customSubdomain?: string;
    };
    scheduledShutdown?: {
        shutdownTime?: string;
    };
    autoShutdown?: {
        executionId?: string;
        status?: string;
        lastUpdated?: string;
    };
    metrics?: {
        executionId?: string;
        startedAt?: number;
        lastCompletedAt?: number;
        entries?: MetricEntry[];
    }
};

export type MetricEntry = {
    timestamp: number,
    cpu: number,
    memoryUsed: number,
    memoryTotal: number,
}

export enum Protocol {
    TCP = "tcp",
    UDP = "udp",
}
export type Port = {
    port: number;
    protocol: Protocol;
};
export type TermsOfService = {
    name: string;
    url: string;
    type: string;
};
export type Message = {
    type: string;
    text: string;
};
type BaseConfiguration = {
    id: string;
    displayName: string;
    description: string;
}
export type AlphanumericConfig = BaseConfiguration & {
    type: "alphanumeric";
    minLength?: number;
    maxLength?: number;
    default?: string;
}
export type NumericConfig = BaseConfiguration & {
    type: "numeric";
    minValue?: number;
    maxValue?: number;
    default?: number;
}
export type BooleanConfig = BaseConfiguration & {
    type: "boolean";
    default: boolean;
}
export type Configuration = AlphanumericConfig | NumericConfig | BooleanConfig;
export type Game = {
    id: string;
    displayName: string;
    ec2: {
        instanceType: string;
        minimumInstanceType: string;
        storage: number;
        ports: Port[];
    };
    termsOfService?: TermsOfService[];
    messages?: Message[];
    configurations?: Configuration[];
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

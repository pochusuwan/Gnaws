export type Request = {
    requestType: string;
    params: any;
};

export type Server = {
    name: string;
    game?: {
        id: string;
        name: string;
        messages?: Message[];
        supportServerCommand?: boolean;
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
    configuration?: {
        autoShutdownMinute?: number;
        scheduledShutdownDisabled?: boolean;
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
    memory: number,
}

export type Port = {
    port: number;
    protocol: string;
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
    supportServerCommand?: boolean;
};

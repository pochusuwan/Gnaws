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
        releaseVersion: string;
        configurations?: {
            id: string;
            value: string | number | boolean;
        }[]
    };
    ec2?: {
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
    supportServerCommand?: boolean;
    configurations?: Configuration[];
};

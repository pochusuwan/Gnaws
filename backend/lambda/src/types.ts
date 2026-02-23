export type Request = {
    requestType: string;
    params: any;
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

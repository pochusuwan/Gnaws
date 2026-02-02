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

import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { ROLE_ADMIN, ROLE_MANAGER, User } from "./users";
import { DeleteItemCommand, GetItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient, ec2Client, ssmClient } from "./clients";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
    BACKUP_SERVER_FUNCTION_ARN,
    getServerStatusWorkflow,
    START_SERVER_FUNCTION_ARN,
    startWorkflow,
    STOP_SERVER_FUNCTION_ARN,
    TERMINATE_SERVER_FUNCTION_ARN,
    UPDATE_SERVER_FUNCTION_ARN,
} from "./workflows";
import { clientError, forbidden, serverError, success } from "./util";
import { _InstanceType, StartInstancesCommand, StopInstancesCommand } from "@aws-sdk/client-ec2";
import { Server } from "./types";
import { SendCommandCommand } from "@aws-sdk/client-ssm";

const BACKUP_BUCKET_NAME = process.env.BACKUP_BUCKET_NAME!;

const SERVER_TABLE = process.env.SERVER_TABLE_NAME!;
const WORKFLOW_TABLE = process.env.WORKFLOW_TABLE_NAME!;
const LOCK_TIMEOUT_MS = 60 * 60 * 1000;
const GET_STATUS_TIMEOUT = 30 * 1000;

const ACTION_START = "start";
const ACTION_STOP = "stop";
const ACTION_BACKUP = "backup";
const ACTION_UPDATE = "update";
const ACTION_START_INSTANCE = "startinstance";
const ACTION_STOP_INSTANCE = "stopinstance";
const ACTION_STOP_GAME = "stopgame";
const ACTION_REMOVE_LOCK = "removelock";
const ACTION_TERMINATE = "terminate";
const SERVER_ACTIONS = [
    ACTION_START,
    ACTION_STOP,
    ACTION_BACKUP,
    ACTION_UPDATE,
    ACTION_START_INSTANCE,
    ACTION_STOP_INSTANCE,
    ACTION_STOP_GAME,
    ACTION_REMOVE_LOCK,
    ACTION_TERMINATE,
];

export const getServers = async (user: User, params: any): Promise<APIGatewayProxyResult> => {
    const refreshStatus = !!params?.refreshStatus;
    const serverNames = params?.serverNames;

    let servers;
    if (serverNames === undefined) {
        try {
            servers = await getAllServersFromDB();
        } catch (e) {
            return serverError("Failed to get servers");
        }
    } else {
        if (!Array.isArray(serverNames) || serverNames.length === 0) {
            return clientError("Invalid request");
        }
        if (serverNames.some((name) => typeof name !== "string")) {
            return clientError("Invalid request");
        }
        servers = await getServersFromDB(serverNames);
        if (servers.length === 0) {
            return serverError("Failed to get servers");
        }
    }

    if (!refreshStatus) {
        return success({ servers });
    }

    const now = new Date();
    const promises: Promise<any>[] = [];
    servers.forEach((server) => {
        const lastRequest = server?.status?.lastRequest;
        const lastUpdate = server?.status?.lastUpdated;
        const lastRequested = lastRequest ? new Date(lastRequest) : undefined;
        const lastUpdated = lastUpdate ? new Date(lastUpdate) : undefined;
        const instanceId = server.ec2?.instanceId;
        if (
            instanceId &&
            (!lastRequested || now.getTime() - lastRequested.getTime() > GET_STATUS_TIMEOUT) &&
            (!lastUpdated || now.getTime() - lastUpdated.getTime() > GET_STATUS_TIMEOUT)
        ) {
            server.status = {
                ...server.status,
                lastRequest: now.toISOString(),
            };
            promises.push(
                updateServerAttributes(server.name, {
                    status: server.status,
                }),
            );
            promises.push(getServerStatusWorkflow(server.name, instanceId));
        }
    });

    const results = await Promise.allSettled(promises);
    const isSuccess = results.filter((result) => result.status === "rejected").length === 0;
    if (!isSuccess) {
        return serverError("Failed to get servers status");
    }
    return success({ servers });
};

const getAllServersFromDB = async (): Promise<Server[]> => {
    const command = new ScanCommand({
        TableName: SERVER_TABLE,
    });
    const result = await dynamoClient.send(command);
    return (result.Items?.map((item) => unmarshall(item)) as Server[]) ?? [];
};

// Get servers from names. If not valid, return null.
const getServersFromDB = async (serverNames: string[]): Promise<Server[]> => {
    const promises = serverNames.map((name: string) => getServerFromDB(name));
    const results = await Promise.allSettled(promises);
    return results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value)
        .filter((server) => server !== null) as Server[];
};

// Get server from name. If not valid, return null.
const getServerFromDB = async (name: string): Promise<Server | null> => {
    try {
        const result = await dynamoClient.send(
            new GetItemCommand({
                TableName: SERVER_TABLE,
                Key: { name: { S: name } },
            }),
        );

        if (!result.Item) {
            return null;
        }
        return unmarshall(result.Item) as Server;
    } catch (e) {
        return null;
    }
};

export const serverAction = async (user: User, params: any): Promise<APIGatewayProxyResult> => {
    if (user.role !== ROLE_ADMIN && user.role !== ROLE_MANAGER) {
        return forbidden();
    }
    if (typeof params.serverName !== "string" || typeof params.action !== "string" || !SERVER_ACTIONS.includes(params.action)) {
        return clientError("Invalid request");
    }
    const serverName = params.serverName;
    const action = params.action;
    const shouldBackup = typeof params.shouldBackup === "boolean" ? params.shouldBackup : false;

    const server = await getServerFromDB(serverName);
    if (!server) {
        return clientError("Server not found");
    }
    const instanceId = server.ec2?.instanceId;
    if (!instanceId) {
        return serverError("Server has no instance id");
    }
    // Server action without workflow lock
    if (action === ACTION_REMOVE_LOCK) {
        return removeWorkflowLock(instanceId);
    }
    if (action === ACTION_START_INSTANCE) {
        return startInstance(instanceId);
    }
    if (action === ACTION_STOP_INSTANCE) {
        return stopInstance(instanceId);
    }
    if (action === ACTION_STOP_GAME) {
        return stopGameServer(instanceId);
    }

    // Acquire lock
    try {
        await aquireWorkflowLock(instanceId, action);
    } catch (err: any) {
        if (err.name === "ConditionalCheckFailedException") {
            return clientError("Another action in progress");
        } else {
            return serverError("Failed to get workflow lock");
        }
    }

    let result;
    if (action === ACTION_START) {
        result = await startWorkflow(server.name, instanceId, START_SERVER_FUNCTION_ARN);
    }
    if (action === ACTION_STOP) {
        result = await startWorkflow(server.name, instanceId, STOP_SERVER_FUNCTION_ARN, {
            backupBucketName: BACKUP_BUCKET_NAME,
            shouldBackup,
        });
    }
    if (action === ACTION_BACKUP) {
        result = await startWorkflow(server.name, instanceId, BACKUP_SERVER_FUNCTION_ARN, { backupBucketName: BACKUP_BUCKET_NAME });
    }
    if (action === ACTION_UPDATE) {
        result = await startWorkflow(server.name, instanceId, UPDATE_SERVER_FUNCTION_ARN);
    }
    if (action === ACTION_TERMINATE) {
        const securityGroupId = server.ec2?.securityGroupId;
        result = await startWorkflow(
            server.name,
            instanceId,
            TERMINATE_SERVER_FUNCTION_ARN,
            securityGroupId ? { securityGroupId } : undefined,
        );
    }
    if (!result) {
        // Failed to start workflow. Remove lock and return error
        try {
            await dynamoClient.send(
                new DeleteItemCommand({
                    TableName: WORKFLOW_TABLE,
                    Key: {
                        resourceId: { S: instanceId },
                    },
                }),
            );
            return serverError("Failed to start action");
        } catch (e) {
            return serverError("Failed to start action");
        }
    }
    // Workflow started. Update server table
    try {
        await updateServerAttributes(server.name, {
            workflow: {
                currentTask: action,
                executionId: result.executionId,
                status: "running",
                lastUpdated: result.startedAt.toISOString(),
            },
        });
    } catch (e) {
        return success({ message: "Started" });
    }
    return success({ message: "Started" });
};

export const aquireWorkflowLock = async (resourceId: string, action: string) => {
    const now = Date.now();
    await dynamoClient.send(
        new PutItemCommand({
            TableName: WORKFLOW_TABLE,
            Item: {
                resourceId: { S: resourceId },
                workflow: { S: action },
                startedAt: { N: now.toString() },
            },
            ConditionExpression: "attribute_not_exists(resourceId)",
            // Always block for now if workflow exist
            // ConditionExpression: "attribute_not_exists(resourceId) OR startedAt < :expiry",
            // ExpressionAttributeValues: {
            // ":expiry": { N: (now - LOCK_TIMEOUT_MS).toString() },
            // },
        }),
    );
};

export const updateServerAttributes = async (name: string, server: Partial<Server>) => {
    const updates: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};

    if (server.ec2) {
        updates.push("#ec2 = :ec2");
        names["#ec2"] = "ec2";
        values[":ec2"] = server.ec2;
    }
    if (server.status) {
        updates.push("#status = :status");
        names["#status"] = "status";
        values[":status"] = server.status;
    }
    if (server.workflow) {
        updates.push("#workflow = :workflow");
        names["#workflow"] = "workflow";
        values[":workflow"] = server.workflow;
    }
    await dynamoClient.send(
        new UpdateItemCommand({
            TableName: SERVER_TABLE,
            Key: { name: { S: name } },
            UpdateExpression: `SET ${updates.join(", ")}`,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: marshall(values),
        }),
    );
};

const removeWorkflowLock = async (instanceId: string): Promise<APIGatewayProxyResult> => {
    try {
        await dynamoClient.send(
            new DeleteItemCommand({
                TableName: WORKFLOW_TABLE,
                Key: {
                    resourceId: { S: instanceId },
                },
            }),
        );
    } catch (e) {
        console.error(e)
        return serverError("Failed to remove workflow lock");
    }
    return success({ message: "Workflow lock removed" });
};

const startInstance = async (instanceId: string): Promise<APIGatewayProxyResult> => {
    try {
        await ec2Client.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
    } catch (e) {
        console.error(e);
        return serverError("Failed to start instance");
    }
    return success({ message: "Starting" });
};

const stopInstance = async (instanceId: string): Promise<APIGatewayProxyResult> => {
    try {
        await ec2Client.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
    } catch (e) {
        console.error(e);
        return serverError("Failed to stop instance");
    }
    return success({ message: "Stopping" });
};

const stopGameServer = async (instanceId: string): Promise<APIGatewayProxyResult> => {
    try {
        const response = await ssmClient.send(
            new SendCommandCommand({
                InstanceIds: [instanceId],
                DocumentName: "AWS-RunShellScript",
                Parameters: {
                    commands: ["/opt/gnaws/scripts/stop_server.sh"],
                },
            }),
        );
        const commandId = response.Command?.CommandId;
        if (!commandId) {
            return serverError("Failed to send SSM command");
        }
        return success({ message: "Stopping game server" });
    } catch (e) {
        console.error(e);
        return serverError("Failed to send SSM command");
    }
};

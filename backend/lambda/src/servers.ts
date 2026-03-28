import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER, User } from "./users";
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
import {
    _InstanceType,
    DescribeInstancesCommand,
    ModifyVolumeCommand,
    StartInstancesCommand,
    StopInstancesCommand,
} from "@aws-sdk/client-ec2";
import { Server } from "./types";
import { SendCommandCommand } from "@aws-sdk/client-ssm";
import { addHourToShutdown, changeInstanceType, getNewShutdownTime, toggleScheduledShutdown } from "./serverConfig";

const BACKUP_BUCKET_NAME = process.env.BACKUP_BUCKET_NAME!;

const SERVER_TABLE = process.env.SERVER_TABLE_NAME!;
const WORKFLOW_TABLE = process.env.WORKFLOW_TABLE_NAME!;
const LOCK_TIMEOUT_MS = 60 * 60 * 1000;
const GET_STATUS_TIMEOUT = 20 * 1000;

const ACTION_START = "start";
const ACTION_STOP = "stop";
const ACTION_BACKUP = "backup";
const ACTION_UPDATE = "update";
const ACTION_START_INSTANCE = "start_instance";
const ACTION_STOP_INSTANCE = "stop_instance";
const ACTION_STOP_GAME = "stop_game";
const ACTION_SEND_SERVER_COMMAND = "send_server_command";
const ACTION_REMOVE_LOCK = "remove_lock";
const ACTION_INCREASE_STORAGE = "increase_storage";
const ACTION_TERMINATE = "terminate";
const ACTION_CHANGE_INSTANCE_TYPE = "change_instance_type";
const ACTION_TOGGLE_SCHEDULED_SHUTDOWN = "toggle_scheduled_shutdown";
const ACTION_ADD_HOUR = "add_hour";

const ALL_USERS = [ROLE_OWNER, ROLE_ADMIN, ROLE_USER];
const ADMIN_USERS = [ROLE_OWNER, ROLE_ADMIN];
const SERVER_ACTIONS: { [action: string]: string[] } = {
    [ACTION_START]: ALL_USERS,
    [ACTION_STOP]: ALL_USERS,
    [ACTION_BACKUP]: ADMIN_USERS,
    [ACTION_UPDATE]: ADMIN_USERS,
    [ACTION_START_INSTANCE]: ADMIN_USERS,
    [ACTION_STOP_INSTANCE]: ADMIN_USERS,
    [ACTION_STOP_GAME]: ADMIN_USERS,
    [ACTION_SEND_SERVER_COMMAND]: ADMIN_USERS,
    [ACTION_REMOVE_LOCK]: ADMIN_USERS,
    [ACTION_INCREASE_STORAGE]: ADMIN_USERS,
    [ACTION_TERMINATE]: ADMIN_USERS,
    [ACTION_CHANGE_INSTANCE_TYPE]: ADMIN_USERS,
    [ACTION_TOGGLE_SCHEDULED_SHUTDOWN]: ADMIN_USERS,
    [ACTION_ADD_HOUR]: ALL_USERS,
};

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
        // TODO: This should not start new workflow if one is running, unless it's running for too long.
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

export const getAllServersFromDB = async (): Promise<Server[]> => {
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
export const getServerFromDB = async (name: string): Promise<Server | null> => {
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
    if (typeof params.serverName !== "string" || typeof params.action !== "string") {
        return clientError("Invalid request");
    }
    if (SERVER_ACTIONS[params.action]?.includes(user.role) !== true) {
        return forbidden();
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
    if (action === ACTION_SEND_SERVER_COMMAND) {
        return sendServerCommand(server, instanceId, params.command);
    }
    if (action === ACTION_INCREASE_STORAGE) {
        return increaseStorage(server, params.storage);
    }
    if (action === ACTION_CHANGE_INSTANCE_TYPE) {
        return changeInstanceType(server, params.instanceType);
    }
    if (action === ACTION_TOGGLE_SCHEDULED_SHUTDOWN) {
        return toggleScheduledShutdown(server);
    }
    if (action === ACTION_ADD_HOUR) {
        return addHourToShutdown(server);
    }

    // Acquire lock
    try {
        await aquireWorkflowLock(instanceId, action);
    } catch (e: any) {
        if (e.name === "ConditionalCheckFailedException") {
            return clientError("Another action in progress");
        } else {
            console.error(`Failed to get workflow lock: ${e.message}`);
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
            scheduledShutdown: action === ACTION_START &&
                action === ACTION_START
                    ? {
                          shutdownTime: getNewShutdownTime(server, false)?.toISOString(),
                      }
                    : undefined,
        });
    } catch (e) {
        return success({ message: "Started" });
    }
    return success({ message: "Started" });
};

export const aquireWorkflowLock = async (resourceId: string, action: string) => {
    await dynamoClient.send(
        new PutItemCommand({
            TableName: WORKFLOW_TABLE,
            Item: {
                resourceId: { S: resourceId },
                workflow: { S: action },
                startedAt: { S: new Date().toISOString() },
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
    if (server.autoShutdown) {
        updates.push("#autoShutdown = :autoShutdown");
        names["#autoShutdown"] = "autoShutdown";
        values[":autoShutdown"] = server.autoShutdown;
    }
    if (server.configuration) {
        updates.push("#configuration = :configuration");
        names["#configuration"] = "configuration";
        values[":configuration"] = server.configuration;
    }
    if (server.scheduledShutdown) {
        updates.push("#scheduledShutdown = :scheduledShutdown");
        names["#scheduledShutdown"] = "scheduledShutdown";
        values[":scheduledShutdown"] = server.scheduledShutdown;
    }
    await dynamoClient.send(
        new UpdateItemCommand({
            TableName: SERVER_TABLE,
            Key: { name: { S: name } },
            UpdateExpression: `SET ${updates.join(", ")}`,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: marshall(values, { removeUndefinedValues: true }),
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
        console.error(e);
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
                    commands: ["/opt/gnaws/entrypoints/stop_server.sh"],
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

const sendServerCommand = async (server: Server, instanceId: string, command: any): Promise<APIGatewayProxyResult> => {
    if (server.game?.supportServerCommand !== true) {
        return clientError("Server does not support command");
    }
    if (typeof command !== "string" || command.length < 1 || command.length > 128) {
        return clientError("Invalid command. Must be between 1 to 128 characters");
    }
    try {
        const response = await ssmClient.send(
            new SendCommandCommand({
                InstanceIds: [instanceId],
                DocumentName: "AWS-RunShellScript",
                Parameters: {
                    commands: [`/opt/gnaws/entrypoints/write_server_stdin.sh '${command}'`],
                },
            }),
        );
        const commandId = response.Command?.CommandId;
        if (!commandId) {
            return serverError("Failed to send SSM command");
        }
        return success({ message: "Done" });
    } catch (e) {
        console.error(e);
        return serverError("Failed to send SSM command");
    }
};

const increaseStorage = async (server: Server, storage: any): Promise<APIGatewayProxyResult> => {
    // Storage size in GiB
    if (typeof storage !== "number" || storage < 4 || storage > 128) {
        return clientError("Invalid storage size");
    }

    try {
        const instanceId = server.ec2?.instanceId;
        if (!instanceId) {
            return serverError("Missing instanceId");
        }

        const result = await ec2Client.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
        const volumeId = result.Reservations?.[0]?.Instances?.[0]?.BlockDeviceMappings?.[0]?.Ebs?.VolumeId;
        if (!volumeId) {
            return serverError("Missing volumeId");
        }

        await ec2Client.send(
            new ModifyVolumeCommand({
                VolumeId: volumeId,
                Size: storage,
            }),
        );
        return success({ message: "Storage increase initiated" });
    } catch (e: any) {
        return serverError(`Failed to increase storage: ${e.message || "Unknown error"}`);
    }
};

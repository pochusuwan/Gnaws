import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { ROLE_ADMIN, ROLE_MANAGER, User } from "./users";
import { DeleteItemCommand, GetItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./clients";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { getServerStatusWorkflow, START_SERVER_FUNCTION_ARN, startWorkflow, STOP_SERVER_FUNCTION_ARN } from "./workflows";
import { clientError, forbidden, serverError, success } from "./util";

const SERVER_TABLE = process.env.SERVER_TABLE_NAME!;
const WORKFLOW_TABLE = process.env.WORKFLOW_TABLE_NAME!;
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;
const GET_STATUS_TIMEOUT = 30 * 1000;

const ACTION_START = "start";
const ACTION_STOP = "stop";
const ACTION_BACKUP = "backup";
const SERVER_ACTIONS = [ACTION_START, ACTION_STOP, ACTION_BACKUP];

export type Server = {
    name: string;
    game?: {
        name?: string;
    };
    ec2?: {
        instanceId?: string;
        instanceType?: string;
    };
    status?: {
        status?: string;
        message?: string;
        lastUpdated?: string;
    };
    workflow?: {
        currentTask?: string;
        executionId?: string;
        lastUpdated?: string;
        status?: string;
        message?: string;
    };
};

export const getServers = async (user: User, params: any): Promise<APIGatewayProxyResult> => {
    const refreshStatus = !!params?.refreshStatus;
    let servers;
    try {
        servers = await getServersFromDB();
    } catch (e) {
        return serverError("Failed to get servers");
    }
    if (!refreshStatus) {
        return success({ servers });
    }
    const now = new Date();
    const promises: Promise<any>[] = [];
    servers.forEach((server) => {
        const lastUpdated = server?.status?.lastUpdated;
        const lastChecked = lastUpdated ? new Date(lastUpdated) : undefined;
        const instanceId = server.ec2?.instanceId;
        if (instanceId && (!lastChecked || now.getTime() - lastChecked.getTime() > GET_STATUS_TIMEOUT)) {
            server.status = {
                lastUpdated: now.toISOString(),
            };
            promises.push(getServerStatusWorkflow(server.name, instanceId));
            promises.push(setServerStatusObj(server.name, server.status));
        }
    });

    const results = await Promise.allSettled(promises);
    const isSuccess = results.filter((result) => result.status === "rejected").length === 0;
    if (!isSuccess) {
        return serverError("Failed to get servers status");
    }
    return success({ servers });
};

const getServersFromDB = async (): Promise<Server[]> => {
    const command = new ScanCommand({
        TableName: SERVER_TABLE,
    });
    const result = await dynamoClient.send(command);
    return (result.Items?.map((item) => unmarshall(item)) as Server[]) ?? [];
};

// Get server from name. If not valid, return null.
const getServerFromDB = async (name: string): Promise<Server | null> => {
    try {
        const result = await dynamoClient.send(
            new GetItemCommand({
                TableName: SERVER_TABLE,
                Key: { name: { S: name } },
            })
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
    if (typeof params.name !== "string" || typeof params.action !== "string" || !SERVER_ACTIONS.includes(params.action)) {
        return clientError("Invalid request");
    }
    const name = params.name;
    const action = params.action;

    const server = await getServerFromDB(name);
    if (!server) {
        return clientError("Server not found");
    }
    const instanceId = server.ec2?.instanceId;
    if (!instanceId) {
        return serverError("Server has no instance id");
    }
    if (action === ACTION_BACKUP) {
        return serverError("Not implemented");
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
        result = await startWorkflow(server.name, instanceId, STOP_SERVER_FUNCTION_ARN);
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
                })
            );
            return serverError("Failed to start action");
        } catch (e) {
            return serverError("Failed to start action");
        }
    }
    // Workflow started. Update server table
    try {
        await setServerWorkflowObj(server.name, {
            currentTask: ACTION_START,
            executionId: result.executionId,
            status: "running",
            lastUpdated: result.startedAt.toISOString(),
        });
    } catch (e) {
        return success({ message: "Started" });
    }
    return success({ message: "Started" });
};

const aquireWorkflowLock = async (resourceId: string, action: string) => {
    const now = Date.now();
    await dynamoClient.send(
        new PutItemCommand({
            TableName: WORKFLOW_TABLE,
            Item: {
                resourceId: { S: resourceId },
                workflow: { S: action },
                startedAt: { N: now.toString() },
            },
            ConditionExpression: "attribute_not_exists(resourceId) OR startedAt < :expiry",
            ExpressionAttributeValues: {
                ":expiry": { N: (now - LOCK_TIMEOUT_MS).toString() },
            },
        })
    );
};

const setServerWorkflowObj = async (name: string, workflowObj: Server["workflow"]) => {
    await dynamoClient.send(
        new UpdateItemCommand({
            TableName: SERVER_TABLE,
            Key: {
                name: { S: name },
            },
            UpdateExpression: "SET #w = :workflow",
            ExpressionAttributeNames: {
                "#w": "workflow",
            },
            ExpressionAttributeValues: marshall({
                ":workflow": workflowObj,
            }),
        })
    );
};

const setServerStatusObj = async (name: string, statusObj: Server["status"]) => {
    await dynamoClient.send(
        new UpdateItemCommand({
            TableName: SERVER_TABLE,
            Key: {
                name: { S: name },
            },
            UpdateExpression: "SET #s = :status",
            ExpressionAttributeNames: {
                "#s": "status",
            },
            ExpressionAttributeValues: marshall({
                ":status": statusObj,
            }),
        })
    );
};

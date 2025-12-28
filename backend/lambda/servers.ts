import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { ROLE_ADMIN, ROLE_MANAGER, User } from "./users";
import { DeleteItemCommand, GetItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./clients";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { startServerWorkflow } from "./workflows";
import { clientError, forbidden, serverError, success } from "./util";

const SERVER_TABLE = process.env.SERVER_TABLE_NAME!;
const WORKFLOW_TABLE = process.env.WORKFLOW_TABLE_NAME!;
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

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
        lastUpdated?: number;
    };
    workflow?: {
        currentTask?: string;
        executionArn?: string;
        status?: string;
        startedAt?: number;
        error?: string;
    };
};

export const getServers = async (user: User, params: any): Promise<APIGatewayProxyResult> => {
    const command = new ScanCommand({ TableName: SERVER_TABLE });
    let result;
    try {
        result = await dynamoClient.send(command);
    } catch (e) {
        return serverError("Failed to get servers");
    }

    const items = result.Items?.map((item) => unmarshall(item));
    return success({ servers: items ?? [] });
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

    if (action === ACTION_START) {
        return await startServer(server, instanceId);
    }
    return serverError("Not implemented");
};

const startServer = async (server: Server, instanceId: string): Promise<APIGatewayProxyResult> => {
    try {
        await aquireWorkflowLock(instanceId, ACTION_START);
    } catch (err: any) {
        if (err.name === "ConditionalCheckFailedException") {
            return clientError("Already in progress");
        } else {
            return serverError("Failed to get workflow lock");
        }
    }

    const result = await startServerWorkflow(instanceId);
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
            return serverError("Failed to start server");
        } catch (e) {
            return serverError("Failed to start server");
        }
    }
    // Workflow started. Update server table
    try {
        await setServerWorkflowObj(server.name, {
            currentTask: ACTION_START,
            executionArn: result.executionArn,
            status: "running",
            startedAt: result.startedAt,
        });
    } catch (e) {
        return success("Started");
    }
    return success("Started");
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

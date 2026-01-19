import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { ROLE_ADMIN, ROLE_MANAGER, User } from "./users";
import { DeleteItemCommand, GetItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./clients";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { BACKUP_SERVER_FUNCTION_ARN, getServerStatusWorkflow, START_SERVER_FUNCTION_ARN, startSetupWorkflow, startWorkflow, STOP_SERVER_FUNCTION_ARN } from "./workflows";
import { clientError, forbidden, serverError, success } from "./util";
import { _InstanceType, DeleteSecurityGroupCommand, DescribeInstanceTypesCommand, RunInstancesCommand, TerminateInstancesCommand } from "@aws-sdk/client-ec2";
import { EC2Client, CreateSecurityGroupCommand, AuthorizeSecurityGroupIngressCommand } from "@aws-sdk/client-ec2";

const VPC_ID = process.env.VPC_ID!;
const SUBNET_ID = process.env.SUBNET_ID!;
const EC2_PROFILE_ARN = process.env.EC2_PROFILE_ARN!;
const BACKUP_BUCKET_NAME = process.env.BACKUP_BUCKET_NAME!;

const SERVER_TABLE = process.env.SERVER_TABLE_NAME!;
const WORKFLOW_TABLE = process.env.WORKFLOW_TABLE_NAME!;
const LOCK_TIMEOUT_MS = 60 * 60 * 1000;
const GET_STATUS_TIMEOUT = 30 * 1000;

const ACTION_START = "start";
const ACTION_STOP = "stop";
const ACTION_BACKUP = "backup";
const SERVER_ACTIONS = [ACTION_START, ACTION_STOP, ACTION_BACKUP];

const ec2Client = new EC2Client({ region: "us-east-1" });

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
        totalStorage?: string;
        usedStorage?: string;
        lastBackup?: string;
        message?: string;
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
        const lastRequest = server?.status?.lastRequest;
        const lastUpdate = server?.status?.lastUpdated;
        const lastRequested = lastRequest ? new Date(lastRequest) : undefined;
        const lastUpdated = lastUpdate ? new Date(lastUpdate) : undefined;
        const instanceId = server.ec2?.instanceId;
        if (
            instanceId &&
            (!lastRequested || (now.getTime() - lastRequested.getTime() > GET_STATUS_TIMEOUT)) && 
            (!lastUpdated || (now.getTime() - lastUpdated.getTime() > GET_STATUS_TIMEOUT))
        ) {
            server.status = {
                ...server.status,
                lastRequest: now.toISOString(),
            }
            promises.push(
                updateServerAttributes(server.name, {
                    status: server.status,
                })
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
    const shouldBackup = typeof params.shouldBackup === "boolean" ? params.shouldBackup : false;

    const server = await getServerFromDB(name);
    if (!server) {
        return clientError("Server not found");
    }
    const instanceId = server.ec2?.instanceId;
    if (!instanceId) {
        return serverError("Server has no instance id");
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
        result = await startWorkflow(server.name, instanceId, STOP_SERVER_FUNCTION_ARN, { backupBucketName: BACKUP_BUCKET_NAME, shouldBackup });
    }
    if (action === ACTION_BACKUP) {
        result = await startWorkflow(server.name, instanceId, BACKUP_SERVER_FUNCTION_ARN, { backupBucketName: BACKUP_BUCKET_NAME });
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
            ConditionExpression: "attribute_not_exists(resourceId)",
            // Always block for now if workflow exist
            // ConditionExpression: "attribute_not_exists(resourceId) OR startedAt < :expiry",
            // ExpressionAttributeValues: {
            // ":expiry": { N: (now - LOCK_TIMEOUT_MS).toString() },
            // },
        })
    );
};

const updateServerAttributes = async (name: string, server: Partial<Server>) => {
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
        })
    );
};

export const createServer = async (user: User, params: any): Promise<APIGatewayProxyResult> => {
    if (user.role !== ROLE_ADMIN) {
        return forbidden();
    }
    // Validate params
    const serverName = params?.serverName;
    if (typeof serverName !== "string" || !/^[a-zA-Z0-9_-]+$/.test(serverName) || serverName.length === 0) {
        return clientError("Invalid serverName");
    }
    const gameId = params?.gameId;
    if (typeof gameId !== "string") {
        return clientError("Invalid gameId");
    }
    // TODO: validate game id against available games
    const instanceType = params?.instanceType;
    if (typeof instanceType !== "string") {
        return clientError("Invalid instanceType");
    }
    try {
        await ec2Client.send(
            new DescribeInstanceTypesCommand({
                InstanceTypes: [instanceType as _InstanceType],
            })
        );
    } catch (e) {
        return clientError("Invalid instanceType");
    }
    const storage = params?.storage;
    if (typeof storage !== "number" && storage >= 8) {
        return clientError("Invalid storage");
    }

    if (!Array.isArray(params?.ports)) {
        return clientError("Invalid ports");
    }
    const ports = params.ports
        .map((p: any) => {
            if (typeof p.port === "number" && 1 <= p.port && p.port <= 65535 && typeof p.protocol === "string" && ["tcp", "udp"].includes(p.protocol)) {
                return { port: p.port, protocol: p.protocol };
            }
            return null;
        })
        .filter((u: Port | null) => u != null) as Port[];
    if (ports.length !== params.ports.length) {
        return clientError("Invalid ports");
    }
    // Add server to DDB with conditional check
    const server: Server = {
        name: serverName,
        ec2: {
            status: "creating",
        },
    };
    try {
        await dynamoClient.send(
            new PutItemCommand({
                TableName: SERVER_TABLE,
                Item: marshall(server),
                ConditionExpression: "attribute_not_exists(#name)",
                ExpressionAttributeNames: {
                    "#name": "name",
                },
            })
        );
    } catch (e: any) {
        if (e.name === "ConditionalCheckFailedException") {
            return clientError("Server already exists");
        }
        return serverError("Failed to create server: " + e.message);
    }

    // Create EC2 with ingress rules
    const res = await createEc2(serverName, ports, instanceType, storage);
    if (res.instanceId && res.securityGroupId && !res.errorMessage) {
        // Successfully create EC2. Update server item in DDB and start initialize workflow
        server.ec2 = {
            instanceType,
            instanceId: res.instanceId,
            securityGroupId: res.securityGroupId,
            status: "initializing",
        };
        // Update server table
        try {
            await updateServerAttributes(serverName, server);
        } catch (e: any) {
            res.errorMessage = `Failed to update server state: ${e.message}`;
        }
        // Acquire lock
        if (!res.errorMessage) {
            try {
                await aquireWorkflowLock(res.instanceId, "setup");
            } catch (err: any) {
                res.errorMessage = "Failed to get workflow lock";
            }
        }
        if (!res.errorMessage) {
            const result = await startSetupWorkflow(server.name, res.instanceId, gameId);
            if (result) {
                // Workflow started. Update server table
                try {
                    await updateServerAttributes(server.name, {
                        workflow: {
                            currentTask: "setup",
                            executionId: result.executionId,
                            status: "running",
                            lastUpdated: result.startedAt.toISOString(),
                        },
                    });
                    return success({ message: "Server created. Initializing." });
                } catch (e) {
                    // Workflow already started but failed to update server table is ok.
                    return success({ message: "Server created. Initializing." });
                }
            } else {
                // Failed to start setup workflow
                res.errorMessage = "Failed to start setup workflow";
            }
        }
    }
    // If create EC2 fail, clean up created resources.
    // NOT TESTED
    try {
        await cleanupResources(server, res.instanceId, res.securityGroupId, res.errorMessage);
        return serverError(`Failed to create server: ${res.errorMessage}. Successfully cleaned up resources.`);
    } catch (e) {
        return serverError(`Failed to create server: ${res.errorMessage}. Resource clean up needed!`);
    }
};

type Port = {
    port: number;
    protocol: string;
};
const createEc2 = async (
    serverName: string,
    ports: Port[],
    instanceType: string,
    storage: number
): Promise<{
    instanceId?: string;
    securityGroupId?: string;
    errorMessage?: string;
}> => {
    let securityGroupId;
    let instanceId;

    try {
        const sgResponse = await ec2Client.send(
            new CreateSecurityGroupCommand({
                GroupName: `gnaws-${serverName}-sg`,
                Description: `Security Group for ${serverName}`,
                VpcId: VPC_ID,
            })
        );

        securityGroupId = sgResponse.GroupId;
        if (!securityGroupId) {
            throw new Error("CreateSecurityGroup succeeded but GroupId was undefined");
        }

        if (ports.length > 0) {
            await ec2Client.send(
                new AuthorizeSecurityGroupIngressCommand({
                    GroupId: securityGroupId,
                    IpPermissions: ports.map(({ port, protocol }) => ({
                        IpProtocol: protocol,
                        FromPort: port,
                        ToPort: port,
                        IpRanges: [{ CidrIp: "0.0.0.0/0" }],
                    })),
                })
            );
        }
        const runCmd = new RunInstancesCommand({
            ImageId: "ami-0ecb62995f68bb549", // Amazon Linux AMI
            InstanceType: instanceType as _InstanceType,
            MaxCount: 1,
            MinCount: 1,
            SecurityGroupIds: [securityGroupId],
            SubnetId: SUBNET_ID,
            BlockDeviceMappings: [
                {
                    DeviceName: "/dev/sda1",
                    Ebs: {
                        DeleteOnTermination: false,
                        Iops: 3000,
                        VolumeSize: storage,
                        VolumeType: "gp3",
                        Throughput: 125,
                    },
                },
            ],
            InstanceInitiatedShutdownBehavior: "stop",
            IamInstanceProfile: { Arn: EC2_PROFILE_ARN },
            TagSpecifications: [
                {
                    ResourceType: "instance",
                    Tags: [{ Key: "Name", Value: `Gnaws-${serverName}` }],
                },
            ],
        });
        const res = await ec2Client.send(runCmd);
        instanceId = res.Instances?.[0].InstanceId;
        if (!instanceId) {
            throw new Error("Create instance succeeded but instanceId was undefined");
        }

        return { instanceId, securityGroupId };
    } catch (err: any) {
        return {
            instanceId,
            securityGroupId,
            errorMessage: `Failed to create EC2 instance: ${err?.message}`,
        };
    }
};

async function cleanupResources(server: Server, instanceId?: string, sgId?: string, errorMessage?: string) {
    if (instanceId) {
        await ec2Client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
    }
    if (sgId) {
        await ec2Client.send(new DeleteSecurityGroupCommand({ GroupId: sgId }));
    }
    server.ec2 = {
        ...server.ec2,
        status: "create_failed",
        message: errorMessage,
    }
    await updateServerAttributes(server.name, server);
}

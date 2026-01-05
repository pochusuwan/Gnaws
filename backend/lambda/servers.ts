import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { ROLE_ADMIN, ROLE_MANAGER, User } from "./users";
import { DeleteItemCommand, GetItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./clients";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { getServerStatusWorkflow, START_SERVER_FUNCTION_ARN, startWorkflow, STOP_SERVER_FUNCTION_ARN } from "./workflows";
import { clientError, forbidden, serverError, success } from "./util";
import { _InstanceType, DescribeInstanceTypesCommand, RunInstancesCommand } from "@aws-sdk/client-ec2";
import { EC2Client, CreateSecurityGroupCommand, AuthorizeSecurityGroupIngressCommand } from "@aws-sdk/client-ec2";

const VPC_ID = process.env.VPC_ID!;
const SUBNET_ID = process.env.SUBNET_ID!;
const EC2_PROFILE_ARN = process.env.EC2_PROFILE_ARN!;

const SERVER_TABLE = process.env.SERVER_TABLE_NAME!;
const WORKFLOW_TABLE = process.env.WORKFLOW_TABLE_NAME!;
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;
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
            currentTask: action,
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

const setServerEc2Obj = async (name: string, ec2: Server["ec2"]) => {
    await dynamoClient.send(
        new UpdateItemCommand({
            TableName: SERVER_TABLE,
            Key: {
                name: { S: name },
            },
            UpdateExpression: "SET #e = :ec2",
            ExpressionAttributeNames: {
                "#e": "ec2",
            },
            ExpressionAttributeValues: marshall({
                ":ec2": ec2,
            }),
        })
    );
};

type Port = {
    port: number;
    protocal: string;
};
export const createServer = async (user: User, params: any): Promise<APIGatewayProxyResult> => {
    if (user.role !== ROLE_ADMIN) {
        return forbidden();
    }
    const serverName = params?.serverName;
    if (typeof serverName !== "string" || !/^[a-zA-Z0-9_-]+$/.test(serverName)) {
        return clientError("Invalid serverName");
    }
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

    if (!Array.isArray(params?.ports)) {
        return clientError("Invalid ports");
    }
    const ports = params.ports
        .map((p: any) => {
            if (typeof p.port === "number" && typeof p.protocal === "string") {
                return { port: p.port, protocal: p.protocal };
            }
            return null;
        })
        .filter((u: Port | null) => u != null) as Port[];
    if (ports.length !== params.ports.length) {
        return clientError("Invalid ports");
    }
    const server: Server = {
        name: serverName,
        status: {
            status: "creating",
            lastUpdated: new Date().toISOString(),
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
        return serverError("Failed to create server");
    }

    try {
        const sgResponse = await ec2Client.send(
            new CreateSecurityGroupCommand({
                GroupName: `gnaws-${serverName}-sg`,
                Description: `Security Group for ${serverName}`,
                VpcId: VPC_ID,
            })
        );
        const sgId = sgResponse.GroupId;
        if (!sgId) {
            return serverError("Failed to create security group");
        }

        await ec2Client.send(
            new AuthorizeSecurityGroupIngressCommand({
                GroupId: sgId,
                IpPermissions: ports.map(({ port, protocal }) => ({ IpProtocol: protocal, FromPort: port, ToPort: port, IpRanges: [{ CidrIp: "0.0.0.0/0" }] })),
            })
        );
        const runCmd = new RunInstancesCommand({
            ImageId: "ami-0ecb62995f68bb549", // Amazon Linux AMI
            InstanceType: instanceType as _InstanceType,
            MaxCount: 1,
            MinCount: 1,
            SecurityGroupIds: [sgId],
            SubnetId: SUBNET_ID,
            BlockDeviceMappings: [
                {
                    DeviceName: "/dev/sda1",
                    Ebs: {
                        DeleteOnTermination: false,
                        Iops: 3000,
                        VolumeSize: 16,
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

        const instanceId = res.Instances![0].InstanceId;
        server.ec2 = {
            instanceId,
            instanceType,
        };
        await setServerEc2Obj(serverName, server.ec2);

        // TODO: EC2 initialization

        return success({ server });
    } catch (e) {
        return serverError("Failed to create server");
    }
};

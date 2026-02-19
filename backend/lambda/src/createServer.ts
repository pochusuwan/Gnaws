import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { ROLE_ADMIN, User } from "./users";
import {
    _InstanceType,
    DeleteSecurityGroupCommand,
    DescribeInstanceTypesCommand,
    RunInstancesCommand,
    TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { CreateSecurityGroupCommand, AuthorizeSecurityGroupIngressCommand } from "@aws-sdk/client-ec2";
import { randomUUID } from "crypto";
import { clientError, forbidden, serverError, success } from "./util";
import { dynamoClient, ec2Client } from "./clients";
import { Port, Server } from "./types";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { aquireWorkflowLock, updateServerAttributes } from "./servers";
import { startSetupWorkflow } from "./workflows";
import { getImageIdFromDB } from "./initCreateServer";

const VPC_ID = process.env.VPC_ID!;
const SUBNET_ID = process.env.SUBNET_ID!;
const EC2_PROFILE_ARN = process.env.EC2_PROFILE_ARN!;
const SERVER_TABLE = process.env.SERVER_TABLE_NAME!;

export const createServer = async (user: User, params: any): Promise<APIGatewayProxyResult> => {
    if (user.role !== ROLE_ADMIN) {
        return forbidden();
    }
    // Validate params
    const serverName = params?.serverName;
    if (typeof serverName !== "string" || !/^[a-zA-Z0-9_-]+$/.test(serverName) || serverName.length === 0) {
        return clientError("Invalid serverName");
    }
    // TODO: validate game id against available games
    const gameId = params?.gameId;
    if (typeof gameId !== "string") {
        return clientError("Invalid gameId");
    }
    const instanceType = params?.instanceType;
    if (typeof instanceType !== "string") {
        return clientError("Invalid instanceType");
    }
    try {
        await ec2Client.send(
            new DescribeInstanceTypesCommand({
                InstanceTypes: [instanceType as _InstanceType],
            }),
        );
    } catch (e) {
        return clientError("Invalid instanceType");
    }
    const storage = params?.storage;
    if (typeof storage !== "number" || storage < 4 || storage > 128) {
        return clientError("Invalid storage");
    }

    if (!Array.isArray(params?.ports)) {
        return clientError("Invalid ports");
    }
    const ports = params.ports
        .map((p: any) => {
            const port = p.port;
            const protocol = typeof p.protocol === "string" ? p.protocol.toLowerCase() : undefined;
            if (typeof port === "number" && 1 <= port && port <= 65535 && ["tcp", "udp"].includes(protocol)) {
                return { port, protocol };
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
            }),
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
                    return success({ message: "Server created. Initializing.", serverName: server.name });
                } catch (e) {
                    // Workflow already started but failed to update server table is ok.
                    return success({ message: "Server created. Initializing.", serverName: server.name });
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

const createEc2 = async (
    serverName: string,
    ports: Port[],
    instanceType: string,
    storage: number,
): Promise<{
    instanceId?: string;
    securityGroupId?: string;
    errorMessage?: string;
}> => {
    let securityGroupId;
    let instanceId;

    try {
        let imageId = await getImageIdFromDB();
        if (imageId === null) {
            throw new Error("Failed to get Amazon Image ID");
        }

        const sgResponse = await ec2Client.send(
            new CreateSecurityGroupCommand({
                GroupName: `gnaws-${serverName}-sg-${randomUUID().slice(0, 8)}`,
                Description: `Security Group for ${serverName}`,
                VpcId: VPC_ID,
                TagSpecifications: [
                    {
                        ResourceType: "security-group",
                        Tags: [{ Key: "OwnedBy", Value: `GnawsStack` }],
                    },
                ],
            }),
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
                }),
            );
        }
        const runCmd = new RunInstancesCommand({
            ImageId: imageId,
            InstanceType: instanceType as _InstanceType,
            MaxCount: 1,
            MinCount: 1,
            SecurityGroupIds: [securityGroupId],
            SubnetId: SUBNET_ID,
            BlockDeviceMappings: [
                {
                    DeviceName: "/dev/sda1",
                    Ebs: {
                        DeleteOnTermination: true,
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
                    Tags: [
                        { Key: "Name", Value: `Gnaws-${serverName}` },
                        { Key: "OwnedBy", Value: `GnawsStack` },
                    ],
                },
                {
                    ResourceType: "volume",
                    Tags: [
                        { Key: "Name", Value: `Gnaws-${serverName}-root` },
                        { Key: "OwnedBy", Value: "GnawsStack" },
                    ],
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
    };
    await updateServerAttributes(server.name, server);
}

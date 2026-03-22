import { APIGatewayProxyResult } from "aws-lambda";
import { clientError, serverError, success } from "./util";
import { getAllServersFromDB, getServerFromDB, updateServerAttributes } from "./servers";
import { ec2Client, sfnClient } from "./clients";
import { DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { SERVER_NAME_TAG_PREFIX } from "./createServer";
import { DescribeExecutionCommand } from "@aws-sdk/client-sfn";
import { AUTO_SHUTDOWN_SERVER_FUNCTION_ARN, startWorkflow } from "./workflows";

export const EC2_STATE_EVENT = "EC2 Instance State-change Notification";

export async function watchdogEvent(): Promise<APIGatewayProxyResult> {
    // Handle periodic event
    await setupAutoShutdown();
    return success({});
}

async function setupAutoShutdown() {
    try {
        const servers = await getAllServersFromDB();
        for (const server of servers) {
            // Do nothing if auto shutdown not configured or instance not running
            const autoShutdownMinute = server.configuration?.autoShutdownMinute;
            if (autoShutdownMinute === undefined) {
                continue;
            }
            if (server.autoShutdown?.status !== "running") {
                // TODO: should describe EC2 and set status at lower interval in case EC2 EventBridge fail
                continue;
            }

            // Instance is running, check auto shutdown workflow
            const executionId = server.autoShutdown?.executionId;
            let shouldStartWorkflow = false;
            if (executionId === undefined) {
                shouldStartWorkflow = true;
            } else {
                const response = await sfnClient.send(new DescribeExecutionCommand({
                    executionArn: executionId,
                }));
                if (response.status !== "RUNNING") {
                    shouldStartWorkflow = true;
                }
            }
            if (shouldStartWorkflow && server.ec2?.instanceId) {
                const result = await startWorkflow(server.name, server.ec2?.instanceId, AUTO_SHUTDOWN_SERVER_FUNCTION_ARN, {
                    initialDelayMinutes: 10,
                    autoShutdownMinute,
                });
                await updateServerAttributes(server.name, {
                    autoShutdown: {
                        ...server.autoShutdown,
                        lastUpdated: new Date().toISOString(),
                        executionId: result?.executionId,
                    },
                });
            }
        }
    } catch (e: any) {
        console.error(`Auto shutdown failed to get servers`, e.message);
    }
}

export async function handleEc2StateChangeEvent(event: any): Promise<APIGatewayProxyResult> {
    // This is called by EventBridge on EC2 state change to running
    // This set server autoShutdown status and start workflow if configured
    try {
        const instanceId = event?.detail?.["instance-id"];
        if (typeof instanceId !== "string") {
            return clientError("Invalid EventBridge payload");
        }
        const result = await ec2Client.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
        const instance = result?.Reservations?.[0]?.Instances?.[0];
        const ec2NameTag = instance?.Tags?.find((t) => t.Key === "Name")?.Value;
        const instanceState = instance?.State?.Name;

        if (typeof ec2NameTag !== "string" || !ec2NameTag.startsWith(SERVER_NAME_TAG_PREFIX)) {
            return clientError("Non-gnaws EC2 instance");
        }
        if (instanceState !== "running") {
            return clientError("Unexpected EC2 state");
        }
        const serverName = ec2NameTag.slice(SERVER_NAME_TAG_PREFIX.length);
        const executionId = await startAutoShutdownIfNeeded(serverName);

        await updateServerAttributes(serverName, {
            autoShutdown: {
                status: "running",
                lastUpdated: new Date().toISOString(),
                executionId,
            },
        });
        return success({});
    } catch (e: any) {
        return serverError(`Failed to update auto shutdown status: ${e.message}`);
    }
}

async function startAutoShutdownIfNeeded(serverName: string): Promise<string | undefined> {
    // If server auto shutdown is configured, start workflow and return execution Id
    try {
        const server = await getServerFromDB(serverName);
        const instanceId = server?.ec2?.instanceId;
        if (!server) throw Error(`No server found for ${serverName}`);
        if (!instanceId) throw Error(`No instance id for server ${serverName}`);

        const autoShutdownMinute = server.configuration?.autoShutdownMinute;
        if (autoShutdownMinute === undefined) {
            return undefined;
        }
        // Start with 30 minutes initial delay to prevent shutdown before any player join
        const result = await startWorkflow(serverName, instanceId, AUTO_SHUTDOWN_SERVER_FUNCTION_ARN, {
            initialDelayMinutes: 30,
            autoShutdownMinute,
        });
        return result?.executionId;
    } catch (e: any) {
        return undefined;
    }
}

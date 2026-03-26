import { APIGatewayProxyResult } from "aws-lambda";
import { clientError, serverError, success } from "./util";
import { getAllServersFromDB, getServerFromDB, updateServerAttributes } from "./servers";
import { ec2Client, sfnClient } from "./clients";
import { DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { SERVER_NAME_TAG_PREFIX } from "./createServer";
import { DescribeExecutionCommand } from "@aws-sdk/client-sfn";
import { AUTO_SHUTDOWN_SERVER_FUNCTION_ARN, startWorkflow, STOP_SERVER_FUNCTION_ARN } from "./workflows";

export const EC2_STATE_EVENT = "EC2 Instance State-change Notification";
const BACKUP_BUCKET_NAME = process.env.BACKUP_BUCKET_NAME!;

export async function watchdogEvent(): Promise<APIGatewayProxyResult> {
    // Handle periodic event
    // await setupAutoShutdown();
    await checkScheduledShutdown();
    return success({});
}

const BASE_AUTO_SHUTDOWN_INPUT = {
    stopFunctionArn: STOP_SERVER_FUNCTION_ARN,
    backupBucketName: process.env.BACKUP_BUCKET_NAME!,
    shouldBackup: true,
};

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
                const response = await sfnClient.send(
                    new DescribeExecutionCommand({
                        executionArn: executionId,
                    }),
                );
                if (response.status !== "RUNNING") {
                    shouldStartWorkflow = true;
                }
            }
            if (shouldStartWorkflow && server.ec2?.instanceId) {
                const result = await startWorkflow(server.name, server.ec2?.instanceId, AUTO_SHUTDOWN_SERVER_FUNCTION_ARN, {
                    ...BASE_AUTO_SHUTDOWN_INPUT,
                    initialWaitSeconds: 10,
                    inactivityDurationSec: autoShutdownMinute * 60,
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

// DISABLED IN STACK
// Event bridge are disabled because last activity detection has false positive from
// bots and port scanners which cause auto shutdown to not work reliably.
export async function handleEc2StateChangeEvent(event: any): Promise<APIGatewayProxyResult> {
    // This is called by EventBridge on EC2 state change to running
    // This set server autoShutdown status and start workflow if configured
    try {
        const instanceId = event?.detail?.["instance-id"];
        const state = event?.detail?.["state"];
        if (typeof instanceId !== "string" || typeof state !== "string") {
            return clientError("Invalid EventBridge payload");
        }
        if (state !== "running" && state !== "stopping") {
            return clientError("Unexpected EC2 state");
        }
        const result = await ec2Client.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
        const instance = result?.Reservations?.[0]?.Instances?.[0];
        const ec2NameTag = instance?.Tags?.find((t) => t.Key === "Name")?.Value;

        if (typeof ec2NameTag !== "string" || !ec2NameTag.startsWith(SERVER_NAME_TAG_PREFIX)) {
            return clientError("Non-gnaws EC2 instance");
        }
        const serverName = ec2NameTag.slice(SERVER_NAME_TAG_PREFIX.length);
        const executionId = state === "running" ? await startAutoShutdownIfNeeded(serverName) : undefined;
        await updateServerAttributes(serverName, {
            autoShutdown: {
                status: state,
                lastUpdated: new Date().toISOString(),
                executionId,
            },
        });
        return success({});
    } catch (e: any) {
        console.error(`Failed to update auto shutdown status: ${e.message}`);
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
        const result = await startWorkflow(serverName, instanceId, AUTO_SHUTDOWN_SERVER_FUNCTION_ARN, {
            ...BASE_AUTO_SHUTDOWN_INPUT,
            // Start with 30 minutes initial delay to prevent shutdown before any player join
            initialWaitSeconds: 30 * 60,
            inactivityDurationSec: autoShutdownMinute * 60,
        });
        return result?.executionId;
    } catch (e: any) {
        return undefined;
    }
}

async function checkScheduledShutdown(): Promise<void> {
    try {
        const servers = await getAllServersFromDB();
        for (const server of servers) {
            if (server.configuration?.scheduledShutdownDisabled) {
                continue;
            }
            const shutdownTime = server.scheduledShutdown?.shutdownTime;
            if (shutdownTime === undefined || new Date(shutdownTime).getTime() > Date.now()) {
                continue;
            }

            const instanceId = server.ec2?.instanceId;
            if (!instanceId) {
                continue;
            }
            const result = await startWorkflow(server.name, instanceId, STOP_SERVER_FUNCTION_ARN, {
                backupBucketName: BACKUP_BUCKET_NAME,
                shouldBackup: true,
            });
            if (result) {
                await updateServerAttributes(server.name, {
                    workflow: {
                        currentTask: "stop",
                        executionId: result.executionId,
                        status: "running",
                        lastUpdated: result.startedAt.toISOString(),
                    },
                    scheduledShutdown: {
                        shutdownTime: undefined,
                    }
                });
            }
        }
    } catch (e: any) {
        console.error(`Failed to check scheduled shutdown`, e.message);
    }
}

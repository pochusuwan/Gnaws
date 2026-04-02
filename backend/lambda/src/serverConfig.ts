import { APIGatewayProxyResult } from "aws-lambda";
import { Server } from "./types";
import { updateServerAttributes } from "./servers";
import { clientError, serverError, success } from "./util";
import { _InstanceType, DescribeInstanceTypesCommand, ModifyInstanceAttributeCommand } from "@aws-sdk/client-ec2";
import { ec2Client, route53Client } from "./clients";
import { ChangeResourceRecordSetsCommand, ListHostedZonesByNameCommand } from "@aws-sdk/client-route-53";

const HOUR_IN_MS = 60 * 60 * 1000;
const MAX_SCHEDULE_SHUTDOWN = 10 * 60 * 60 * 1000;

export async function toggleScheduledShutdown(server: Server): Promise<APIGatewayProxyResult> {
    try {
        // Set server config so getNewShutdownTime use new value
        server.configuration = {
            ...server.configuration,
            scheduledShutdownDisabled: !server.configuration?.scheduledShutdownDisabled,
        };
        await updateServerAttributes(server.name, {
            configuration: server.configuration,
            scheduledShutdown: {
                shutdownTime: getNewShutdownTime(server, false)?.toISOString(),
            },
        });
        return success({ message: "success" });
    } catch (e: any) {
        console.error(`Failed to toggle scheduled shutdown config ${e.message}`);
        return serverError("Failed to toggle scheduled shutdown config");
    }
}

export function getNewShutdownTime(server: Server, addHour: boolean): Date | undefined {
    if (server.configuration?.scheduledShutdownDisabled) {
        return undefined;
    }
    let shutdownTimestamp = Date.now();
    const shutdownTime = server.scheduledShutdown?.shutdownTime;
    if (shutdownTime) {
        shutdownTimestamp = Math.max(shutdownTimestamp, new Date(shutdownTime).getTime());
    }
    if (addHour) {
        shutdownTimestamp += HOUR_IN_MS;
    }
    shutdownTimestamp = Math.min(Math.max(shutdownTimestamp, Date.now() + HOUR_IN_MS), Date.now() + MAX_SCHEDULE_SHUTDOWN);
    return new Date(shutdownTimestamp);
}

export async function addHourToShutdown(server: Server): Promise<APIGatewayProxyResult> {
    try {
        if (server.configuration?.scheduledShutdownDisabled) {
            return clientError("Scheduled shutdown is disabled");
        }
        await updateServerAttributes(server.name, {
            scheduledShutdown: {
                shutdownTime: getNewShutdownTime(server, true)?.toISOString(),
            },
        });
        return success({ message: "success" });
    } catch (e: any) {
        console.error(`Failed to add hour to shutdown ${e.message}`);
        return serverError("Failed to add hour to shutdown");
    }
}

export async function changeInstanceType(server: Server, instanceType: any): Promise<APIGatewayProxyResult> {
    if (typeof instanceType !== "string") {
        return clientError("Invalid instanceType");
    }
    const instanceId = server.ec2?.instanceId;
    if (!instanceId) {
        return serverError("Server has no instance id");
    }
    try {
        await ec2Client.send(new DescribeInstanceTypesCommand({ InstanceTypes: [instanceType as _InstanceType] }));
    } catch (e) {
        return clientError("Invalid instanceType");
    }
    try {
        await ec2Client.send(
            new ModifyInstanceAttributeCommand({
                InstanceId: instanceId,
                InstanceType: { Value: instanceType },
            }),
        );
        await updateServerAttributes(server.name, {
            ec2: { ...server.ec2, instanceType },
        });
        return success({ message: "Instance type updated" });
    } catch (e: any) {
        console.error(`Failed to change instance type: ${e.message}`);
        return serverError("Failed to change instance type");
    }
}

export async function setServerCustomSubdomain(server: Server): Promise<void> {
    try {
        const subdomain = server.configuration?.customSubdomain;
        if (!subdomain) {
            return;
        }

        const ipAddress = server.ec2?.ipAddress;
        if (!ipAddress) {
            return;
        }
        const parts = subdomain.split(".");
        if (parts.length < 3) {
            throw Error(`Invalid subdomain: ${subdomain}`);
        }

        const hostedZoneName = parts.slice(-2).join(".") + ".";
        const zonesResult = await route53Client.send(new ListHostedZonesByNameCommand({ DNSName: hostedZoneName, MaxItems: 1 }));
        const zone = zonesResult.HostedZones?.[0];
        if (!zone || zone.Name !== hostedZoneName) {
            throw Error(`No Route 53 hosted zone found for ${subdomain}`);
        }
        const hostedZoneId = zone.Id?.split("/").at(-1);
        if (!hostedZoneId) {
            throw Error("Hosted zone id not found");
        }
        await route53Client.send(
            new ChangeResourceRecordSetsCommand({
                HostedZoneId: hostedZoneId,
                ChangeBatch: {
                    Changes: [
                        {
                            Action: "UPSERT",
                            ResourceRecordSet: { Name: subdomain, Type: "A", TTL: 60, ResourceRecords: [{ Value: ipAddress }] },
                        },
                    ],
                },
            }),
        );
    } catch (e: any) {
        console.error(`Failed to set custom subdomain ${e.message}`);
    }
}

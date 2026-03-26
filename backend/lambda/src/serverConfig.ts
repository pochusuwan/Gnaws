import { APIGatewayProxyResult } from "aws-lambda";
import { Server } from "./types";
import { updateServerAttributes } from "./servers";
import { clientError, serverError, success } from "./util";

const HOUR_IN_MS = 60 * 60 * 1000;
const MAX_SCHEDULE_SHUTDOWN = 10 * 60 * 60 * 1000;

export async function toggleScheduledShutdown(server: Server): Promise<APIGatewayProxyResult> {
    try {
        // Set server config so getNewShutdownTime use new value
        server.configuration = {
            ...server.configuration,
            scheduledShutdownDisabled: !server.configuration?.scheduledShutdownDisabled,
        }
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

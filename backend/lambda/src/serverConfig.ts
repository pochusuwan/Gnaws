import { APIGatewayProxyResult } from "aws-lambda";
import { Server } from "./types";
import { updateServerAttributes } from "./servers";
import { serverError, success } from "./util";

export async function toggleScheduledShutdown(server: Server): Promise<APIGatewayProxyResult> {
    try {
        await updateServerAttributes(server.name, {
            configuration: {
                ...server.configuration,
                scheduledShutdownDisabled: !server.configuration?.scheduledShutdownDisabled
            }
        })
        return success({ message: "success" });
    } catch (e: any) {
        console.error(`Failed to toggle scheduled shutdown config ${e.message}`);
        return serverError("Failed to toggle scheduled shutdown config");
    }
}

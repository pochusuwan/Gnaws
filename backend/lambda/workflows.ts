import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { ROLE_ADMIN, ROLE_MANAGER, User } from "./users";

const sfnClient = new SFNClient({});

const START_SERVER_FUNCTION_ARN = process.env.START_SERVER_FUNCTION_ARN!;

export const testStartServer = async (user: User, params: any): Promise<APIGatewayProxyResult> => {
    if (user.role !== ROLE_ADMIN && user.role !== ROLE_MANAGER) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: "Forbidden" }),
        };
    }

    const cmd = new StartExecutionCommand({
        stateMachineArn: START_SERVER_FUNCTION_ARN,
        input: JSON.stringify({
            instanceIds: ["TODO"],
        }),
    });

    try {
        const result = await sfnClient.send(cmd);
        if (result.executionArn != null) {
            return {
                statusCode: 200,
                body: JSON.stringify({ result: "success" }),
            };
        } else {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Internal server error" }),
            };
        }
    } catch (e) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }
};

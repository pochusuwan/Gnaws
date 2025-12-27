import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { ROLE_ADMIN, ROLE_MANAGER, User } from "./users";
import { ScanCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./clients";

const SERVER_TABLE = process.env.SERVER_TABLE_NAME!;

export type Server = {
    name: string;
    game: string | undefined;
    instanceType: string | undefined;
    status: string | undefined;
    currentTask: string | undefined;
};

export const getServers = async (user: User, params: any): Promise<APIGatewayProxyResult> => {
    if (user.role !== ROLE_ADMIN && user.role !== ROLE_MANAGER) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: "Forbidden" }),
        };
    }

    const command = new ScanCommand({ TableName: SERVER_TABLE });
    let result;
    try {
        result = await dynamoClient.send(command);
    } catch (e) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }

    const servers =
        result.Items?.map((item) => ({
            name: item.name.S!,
            game: item.game.S,
            instanceType: item.instanceType.S,
            status: item.status.S,
            currentTask: item.currentTask.S,
        })) || [];

    return {
        statusCode: 200,
        body: JSON.stringify({ servers }),
    };
};

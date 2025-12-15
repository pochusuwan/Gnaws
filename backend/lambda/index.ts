import { APIGatewayProxyEventV2, APIGatewayProxyResult } from "aws-lambda";

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
    return {
        statusCode: 200,
        body: JSON.stringify({
            rawPath: event.rawPath,
            message: "Hello from Lambda!",
            timestamp: new Date().toISOString(),
        }),
    };
};

import { APIGatewayProxyResult } from "aws-lambda";

export function response(code: number, body: any): APIGatewayProxyResult {
    return {
        statusCode: code,
        body: JSON.stringify(body),
    };
}

export function invalidCredential(): APIGatewayProxyResult {
    return response(401, { error: "Invalid credentials" })
};

export function forbidden(): APIGatewayProxyResult {
    return response(403, { error: "Forbidden" })
};

export function serverError(message: string): APIGatewayProxyResult {
    return response(500, { error: message })
};

export function clientError(message: string): APIGatewayProxyResult {
    return response(400, { error: message })
};

export function success(body: any): APIGatewayProxyResult {
    return response(200, body)
}

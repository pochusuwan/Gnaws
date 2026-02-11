import { APIGatewayProxyResult } from "aws-lambda";

export const response = (code: number, body: any): APIGatewayProxyResult => {
    return {
        statusCode: code,
        body: JSON.stringify(body),
    };
}

export const forbidden = (): APIGatewayProxyResult => {
    return response(403, { error: "Forbidden" })
};

export const serverError = (message: string): APIGatewayProxyResult => {
    return response(500, { error: message })
};

export const clientError = (message: string): APIGatewayProxyResult => {
    return response(400, { error: message })
};

export const success = (body: any): APIGatewayProxyResult => {
    return response(200, body)
}

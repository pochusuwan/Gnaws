import { APIGatewayProxyEventV2, APIGatewayProxyResult } from "aws-lambda";
import { Request } from "./types"
import { login } from "./auth";

const MAX_BODY = 10_000;
const LOGIN_TYPE = 'login';
const ALLOWED_REQUESTS = [LOGIN_TYPE];

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
    let requestType, params;
    const request = parseRequest(event.body);
    if (request === null) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid request" }),
        };
    } else {
        requestType = request.requestType;
        params = request.params;
    }

    if (requestType === LOGIN_TYPE) {
        return await login(params);
    }

    return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid request" }),
    };
};

const parseRequest = (body: string | undefined): Request | null => {
    if (!body || body.length > MAX_BODY) return null;
    try {
        const parsed = JSON.parse(body || "{}");
        if (!ALLOWED_REQUESTS.includes(parsed.requestType)) return null;

        let params: { [key: string]: string } = {};
        for (const [key, value] of Object.entries(parsed.params ?? {})) {
            if (typeof value !== "string") return null;
            params[key] = value;
        }

        return { requestType: parsed.requestType, params };
    } catch (e) {
        return null;
    }
};

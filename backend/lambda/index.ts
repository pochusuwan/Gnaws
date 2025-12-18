import { APIGatewayProxyEventV2, APIGatewayProxyResult } from "aws-lambda";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secretsClient = new SecretsManagerClient({});

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
        return await handleLogin(params);
    }

    return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid request" }),
    };
};

type Params =  { [key: string]: string };
type Request = {
    requestType: string;
    params: Params
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


const handleLogin = async (params: Params): Promise<APIGatewayProxyResult> => {
    const username = params.username;
    const password = params.password;
    if (typeof username !== 'string' || typeof password !== 'string') {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid login request" }),
        };
    }

    try {
        const command = new GetSecretValueCommand({ SecretId: 'gnaws/server-manager-password' });
        const response = await secretsClient.send(command);
        if (response.SecretString !== password) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: "Invalid credentials" }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                username,
                timestamp: new Date().toISOString(),
            }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }
}
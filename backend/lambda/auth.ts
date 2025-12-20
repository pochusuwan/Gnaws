import { Params } from "./types";
import { APIGatewayProxyResult } from "aws-lambda";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import jwt from "jsonwebtoken";

const JWT_TTL_SECONDS = 60 * 60; // 1 hour

const secretsClient = new SecretsManagerClient({});
const dynamoClient = new DynamoDBClient({});

const USER_TABLE = process.env.USER_TABLE_NAME!;
const SERVER_MANAGER_PASSWORD = process.env.SERVER_MANAGER_PASSWORD!;
const JWT_SECRET = process.env.JWT_SECRET!;

export const ROLE_NEW = "new";
export const ROLE_MANAGER = "manager";
export const ROLE_ADMIN = "admin";
type User = {
    username: string;
    role: string;
};

export type JwtPayload = {
    username: string;
    role: string;
};

export const login = async (params: Params): Promise<APIGatewayProxyResult> => {
    const username = params.username;
    const password = params.password;
    if (typeof username !== "string" || typeof password !== "string") {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid login request" }),
        };
    }

    let expectedPassword;

    try {
        const command = new GetSecretValueCommand({ SecretId: SERVER_MANAGER_PASSWORD });
        expectedPassword = (await secretsClient.send(command)).SecretString;
        if (typeof expectedPassword !== "string") throw "Invalid secret";
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }

    if (expectedPassword !== password) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: "Invalid credentials" }),
        };
    }

    const user = await getOrCreateUser(username);
    if (!user) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }

    let jwtSecret;
    try {
        jwtSecret = await getJwtSecret();
    } catch {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }
    const token = createJwt(user.username, user.role, jwtSecret);

    return {
        statusCode: 200,
        headers: {
            "Set-Cookie": `jwt=${token}; HttpOnly; Secure; Path=/; Max-Age=86400; SameSite=None`,
            "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify({
            username: user.username,
            role: user.role,
            timestamp: new Date().toISOString(),
        }),
    };
};

const getOrCreateUser = async (username: string): Promise<User | null> => {
    try {
        await dynamoClient.send(
            new PutItemCommand({
                TableName: USER_TABLE,
                Item: {
                    username: { S: username },
                    role: { S: ROLE_NEW },
                },
                ConditionExpression: "attribute_not_exists(username)",
            })
        );

        return { username, role: ROLE_NEW };
    } catch (err: any) {
        if (err.name !== "ConditionalCheckFailedException") {
            return null;
        }

        const result = await dynamoClient.send(
            new GetItemCommand({
                TableName: USER_TABLE,
                Key: { username: { S: username } },
            })
        );

        // User disappear. Should not happen. Just return null
        if (!result.Item) {
            return null;
        }

        return {
            username: result.Item.username.S!,
            role: result.Item.role?.S ?? ROLE_NEW,
        };
    }
};

const getJwtSecret = async (): Promise<string> => {
    const command = new GetSecretValueCommand({ SecretId: JWT_SECRET });
    const res = await secretsClient.send(command);

    if (!res.SecretString) {
        throw new Error("SecretString is empty");
    }

    return res.SecretString;
};

const createJwt = (username: string, role: string, secret: string) => {
    const payload: JwtPayload = {
        username,
        role,
    };

    return jwt.sign(payload, secret, {
        algorithm: "HS256",
        expiresIn: JWT_TTL_SECONDS,
        issuer: "gnaws",
        audience: "gnaws-web",
    });
};

export const verifyJwt = async (cookies: string[] | undefined = []): Promise<JwtPayload | null> => {
    const match = cookies.map(c => c.match(/jwt=([^;]+)/)).filter(c => c != null)[0];
    if (!match) return null;

    const token = match[1];

    const secret = await getJwtSecret();
    const payload = jwt.verify(token, secret);
    if (typeof payload === "string") {
        return null;
    }
    const username = payload.username;
    const role = payload.role;
    if (typeof username !== "string" || typeof role !== "string") {
        return null;
    }
    return { username, role };
};

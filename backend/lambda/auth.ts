import { Params } from "./types";
import { getOrCreateUser, User, getUserFromDB } from "./users";
import { APIGatewayProxyResult } from "aws-lambda";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import jwt from "jsonwebtoken";

const JWT_TTL_SECONDS = 60 * 60; // 1 hour

const secretsClient = new SecretsManagerClient({});

const SERVER_MANAGER_PASSWORD = process.env.SERVER_MANAGER_PASSWORD!;
const JWT_SECRET = process.env.JWT_SECRET!;

export type JwtPayload = {
    username: string;
};

export const logout = async (params: Params): Promise<APIGatewayProxyResult> => {
    return {
        statusCode: 200,
        headers: {
            "Set-Cookie": `jwt=; HttpOnly; Secure; Path=/; Max-Age=86400; SameSite=None`,
            "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify({}),
    };
}

export const login = async (params: Params, cookies: string[] | undefined = []): Promise<APIGatewayProxyResult> => {
    // Login with username and password and create new JWT
    if (typeof params.username === "string" && typeof params.password === "string") {
        return await loginWithUsernamePassword(params.username, params.password);
    }
    // Otherwise, verify JWT and return user
    try {
        const user = await getUserFromJwt(cookies);
        if (!user) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: "Invalid credentials" }),
            };
        }
        return {
            statusCode: 200,
            body: JSON.stringify({
                username: user.username,
                role: user.role,
            }),
        };
    } catch (e) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }
};

const loginWithUsernamePassword = async (username: string, password: string): Promise<APIGatewayProxyResult> => {
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
    const token = createJwt(user.username, jwtSecret);

    return {
        statusCode: 200,
        headers: {
            "Set-Cookie": `jwt=${token}; HttpOnly; Secure; Path=/; Max-Age=86400; SameSite=None`,
            "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify({
            username: user.username,
            role: user.role,
        }),
    };
};

const getJwtSecret = async (): Promise<string> => {
    const command = new GetSecretValueCommand({ SecretId: JWT_SECRET });
    const res = await secretsClient.send(command);

    if (!res.SecretString) {
        throw new Error("SecretString is empty");
    }

    return res.SecretString;
};

const createJwt = (username: string, secret: string) => {
    const payload: JwtPayload = {
        username,
    };

    return jwt.sign(payload, secret, {
        algorithm: "HS256",
        expiresIn: JWT_TTL_SECONDS,
        issuer: "gnaws",
        audience: "gnaws-web",
    });
};

// Verify given JWT and return username. If not valid, return null. Throw if fail to get secret
export const verifyJwt = async (cookies: string[] | undefined = []): Promise<string | null> => {
    const match = cookies.map((c) => c.match(/jwt=([^;]+)/)).filter((c) => c != null)[0];
    if (!match) return null;

    const token = match[1];

    const secret = await getJwtSecret();
    let payload;
    try {
        payload = jwt.verify(token, secret);
    } catch (e) {
        return null;
    }
    if (typeof payload === "string") {
        return null;
    }
    const username = payload.username;
    if (typeof username !== "string") {
        return null;
    }
    return username;
};

// Verify Jwt and return user. If not valid, return null. Throw if verify Jwt or DB throw
export const getUserFromJwt = async (cookies: string[] | undefined = []): Promise<User | null> => {
    const username = await verifyJwt(cookies);
    if (!username) {
        return null;
    }
    // Read user from DB to get updated role
    return await getUserFromDB(username);
};

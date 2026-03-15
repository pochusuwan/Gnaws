import { User, getUserFromDB, ROLE_OWNER, createUser } from "./users";
import { APIGatewayProxyResult } from "aws-lambda";
import jwt from "jsonwebtoken";
import { invalidCredential, serverError, success } from "./util";
import { dynamoClient } from "./clients";
import { GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import * as bcrypt from "bcryptjs";

const JWT_TTL_SECONDS = 60 * 60; // 1 hour

const INVITE_CODE_SECRET = "INVITE_CODE";
const OWNER_PASSWORD_HASH_SECRET = "OWNER_PASSWORD_HASH";
const JWT_SECRET = "JWT_SECRET";
const SECRET_TABLE = process.env.SECRET_TABLE_NAME!;

export type JwtPayload = {
    username: string;
};

export async function logout(params: any): Promise<APIGatewayProxyResult> {
    return {
        statusCode: 200,
        headers: {
            "Set-Cookie": `jwt=; HttpOnly; Secure; Path=/; Max-Age=${JWT_TTL_SECONDS}; SameSite=None`,
            "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify({}),
    };
}

export async function login(params: any, cookies: string[] | undefined = []): Promise<APIGatewayProxyResult> {
    try {
        // Login with username and password and create new JWT
        if (typeof params?.username === "string" && typeof params?.password === "string") {
            return await loginWithUsernamePassword(params.username, params.password, params.setPassword === true);
        }

        // Otherwise, verify JWT and return user
        const user = await getUserFromJwt(cookies);
        if (!user) {
            return invalidCredential();
        }
        return success({ user: { username: user.username, role: user.role } });
    } catch (e: any) {
        console.error(`Failed to login ${e.message}`);
        return serverError("Internal server error");
    }
}

// Verify given JWT and return username. If not valid, return null. Throw if fail to get secret
async function verifyJwt(cookies: string[] | undefined = []): Promise<string | null> {
    const match = cookies.map((c) => c.match(/jwt=([^;]+)/)).filter((c) => c != null)[0];
    if (!match) return null;

    const token = match[1];

    const secret = await getSecret(JWT_SECRET);
    if (!secret) {
        throw Error("Failed to get JWT while verifying");
    }
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
}

// Verify Jwt and return user. If not valid, return null. Throw if verify Jwt or DB throw
export const getUserFromJwt = async (cookies: string[] | undefined = []): Promise<User | null> => {
    const username = await verifyJwt(cookies);
    if (username) {
        // Read user from DB to get updated role
        return await getUserFromDB(username);
    }
    return null;
};

async function loginWithUsernamePassword(username: string, password: string, setPassword: boolean): Promise<APIGatewayProxyResult> {
    let user = await getUserFromDB(username);
    // Owner user created during stack creation. If role is owner, use owner login flow.
    if (user?.role === ROLE_OWNER) {
        return await ownerLogin(user, password, setPassword);
    }

    // Non-owner, use invite code
    const inviteCode = await getSecret(INVITE_CODE_SECRET);
    if (!inviteCode) {
        throw Error("Invite code not found");
    }
    // Invite code are stored as plain text
    if (password !== inviteCode) {
        return invalidCredential();
    }

    // If invite code is correct, create user with role new
    if (user == null) {
        user = await createUser(username);
    }
    return await loginSuccess(user);
}

async function ownerLogin(user: User, password: string, setPassword: boolean): Promise<APIGatewayProxyResult> {
    const storedHash = await getSecret(OWNER_PASSWORD_HASH_SECRET);
    if (storedHash !== undefined) {
        if (await bcrypt.compare(password, storedHash)) {
            return await loginSuccess(user);
        } else {
            return invalidCredential();
        }
    } else if (setPassword) {
        await setOwnerPassword(await bcrypt.hash(password, 10));
        return await loginSuccess(user);
    } else {
        return success({ setPassword: true });
    }
}

async function setOwnerPassword(passwordHash: string) {
    await dynamoClient.send(
        new PutItemCommand({
            TableName: SECRET_TABLE,
            Item: {
                id: { S: OWNER_PASSWORD_HASH_SECRET },
                value: { S: passwordHash },
            },
        }),
    );
}

async function getSecret(id: string): Promise<string | undefined> {
    const result = await dynamoClient.send(
        new GetItemCommand({
            TableName: SECRET_TABLE,
            Key: { id: { S: id } },
        }),
    );

    return result.Item?.value?.S;
}

async function loginSuccess(user: User): Promise<APIGatewayProxyResult> {
    let jwtSecret;
    try {
        jwtSecret = await getSecret(JWT_SECRET);
    } catch (e: any) {
        console.debug(`Failed to get JWT secret ${e.message}`);
        return serverError("Internal server error. Try again.");
    }
    if (!jwtSecret) {
        console.debug("Failed to get JWT while signing");
        return serverError("Internal server error. Try again.");
    }

    const token = jwt.sign({ username: user.username }, jwtSecret, {
        algorithm: "HS256",
        expiresIn: JWT_TTL_SECONDS,
        issuer: "gnaws",
        audience: "gnaws-web",
    });

    return {
        statusCode: 200,
        headers: {
            "Set-Cookie": `jwt=${token}; HttpOnly; Secure; Path=/; Max-Age=${JWT_TTL_SECONDS}; SameSite=None`,
            "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify({
            user: {
                username: user.username,
                role: user.role,
            },
        }),
    };
}

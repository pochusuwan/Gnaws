import { APIGatewayProxyResult } from "aws-lambda";
import { ConditionalCheckFailedException, GetItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./clients";
import { clientError, forbidden, serverError, success } from "./util";

const USER_TABLE = process.env.USER_TABLE_NAME!;
export const ROLE_NEW = "new";
export const ROLE_USER = "user";
export const ROLE_ADMIN = "admin";
export const ROLE_OWNER = "owner";
const ROLES = [ROLE_NEW, ROLE_USER, ROLE_ADMIN, ROLE_OWNER];
const ROLE_RANK: Record<string, number> = { [ROLE_NEW]: 0, [ROLE_USER]: 1, [ROLE_ADMIN]: 2, [ROLE_OWNER]: 3 };

export const USERNAME_REGEX = /^[a-zA-Z0-9]+$/;

// 4-digit PINs, same scheme as the old shared invite code
const generatePin = (): string => String(Math.floor(Math.random() * 10000)).padStart(4, "0");

export type User = {
    username: string;
    role: string;
    pin?: string;
};

export const getUsers = async (user: User, params: any): Promise<APIGatewayProxyResult> => {
    if (user.role !== ROLE_ADMIN && user.role !== ROLE_OWNER) {
        return forbidden();
    }

    const command = new ScanCommand({ TableName: USER_TABLE });
    let result;
    try {
        result = await dynamoClient.send(command);
    } catch (e) {
        return serverError("Internal server error");
    }

    const users =
        result.Items?.map((item) => ({
            username: item.username.S!,
            role: item.role?.S || ROLE_NEW,
            hasPin: item.pin?.S !== undefined,
        })) || [];

    return success({ users });
};

export const addUser = async (requestUser: User, params: any): Promise<APIGatewayProxyResult> => {
    if (requestUser.role !== ROLE_ADMIN && requestUser.role !== ROLE_OWNER) {
        return forbidden();
    }
    if (typeof params?.username !== "string" || !USERNAME_REGEX.test(params.username)) {
        return clientError("Invalid username");
    }

    const username = params.username;
    const pin = generatePin();
    try {
        await dynamoClient.send(
            new PutItemCommand({
                TableName: USER_TABLE,
                Item: {
                    username: { S: username },
                    role: { S: ROLE_NEW },
                    pin: { S: pin },
                },
                ConditionExpression: "attribute_not_exists(username)",
            }),
        );
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            return clientError("Username already exists");
        }
        return serverError("Internal server error");
    }

    return success({ user: { username, role: ROLE_NEW, pin } });
};

export const regeneratePin = async (requestUser: User, params: any): Promise<APIGatewayProxyResult> => {
    if (requestUser.role !== ROLE_ADMIN && requestUser.role !== ROLE_OWNER) {
        return forbidden();
    }
    if (typeof params?.username !== "string") {
        return clientError("Invalid request");
    }

    const target = await getUserFromDB(params.username);
    if (!target) {
        return clientError("User not found");
    }
    if (target.role === ROLE_OWNER) {
        return clientError("Owner does not use a PIN");
    }
    if (requestUser.username !== target.username && ROLE_RANK[requestUser.role] <= ROLE_RANK[target.role]) {
        return forbidden();
    }

    const pin = generatePin();
    try {
        await dynamoClient.send(
            new UpdateItemCommand({
                TableName: USER_TABLE,
                Key: { username: { S: params.username } },
                UpdateExpression: "SET pin = :pin",
                ConditionExpression: "attribute_exists(username)",
                ExpressionAttributeValues: {
                    ":pin": { S: pin },
                },
            }),
        );
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            return clientError("User not found");
        }
        return serverError("Internal server error");
    }

    return success({ pin });
};

// Reads a user row. The PIN is only included when the caller explicitly asks for it
// (the login flow, to verify a submitted PIN). Every other caller — including the
// authenticated-request path in getUserFromJwt, whose result is passed to every
// handler — gets a user object with no PIN, so it can't be serialized into a
// response by accident.
export const getUserFromDB = async (username: string, includePin = false): Promise<User | null> => {
    const result = await dynamoClient.send(
        new GetItemCommand({
            TableName: USER_TABLE,
            Key: { username: { S: username } },
        }),
    );

    if (!result.Item) {
        return null;
    }

    return {
        username: result.Item.username.S!,
        role: result.Item.role?.S ?? ROLE_NEW,
        ...(includePin ? { pin: result.Item.pin?.S } : {}),
    };
};

export const updateUsers = async (requestUser: User, params: any): Promise<APIGatewayProxyResult> => {
    if (requestUser.role !== ROLE_ADMIN && requestUser.role !== ROLE_OWNER) {
        return forbidden();
    }
    if (!Array.isArray(params?.users)) {
        return clientError("Invalid request");
    }
    const users = params.users
        .map((user: any) => {
            if (
                typeof user?.username === "string" &&
                typeof user?.role === "string" &&
                ROLES.includes(user.role) &&
                // Cannot change anyone else to owner
                user.role !== ROLE_OWNER &&
                // Cannot change self role
                user.username != requestUser.username
            ) {
                return {
                    username: user.username,
                    role: user.role,
                };
            }
            return null;
        })
        .filter((u: User | null) => u !== null) as User[];
    if (users.length === 0) {
        return clientError("Invalid request");
    }

    // Admins may only change roles for users they outrank (not other admins). Owner outranks everyone already.
    const isAdminActor = requestUser.role === ROLE_ADMIN;
    const conditionExpression = isAdminActor ? "#r <> :owner AND #r <> :admin" : "#r <> :owner";

    try {
        const updates = users.map((user) =>
            dynamoClient.send(
                new UpdateItemCommand({
                    TableName: USER_TABLE,
                    Key: {
                        username: { S: user.username },
                    },
                    UpdateExpression: "SET #r = :role",
                    ConditionExpression: conditionExpression,
                    ExpressionAttributeNames: {
                        "#r": "role",
                    },
                    ExpressionAttributeValues: {
                        ":role": { S: user.role },
                        ":owner": { S: ROLE_OWNER },
                        ...(isAdminActor ? { ":admin": { S: ROLE_ADMIN } } : {}),
                    },
                }),
            ),
        );

        const results = await Promise.allSettled(updates);
        const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
        if (rejected.length === 0) {
            return success({ success: true });
        } else if (rejected.every((result) => result.reason instanceof ConditionalCheckFailedException)) {
            return forbidden();
        } else {
            return serverError("Internal server error");
        }
    } catch (e) {
        return serverError("Internal server error");
    }
};

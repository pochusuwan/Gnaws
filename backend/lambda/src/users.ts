import { APIGatewayProxyResult } from "aws-lambda";
import { GetItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./clients";

const USER_TABLE = process.env.USER_TABLE_NAME!;
export const ROLE_NEW = "new";
export const ROLE_USER = "user";
export const ROLE_ADMIN = "admin";
export const ROLE_OWNER = "owner";
const ROLES = [ROLE_NEW, ROLE_USER, ROLE_ADMIN, ROLE_OWNER];

export type User = {
    username: string;
    role: string;
};

export const getUsers = async (user: User, params: any): Promise<APIGatewayProxyResult> => {
    if (user.role !== ROLE_ADMIN && user.role !== ROLE_OWNER) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: "Forbidden" }),
        };
    }

    const command = new ScanCommand({ TableName: USER_TABLE });
    let result;
    try {
        result = await dynamoClient.send(command);
    } catch (e) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }

    const users =
        result.Items?.map((item) => ({
            username: item.username.S!,
            role: item.role?.S || ROLE_NEW,
        })) || [];

    return {
        statusCode: 200,
        body: JSON.stringify({ users }),
    };
};

export async function createUser(username: string): Promise<User> {
    await dynamoClient.send(
        new PutItemCommand({
            TableName: USER_TABLE,
            Item: {
                username: { S: username },
                role: { S: ROLE_NEW },
            },
            ConditionExpression: "attribute_not_exists(username)",
        }),
    );

    return { username, role: ROLE_NEW };
}

export const getUserFromDB = async (username: string): Promise<User | null> => {
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
    };
};

export const updateUsers = async (requestUser: User, params: any): Promise<APIGatewayProxyResult> => {
    if (requestUser.role !== ROLE_ADMIN && requestUser.role !== ROLE_OWNER) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: "Forbidden" }),
        };
    }
    if (!Array.isArray(params?.users)) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid request" }),
        };
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
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid request" }),
        };
    }

    try {
        const updates = users.map((user) =>
            dynamoClient.send(
                new UpdateItemCommand({
                    TableName: USER_TABLE,
                    Key: {
                        username: { S: user.username },
                    },
                    UpdateExpression: "SET #r = :role",
                    ConditionExpression: "#r <> :owner",
                    ExpressionAttributeNames: {
                        "#r": "role",
                    },
                    ExpressionAttributeValues: {
                        ":role": { S: user.role },
                        ":owner": { S: ROLE_OWNER },
                    },
                }),
            ),
        );

        const results = await Promise.allSettled(updates);
        const success = results.filter((result) => result.status === "rejected").length === 0;
        if (success) {
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true }),
            };
        } else {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Internal server error" }),
            };
        }
    } catch (e) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    }
};

import { APIGatewayProxyResult } from "aws-lambda";
import { Params } from "./types";
import { DynamoDBClient, GetItemCommand, PutItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";

const dynamoClient = new DynamoDBClient({});

const USER_TABLE = process.env.USER_TABLE_NAME!;
export const ROLE_NEW = "new";
export const ROLE_MANAGER = "manager";
export const ROLE_ADMIN = "admin";

export type User = {
    username: string;
    role: string;
};

export const getUsers = async (user: User, params: Params): Promise<APIGatewayProxyResult> => {
    if (user.role !== "admin") {
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
            role: item.role?.S || "ROLE_NEW",
        })) || [];

    return {
        statusCode: 200,
        body: JSON.stringify({ users }),
    };
};

export const getOrCreateUser = async (username: string): Promise<User | null> => {
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

export const getUserFromDB = async (username: string): Promise<User | null> => {
    const result = await dynamoClient.send(
        new GetItemCommand({
            TableName: USER_TABLE,
            Key: { username: { S: username } },
        })
    );

    if (!result.Item) {
        return null;
    }

    return {
        username: result.Item.username.S!,
        role: result.Item.role?.S ?? ROLE_NEW,
    };
};

import { APIGatewayProxyResult } from "aws-lambda";
import { forbidden, serverError, success } from "./util";
import { ROLE_ADMIN, User } from "./users";
import { dynamoClient, ec2Client } from "./clients";
import { UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { DescribeImagesCommand } from "@aws-sdk/client-ec2";
import { getGames } from "./games";

const WORKFLOW_TABLE = process.env.WORKFLOW_TABLE_NAME!;
const AMAZON_IMAGE_RESOURCE_ID = "GET_AMAZON_IMAGE";
const GET_AMAZON_IMAGE_RATE_LIMIT_MS = 24 * 60 * 60 * 1000;
const LOCK_EXPIRE = 20 * 1000;

export async function initCreateServer(user: User, params: any): Promise<APIGatewayProxyResult> {
    if (user.role !== ROLE_ADMIN) {
        return forbidden();
    }

    let gamesResult;
    try {
        gamesResult = await getGames();
    } catch (e) {
        return serverError("Failed to get games");
    }
    if (gamesResult.games === undefined) {
        return serverError("Failed to get games");
    }
    if (gamesResult.message) {
        // Log error but continue
        console.debug(gamesResult.message);
    }

    try {
        await updateAmazonImageId();
    } catch (e) {
        console.debug(e);
        return serverError("Failed to initialize Amazon image id");
    }

    return success(gamesResult);
}

async function updateAmazonImageId() {
    let shouldUpdate;
    try {
        shouldUpdate = await shouldUpdateImageId();
    } catch (e) {
        throw new Error("Failed to get image id lock");
    }
    if (shouldUpdate) {
        let success;
        try {
            success = await saveImageId(await getImageId());
        } catch (e) {
            throw new Error("Failed to update image id");
        }
        if (!success) {
            throw new Error("Failed to get image id");
        }
    }
}

async function saveImageId(imageId: string | null): Promise<boolean> {
    if (imageId !== null) {
        const now = Date.now();
        await dynamoClient.send(
            new UpdateItemCommand({
                TableName: WORKFLOW_TABLE,
                Key: { resourceId: { S: AMAZON_IMAGE_RESOURCE_ID } },
                UpdateExpression: "SET #status = :success, lastSuccessTime = :now, imageId = :imageId",
                ExpressionAttributeNames: {
                    "#status": "status",
                },
                ExpressionAttributeValues: {
                    ":success": { S: "Success" },
                    ":now": { N: now.toString() },
                    ":imageId": { S: imageId },
                },
            }),
        );
        return true;
    } else {
        await dynamoClient.send(
            new UpdateItemCommand({
                TableName: WORKFLOW_TABLE,
                Key: { resourceId: { S: AMAZON_IMAGE_RESOURCE_ID } },
                UpdateExpression: "SET #status = :failed",
                ExpressionAttributeNames: {
                    "#status": "status",
                },
                ExpressionAttributeValues: {
                    ":failed": { S: "Failed" },
                },
            }),
        );
        return false;
    }
}

async function getImageId(): Promise<string | null> {
    try {
        // TODO: custom filter
        const response = await ec2Client.send(
            new DescribeImagesCommand({
                Owners: ["099720109477"], // Canonical AWS images
                Filters: [
                    {
                        Name: "name",
                        Values: ["ubuntu/images/hvm-ssd*24.04*"],
                    },
                    {
                        Name: "architecture",
                        Values: ["x86_64"],
                    },
                    {
                        Name: "virtualization-type",
                        Values: ["hvm"],
                    },
                    {
                        Name: "root-device-type",
                        Values: ["ebs"],
                    },
                    {
                        Name: "state",
                        Values: ["available"],
                    },
                ],
            }),
        );

        const sortedImages = response.Images?.sort((a, b) => {
            if (a.CreationDate !== undefined && b.CreationDate !== undefined) {
                return new Date(a.CreationDate) > new Date(b.CreationDate) ? -1 : 1;
            }
            return a.CreationDate !== undefined ? -1 : 1;
        });

        const bestImage = sortedImages?.[0]?.ImageId;
        return bestImage ?? null;
    } catch (e) {
        return null;
    }
}

async function shouldUpdateImageId(): Promise<boolean> {
    // Should update image id if this is the first run
    // Or previous run failed or not rate limited
    const now = Date.now();
    try {
        await dynamoClient.send(
            new UpdateItemCommand({
                TableName: WORKFLOW_TABLE,
                Key: { resourceId: { S: AMAZON_IMAGE_RESOURCE_ID } },
                UpdateExpression: "SET #status = :running, lockTime = :now",
                ConditionExpression: `
                    attribute_not_exists(#status) OR 
                    (
                        (attribute_not_exists(lastSuccessTime) OR lastSuccessTime < :rateLimitThreshold)
                        AND
                        (#status <> :running OR lockTime < :staleLockThreshold)
                    )`,
                ExpressionAttributeNames: {
                    "#status": "status",
                },
                ExpressionAttributeValues: {
                    ":running": { S: "Running" },
                    ":now": { N: now.toString() },
                    ":staleLockThreshold": { N: (now - LOCK_EXPIRE).toString() },
                    ":rateLimitThreshold": { N: (now - GET_AMAZON_IMAGE_RATE_LIMIT_MS).toString() },
                },
            }),
        );
    } catch (e: any) {
        if (e.name !== "ConditionalCheckFailedException") {
            throw new Error("Failed to create lock. Try again.");
        }
        // Should not check for image id
        return false;
    }
    return true;
}

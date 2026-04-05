import { GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient, ssmClient } from "./clients";
import { ROLE_ADMIN, ROLE_OWNER, User } from "./users";
import { APIGatewayProxyResult } from "aws-lambda";
import { forbidden, success } from "./util";
import { GetParameterCommand } from "@aws-sdk/client-ssm";

const INFRASTRUCTURE_VERSION_SSM_PARAM = process.env.INFRASTRUCTURE_VERSION_SSM_PARAM!;
const WORKFLOW_TABLE = process.env.WORKFLOW_TABLE_NAME!;
const GET_RELEASE_VERSIONS_ID = "GET_RELEASE_VERSIONS";
const GET_RELEASE_VERSIONS_RATE_LIMIT_MS = 60 * 60 * 1000;
const LOCK_EXPIRE = 30 * 1000;

const LATEST_RELEASE_URL = "https://api.github.com/repos/pochusuwan/Gnaws/releases/latest";
const HEADERS = {
    "User-Agent": "aws-lambda",
};

// Force the system to fetch a specific version. This is used to test pre-release games.
const FETCH_VERSION_OVERRIDE: string | undefined = undefined;

export async function checkForNewRelease(user: User, params: any): Promise<APIGatewayProxyResult> {
    if (user.role !== ROLE_OWNER && user.role !== ROLE_ADMIN) {
        return forbidden();
    }
    try {
        await getLatestVersionNumber();
    } catch (e: any) {
        console.error(`Failed update versions data: ${e.message}`);
    }
    return success({
        hasInfraUpdate: await hasNewInfraUpdate(),
    });
}

async function getLatestVersionNumber(): Promise<void> {
    let shouldCheck;
    try {
        shouldCheck = await shouldCheckForLatestRelease();
    } catch (e: any) {
        console.error(`Failed to get version lock ${e.message}`);
        throw new Error("Failed to get version lock");
    }
    if (shouldCheck) {
        try {
            await saveLatestReleaseVersion(await getLatestReleaseTag());
        } catch (e: any) {
            console.error(`Failed to update release version ${e.message}`);
            throw new Error("Failed to update release version");
        }
    }
}

async function shouldCheckForLatestRelease(): Promise<boolean> {
    // Should update image id if this is the first run
    // Or previous run failed or not rate limited
    const now = Date.now();
    try {
        await dynamoClient.send(
            new UpdateItemCommand({
                TableName: WORKFLOW_TABLE,
                Key: { resourceId: { S: GET_RELEASE_VERSIONS_ID } },
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
                    ":rateLimitThreshold": { N: (now - GET_RELEASE_VERSIONS_RATE_LIMIT_MS).toString() },
                },
            }),
        );
    } catch (e: any) {
        if (e.name !== "ConditionalCheckFailedException") {
            throw new Error(`Failed to create lock. ${e.message}`);
        }
        return false;
    }
    return true;
}

async function getLatestReleaseTag(): Promise<string> {
    const res = await fetch(LATEST_RELEASE_URL, { headers: HEADERS });
    if (!res.ok) {
        throw new Error(`Failed to get latest release: ${res.status}`);
    }

    return FETCH_VERSION_OVERRIDE ?? ((await res.json()) as any).tag_name;
}

async function saveLatestReleaseVersion(version: string): Promise<boolean> {
    const now = Date.now();
    await dynamoClient.send(
        new UpdateItemCommand({
            TableName: WORKFLOW_TABLE,
            Key: { resourceId: { S: GET_RELEASE_VERSIONS_ID } },
            UpdateExpression: "SET #status = :success, lastSuccessTime = :now, version = :version",
            ExpressionAttributeNames: {
                "#status": "status",
            },
            ExpressionAttributeValues: {
                ":success": { S: "Success" },
                ":now": { N: now.toString() },
                ":version": { S: version },
            },
        }),
    );
    return true;
}

export async function getStoredLatestVersion(): Promise<string | null> {
    try {
        const result = await dynamoClient.send(
            new GetItemCommand({
                TableName: WORKFLOW_TABLE,
                Key: { resourceId: { S: GET_RELEASE_VERSIONS_ID } },
            }),
        );

        return result.Item?.version?.S ?? null;
    } catch (e: any) {
        console.error(`Failed to get stored release version ${e.message}`);
        return null;
    }
}

async function hasNewInfraUpdate(): Promise<boolean> {
    try {
        const latestVersion = await getStoredLatestVersion();
        const latestInfraVersion = latestVersion?.split("_")?.[0];

        const currentVersion = await ssmClient.send(
            new GetParameterCommand({
                Name: INFRASTRUCTURE_VERSION_SSM_PARAM,
            }),
        );
        const currentInfraVersion = currentVersion.Parameter?.Value?.split("_")?.[0];

        return latestInfraVersion !== undefined && latestInfraVersion !== currentInfraVersion;
    } catch (e: any) {
        console.error(`Failed to get current version ${e.message}`);
        return false;
    }
}

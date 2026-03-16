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
const INFRA_VERSION_PREFIX = "infra-";
const GAMES_VERSION_PREFIX = "games-";

const LATEST_RELEASE_URL = "https://api.github.com/repos/pochusuwan/Gnaws/releases/latest";
const HEADERS = {
    "User-Agent": "aws-lambda",
};

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

    return ((await res.json()) as any).tag_name;
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

async function getLatestInfraVersion(): Promise<{ releaseVersion: string; version: string } | null> {
    const releaseVersion = await getStoredVersion();
    const v = releaseVersion?.split("_");
    if (releaseVersion == null || v?.length !== 2 || v[0].length <= INFRA_VERSION_PREFIX.length) return null;
    return {
        releaseVersion,
        version: v[0].slice(INFRA_VERSION_PREFIX.length),
    };
}

export async function getLatestGamesVersion(): Promise<{ releaseVersion: string; version: string } | null> {
    const releaseVersion = await getStoredVersion();
    const v = releaseVersion?.split("_");
    if (releaseVersion == null || v?.length !== 2 || v[1].length <= GAMES_VERSION_PREFIX.length) return null;
    return {
        releaseVersion,
        version: v[1].slice(GAMES_VERSION_PREFIX.length),
    };
}

async function getStoredVersion(): Promise<string | null> {
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
        const latestInfraVersion = await getLatestInfraVersion();
        const current = await ssmClient.send(
            new GetParameterCommand({
                Name: INFRASTRUCTURE_VERSION_SSM_PARAM,
            }),
        );

        return latestInfraVersion !== null && latestInfraVersion.version !== current.Parameter?.Value;
    } catch (e: any) {
        console.error(`Failed to get current version ${e.message}`);
        return false;
    }
}

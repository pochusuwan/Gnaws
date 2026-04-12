import { createWriteStream, promises as fs } from "fs";
import { pipeline } from "stream/promises";
import * as tar from "tar";
import { Configuration, Game, Message, Port, TermsOfService } from "./types";
import { dynamoClient } from "./clients";
import { BatchWriteItemCommand, GetItemCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { getStoredLatestVersion } from "./versioning";
import { ROLE_ADMIN, ROLE_OWNER, User } from "./users";
import { APIGatewayProxyResult } from "aws-lambda";
import { clientError, forbidden, serverError, success } from "./util";

const WORKFLOW_TABLE = process.env.WORKFLOW_TABLE_NAME!;
const GAME_TABLE = process.env.GAME_TABLE_NAME!;
const GET_GAMES_RESOURCE_ID = "GET_GAMES";
const GET_GAMES_LOCK_EXPIRE_MS = 5 * 60 * 1000;
const GET_GAMES_RATE_LIMIT_MS = 6 * 60 * 60 * 1000;

const download_url = (releaseTag: string) => `https://github.com/pochusuwan/Gnaws/releases/download/${releaseTag}/game_server.tar.gz`;
const TAR_PATH = "/tmp/gnaws.tar.gz";
const CONTENT_PATH = "/tmp/gnaws";
const GAMES_DIR = "/game_server/games";
const HEADERS = {
    "User-Agent": "aws-lambda",
};

export async function getGame(user: User, params: any): Promise<APIGatewayProxyResult> {
    if (user.role !== ROLE_ADMIN && user.role !== ROLE_OWNER) {
        return forbidden();
    }
    if (typeof params?.gameId !== "string") {
        return clientError("Invalid request");
    }
    const game = await getGameFromDB(params?.gameId);
    if (!game) {
        return serverError("Game not found");
    }
    return success({ game })
}

export async function getGames(): Promise<{ games?: Game[]; message?: string; version?: string }> {
    // Fetch games list and sync to DDB from latest release on github.
    // Latest release version tag is already fetched.
    // Check current game version to see if update is needed.
    // If game sync fail or rate limited, return games list from DDB.
    let shouldCheck = false;
    let games = [];
    let errorMessage;
    try {
        shouldCheck = await shouldCheckForLatestRelease();
    } catch (e: any) {
        console.debug(`Failed to get update games lock ${e.message}`);
        errorMessage = "Failed to update games list.";
    }
    if (shouldCheck) {
        // Attempt to sync games from latest release and return games
        try {
            // Get latest release version
            const latestVersion = await getStoredLatestVersion();
            if (latestVersion) {
                // Get fetched games version
                const syncedVersion = await getSyncedGamesVersion();
                if (!syncedVersion || !isSameGameVersion(latestVersion, syncedVersion)) {
                    games = await syncGamesList(latestVersion);
                    await setGameListStatusSuccess(latestVersion);
                    return { games, version: latestVersion };
                }
            } else {
                errorMessage = "Failed to update games list.";
            }
        } catch (e: any) {
            console.error(`Failed to update games list ${e.message}`);
            errorMessage = "Failed to update games list.";
        }
        // Update not needed or failed. Set lock status
        try {
            if (errorMessage) {
                setGameListStatusFailed();
            } else {
                setGameListStatusSuccess();
            }
        } catch (e: any) {
            console.error(`Failed to set game list status ${e.message}`);
            // Ok to fail. It can retry after timeout.
        }
    }
    // Get current games from DDB
    try {
        const command = new ScanCommand({
            TableName: GAME_TABLE,
        });
        const result = await dynamoClient.send(command);
        const games = (result.Items?.map((item) => unmarshall(item)) as Game[]) ?? [];
        const version = await getSyncedGamesVersion();
        if (version && games.length) {
            return {
                games,
                version,
                message: errorMessage,
            };
        } else {
            return { message: "No games found." };
        }
    } catch (e) {
        return { message: "Failed to get games." };
    }
}

async function getSyncedGamesVersion(): Promise<string | null> {
    try {
        const result = await dynamoClient.send(
            new GetItemCommand({
                TableName: WORKFLOW_TABLE,
                Key: { resourceId: { S: GET_GAMES_RESOURCE_ID } },
            }),
        );

        return result.Item?.version?.S ?? null;
    } catch (e: any) {
        console.error(`Failed to get synced games version ${e.message}`);
        return null;
    }
}

async function downloadReleaseTar(releaseTag: string): Promise<void> {
    const res = await fetch(download_url(releaseTag), { headers: HEADERS });
    if (!res.ok || !res.body) {
        throw new Error(`Failed to download games: ${res.status}`);
    }

    await pipeline(res.body as any, createWriteStream(TAR_PATH));
}

async function parseGameFiles(): Promise<Game[]> {
    const entries = await fs.readdir(`${CONTENT_PATH}${GAMES_DIR}`, { withFileTypes: false });
    const files = entries.map((entry) => `${CONTENT_PATH}${GAMES_DIR}/${entry}/gnaws-game.json`);

    const games: Game[] = [];
    for (const file of files) {
        try {
            const content = await fs.readFile(file, "utf-8");
            const parsed = JSON.parse(content);
            const id = parsed.id;
            const displayName = parsed.displayName;
            const instanceType = parsed.ec2?.instanceType;
            const minimumInstanceType = parsed.ec2?.minimumInstanceType;
            const storage = parsed.ec2?.storage;
            const ports = parsed.ec2?.ports;
            if (
                typeof id !== "string" ||
                typeof displayName !== "string" ||
                typeof instanceType !== "string" ||
                typeof minimumInstanceType !== "string" ||
                typeof storage !== "number" ||
                !Array.isArray(ports)
            ) {
                continue;
            }
            const parsedPort: Port[] = [];
            ports.forEach((port) => {
                const portNumber = port.port;
                const protocol = port.protocol;
                if (typeof portNumber === "number" && (protocol === "tcp" || protocol === "udp")) {
                    parsedPort.push({ port: portNumber, protocol });
                }
            });
            if (parsedPort.length < 0) {
                continue;
            }

            const termsOfService: TermsOfService[] = [];
            const tos = parsed.termsOfService;
            if (Array.isArray(tos)) {
                tos.forEach((t) => {
                    if (typeof t.name === "string" && typeof t.url === "string" && typeof t.type === "string") {
                        termsOfService.push({ name: t.name, url: t.url, type: t.type });
                    }
                });
                // All TOS must be valid
                if (termsOfService.length !== tos.length) {
                    continue;
                }
            }

            const messages: Message[] = [];
            const msg = parsed.messages;
            if (Array.isArray(msg)) {
                msg.forEach((m) => {
                    if (typeof m.type === "string" && typeof m.text === "string") {
                        messages.push({ type: m.type, text: m.text });
                    }
                });
            }

            const configurations: Configuration[] = [];
            const cfg = parsed.configurations;
            if (Array.isArray(cfg)) {
                cfg.forEach((c) => {
                    if (
                        typeof c.id !== "string" ||
                        typeof c.type !== "string" ||
                        typeof c.displayName !== "string" ||
                        c.displayName.length === 0 ||
                        typeof c.description !== "string" ||
                        c.description.length === 0
                    ) {
                        return;
                    }
                    const base: any = {
                        id: c.id,
                        type: c.type,
                        displayName: c.displayName,
                        description: c.description,
                        isCreationOnly: typeof c.isCreationOnly === "boolean" ? c.isCreationOnly : undefined,
                    };
                    if (base.type === "alphanumeric") {
                        if (typeof c.minLength === "number") base.minLength = c.minLength;
                        if (typeof c.maxLength === "number") base.maxLength = c.maxLength;
                        if (typeof c.default === "string") base.default = c.default;
                        configurations.push(base);
                    } else if (base.type === "numeric") {
                        if (typeof c.minValue === "number") base.minValue = c.minValue;
                        if (typeof c.maxValue === "number") base.maxValue = c.maxValue;
                        if (typeof c.default === "number") base.default = c.default;
                        if (typeof c.isIntegerOnly === "boolean") base.isIntegerOnly = c.isIntegerOnly;
                        configurations.push(base);
                    } else if (base.type === "boolean") {
                        if (typeof c.default !== "boolean") return;
                        base.default = c.default;
                        configurations.push(base);
                    } else if (base.type === "enum") {
                        if (typeof c.default !== "string") return;
                        if (!Array.isArray(c.values)) return;

                        let defaultPresent = false;
                        const values: string[] = c.values.filter((v: any) => {
                            if (typeof v !== "string") return false;
                            if (c.default === v) defaultPresent = true;
                            return true;
                        });
                        if (values.length !== c.values.length) return;
                        if (!defaultPresent) return;
                        base.default = c.default;
                        base.values = values;
                        configurations.push(base);
                    }
                });
            }

            games.push({
                id,
                displayName,
                ec2: {
                    instanceType,
                    minimumInstanceType,
                    storage,
                    ports: parsedPort,
                },
                termsOfService,
                messages,
                supportServerCommand: parsed.supportServerCommand === true,
                configurations,
            });
        } catch (e) {
            console.debug(`Failed to read game: ${file} ${e}`);
        }
    }
    return games;
}

async function replaceGamesInDDB(games: Game[]): Promise<void> {
    const BATCH_SIZE = 25;

    for (let i = 0; i < games.length; i += BATCH_SIZE) {
        const batch = games.slice(i, i + BATCH_SIZE);

        const requestItems = batch.map((game) => ({
            PutRequest: {
                Item: marshall(game, { removeUndefinedValues: true }),
            },
        }));

        await dynamoClient.send(
            new BatchWriteItemCommand({
                RequestItems: {
                    [GAME_TABLE]: requestItems,
                },
            }),
        );
    }
}

async function syncGamesList(releaseTag: string): Promise<Game[]> {
    await downloadReleaseTar(releaseTag);
    await fs.mkdir(CONTENT_PATH, { recursive: true });
    await tar.x({ file: TAR_PATH, cwd: CONTENT_PATH });
    const games = await parseGameFiles();
    replaceGamesInDDB(games);
    return games;
}

async function shouldCheckForLatestRelease(): Promise<boolean> {
    // Should check for latest release if this is the first run
    // Or previous run failed or not rate limited
    const now = Date.now();
    try {
        await dynamoClient.send(
            new UpdateItemCommand({
                TableName: WORKFLOW_TABLE,
                Key: { resourceId: { S: GET_GAMES_RESOURCE_ID } },
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
                    ":staleLockThreshold": { N: (now - GET_GAMES_LOCK_EXPIRE_MS).toString() },
                    ":rateLimitThreshold": { N: (now - GET_GAMES_RATE_LIMIT_MS).toString() },
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

async function setGameListStatusSuccess(version?: string): Promise<void> {
    const now = Date.now();
    let updateExpression = "SET #status = :success, lastSuccessTime = :now";
    const attributeValues: Record<string, any> = {
        ":success": { S: "Success" },
        ":now": { N: now.toString() },
    };
    if (version) {
        updateExpression += ", version =:version";
        attributeValues[":version"] = { S: version };
    }
    await dynamoClient.send(
        new UpdateItemCommand({
            TableName: WORKFLOW_TABLE,
            Key: { resourceId: { S: GET_GAMES_RESOURCE_ID } },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: {
                "#status": "status",
            },
            ExpressionAttributeValues: attributeValues,
        }),
    );
}

async function setGameListStatusFailed(): Promise<void> {
    const now = Date.now();
    await dynamoClient.send(
        new UpdateItemCommand({
            TableName: WORKFLOW_TABLE,
            Key: { resourceId: { S: GET_GAMES_RESOURCE_ID } },
            UpdateExpression: "SET #status = :failed",
            ExpressionAttributeNames: {
                "#status": "status",
            },
            ExpressionAttributeValues: {
                ":failed": { S: "Failed" },
            },
        }),
    );
}

export async function getGameFromDB(gameId: string): Promise<Game | null> {
    try {
        const result = await dynamoClient.send(
            new GetItemCommand({
                TableName: GAME_TABLE,
                Key: { id: { S: gameId } },
            }),
        );

        if (!result.Item) {
            return null;
        }
        return unmarshall(result.Item) as Game;
    } catch (e) {
        return null;
    }
}

function isSameGameVersion(version: string, syncedVersion: string): boolean {
    const latestGameVersion = getGameVersion(version);
    const syncedGameVersion = getGameVersion(syncedVersion);
    return latestGameVersion !== null && syncedGameVersion !== null && latestGameVersion === syncedGameVersion;
}

function getGameVersion(version: string): string | null {
    const v = version.split("_");
    if (v.length !== 2) return null;
    return v[1];
}

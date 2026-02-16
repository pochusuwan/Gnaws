import { APIGatewayProxyResult } from "aws-lambda";
import { forbidden, serverError, success } from "./util";
import { createWriteStream, promises as fs } from "fs";
import { pipeline } from "stream/promises";
import * as tar from "tar";
import { Port } from "./types";
import { ROLE_ADMIN, User } from "./users";
import { dynamoClient } from "./clients";
import { BatchWriteItemCommand, GetItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const WORKFLOW_TABLE = process.env.WORKFLOW_TABLE_NAME!;
const GAME_TABLE = process.env.GAME_TABLE_NAME!;
const GET_GAMES_RESOURCE_ID = "GET_GAMES";
const GET_GAMES_TIMEOUT_MS = 60 * 60 * 1000;
const FAILED_STATUS = "Failed";

const LATEST_RELEASE_URL = "https://api.github.com/repos/pochusuwan/Gnaws/releases/latest";
const download_url = (releaseTag: string) => `https://github.com/pochusuwan/Gnaws/releases/download/${releaseTag}/game_server.tar.gz`;
const TAR_PATH = "/tmp/gnaws.tar.gz";
const CONTENT_PATH = "/tmp/gnaws";
const GAMES_DIR = "/game_server/games";
const HEADERS = {
    "User-Agent": "aws-lambda",
};

type TermsOfService = {
    name: string;
    url: string;
    type: string;
};
type Message = {
    type: string;
    text: string;
};
type Game = {
    id: string;
    displayName: string;
    ec2: {
        instanceType: string;
        minimumInstanceType: string;
        storage: number;
        ports: Port[];
    };
    termsOfService?: TermsOfService[];
    messages?: Message[];
};

export async function getGames(): Promise<{ games?: Game[]; message?: string }> {
    // Fetch games list and sync to DDB from latest release on github.
    // Checking github latest release has timeout of 1 hour to rate limit.
    // If game sync fail or rate limited, return games list from DDB.
    let shouldCheckLatest = false;
    let games = [];
    let errorMessage;
    try {
        shouldCheckLatest = await shouldCheckForLatestRelease();
    } catch (e: any) {
        errorMessage = "Failed to update games list.";
    }
    // Fetch games from latest release
    if (shouldCheckLatest) {
        try {
            const latestRelease = await getLatestReleaseTag();
            const isOutdated = await isGamesListOutdated(latestRelease);
            if (isOutdated) {
                games = await syncGamesList(latestRelease);
                await setGameListStatusSuccess(latestRelease);
                return { games };
            }
        } catch (e) {
            errorMessage = "Failed to update games list.";
        }
    }
    try {
        if (errorMessage == null) {
            setGameListStatusSuccess();
        } else {
            setGameListStatusFailed();
        }
    } catch (e) {
        // Ok to fail. It can retry after timeout.
    }
    // Otherwise, get games from DDB
    try {
        const command = new ScanCommand({
            TableName: GAME_TABLE,
        });
        const result = await dynamoClient.send(command);
        return {
            games: (result.Items?.map((item) => unmarshall(item)) as Game[]) ?? [],
            message: errorMessage,
        };
    } catch (e) {
        return { message: "Failed to get games." };
    }
}

async function getLatestReleaseTag(): Promise<string> {
    const res = await fetch(LATEST_RELEASE_URL, { headers: HEADERS });
    if (!res.ok) {
        throw new Error(`Failed to get latest release: ${res.status}`);
    }

    return ((await res.json()) as any).tag_name;
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
                Item: marshall(game),
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
            new PutItemCommand({
                TableName: WORKFLOW_TABLE,
                Item: {
                    resourceId: { S: GET_GAMES_RESOURCE_ID },
                    status: { S: "Running" },
                    lastUpdatedAt: { N: now.toString() },
                },
                ConditionExpression: "attribute_not_exists(resourceId)",
            }),
        );
    } catch (e: any) {
        if (e.name !== "ConditionalCheckFailedException") {
            // Retryable unexpected error.
            throw new Error("Failed to create lock. Try again.");
        }
        try {
            await dynamoClient.send(
                new UpdateItemCommand({
                    TableName: WORKFLOW_TABLE,
                    Key: { resourceId: { S: GET_GAMES_RESOURCE_ID } },
                    UpdateExpression: "SET #status = :running, lastUpdatedAt = :now",
                    ConditionExpression: "#status = :failed OR lastUpdatedAt < :timeoutAgo",
                    ExpressionAttributeNames: {
                        "#status": "status",
                    },
                    ExpressionAttributeValues: {
                        ":running": { S: "Running" },
                        ":failed": { S: FAILED_STATUS },
                        ":now": { N: now.toString() },
                        ":timeoutAgo": { N: (now - GET_GAMES_TIMEOUT_MS).toString() },
                    },
                }),
            );
        } catch (e: any) {
            if (e.name !== "ConditionalCheckFailedException") {
                throw new Error("Failed to create lock. Try again.");
            }
            // Should not check for new release
            return false;
        }
        // Timeout passed or last run failed
        return true;
    }
    // First run
    return true;
}

async function isGamesListOutdated(latestRelease: string): Promise<boolean> {
    try {
        const result = await dynamoClient.send(
            new GetItemCommand({
                TableName: WORKFLOW_TABLE,
                Key: { resourceId: { S: GET_GAMES_RESOURCE_ID } },
            }),
        );

        if (!result.Item) {
            return true;
        }
        const item = unmarshall(result.Item);
        return item.version !== latestRelease;
    } catch (e) {
        throw new Error("Failed to check game version.");
    }
}

async function setGameListStatusSuccess(version?: string): Promise<void> {
    const now = Date.now();
    let updateExpression = "SET #status = :success, lastUpdatedAt = :now";
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
            UpdateExpression: "SET #status = :failed, lastUpdatedAt = :now",
            ExpressionAttributeNames: {
                "#status": "status",
            },
            ExpressionAttributeValues: {
                ":failed": { S: FAILED_STATUS },
                ":now": { N: now.toString() },
            },
        }),
    );
}

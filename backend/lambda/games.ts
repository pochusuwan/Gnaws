import { APIGatewayProxyResult } from "aws-lambda";
import { success } from "./util";
import { createWriteStream, promises as fs } from "fs";
import { pipeline } from "stream/promises";
import * as tar from "tar";
import { Port } from "./servers";

const TAR_PATH = "/tmp/gnaws.tar.gz";
const CONTENT_PATH = "/tmp/gnaws";
const GAMES_DIR = "/game_server/games";
const HEADERS = {
    "User-Agent": "aws-lambda",
};

type Game = {
    id: string;
    displayName: string;
    ec2?: {
        instanceType: string;
        storage: number;
        ports: Port[]
    },
};

async function getLatestReleaseTag(url: string): Promise<string> {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
        throw new Error(`Failed to get latest release: ${res.status}`);
    }

    return ((await res.json()) as any).tag_name;
}

async function downloadReleaseTar(url: string): Promise<void> {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok || !res.body) {
        throw new Error(`Failed to download games: ${res.status}`);
    }

    await pipeline(res.body as any, createWriteStream(TAR_PATH));
}

async function processJsonFiles(): Promise<Game[]> {
    const entries = await fs.readdir(`${CONTENT_PATH}${GAMES_DIR}`, { withFileTypes: false });
    const files = entries.map((entry) => `${CONTENT_PATH}${GAMES_DIR}/${entry}/game.json`);

    const games: Game[] = [];
    for (const file of files) {
        try {
            const content = await fs.readFile(file, "utf-8");
            const parsed = JSON.parse(content);
            const id = parsed.id;
            const displayName = parsed.displayName;
            if (typeof id !== 'string' || typeof displayName !== 'string') {
                continue;
            }
            games.push({id, displayName });
            console.debug("display", parsed.displayName);
        } catch (e) {
            console.debug(`Failed to read game: ${file} ${e}`);
        }
    }
    return games;
}

export const getGames = async (): Promise<APIGatewayProxyResult> => {
    // TODO: check role
    // TODO: prevent spam, read from DDB
    try {
        const latestRelease = await getLatestReleaseTag(`https://api.github.com/repos/pochusuwan/Gnaws/releases/latest`);
        await downloadReleaseTar(`https://github.com/pochusuwan/Gnaws/releases/download/${latestRelease}/game_server.tar.gz`);
        await fs.mkdir(CONTENT_PATH, { recursive: true });
        await tar.x({
            file: TAR_PATH,
            cwd: CONTENT_PATH,
        });
        // TODO: save to DDB
        return success({ games: await processJsonFiles() });
    } catch (e) {
        console.debug(e);
    }
    return success({});
};

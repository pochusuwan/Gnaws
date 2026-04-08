import { AlphanumericConfig, Game, NumericConfig, Server, ServerGameConfig } from "./types";
import { getGameFromDB } from "./games";

export async function buildGameConfigPayload(server: Server): Promise<string | undefined> {
    let game;
    if (server.game?.id) {
        game = await getGameFromDB(server.game?.id);
    }
    if (!game) {
        console.error("Game not found for server");
        return;
    }
    const configurations = Object.fromEntries(game.configurations?.map((c) => [c.id, c]) ?? []);
    const configObj: { [k: string]: string | number | boolean } = {};
    server.game?.configurations?.forEach((c) => {
        const config = configurations[c.id];
        if (config && c.value !== undefined) {
            if (config.type === "alphanumeric" && validateAlphanumericConfig(config, c.value)) {
                configObj[config.id] = c.value;
            } else if (config.type === "numeric" && validateNumericConfig(config, c.value)) {
                configObj[config.id] = c.value;
            } else if (config.type === "boolean" && typeof c.value === "boolean") {
                configObj[config.id] = c.value;
            }
        }
    });
    if (Object.keys(configObj).length === 0) return;

    return btoa(JSON.stringify(configObj));
}

function validateAlphanumericConfig(config: AlphanumericConfig, value: any) {
    if (typeof value !== "string") return false;
    if (config.minLength !== undefined && value.length < config.minLength) return false;
    if (config.maxLength !== undefined && value.length > config.maxLength) return false;
    return true;
}

function validateNumericConfig(config: NumericConfig, value: any) {
    if (typeof value !== "number") return false;
    if (config.minValue !== undefined && value < config.minValue) return false;
    if (config.maxValue !== undefined && value > config.maxValue) return false;
    return true;
}

/**
 * Build server game config object for initial server creation
 * All available config for current version of the game should be added to the server so it can be updated
 * Optional config will have no value in the server object
 */
export function buildGameServerConfig(game: Game, configurations: any): ServerGameConfig[] {
    if (typeof configurations !== "object" || configurations === null) {
        throw Error("invalid configuration object");
    }

    const parsedConfig: ServerGameConfig[] = [];
    game.configurations?.forEach((c) => {
        const configValue = configurations[c.id];
        if (configValue === undefined) {
            if (c.type === "alphanumeric" || c.type === "numeric" || c.type === "boolean") {
                parsedConfig.push({
                    id: c.id,
                    value: c.default,
                });
            }
        } else {
            if (c.type === "alphanumeric") {
                if (typeof configValue !== "string") {
                    throw Error(`configuration ${c.displayName} must be a text`);
                } else if (configValue.length === 0) {
                    // If empty, use default value
                    parsedConfig.push({
                        id: c.id,
                        value: c.default,
                    });
                } else {
                    if (!/^[a-zA-Z0-9_-]+$/.test(configValue)) throw Error(`configuration ${c.displayName} must only contain a-z A-z 0-9`);
                    if (c.minLength !== undefined && configValue.length < c.minLength)
                        throw Error(`configuration ${c.displayName} must be at least ${c.minLength} characters long`);
                    if (c.maxLength !== undefined && configValue.length > c.maxLength)
                        throw Error(`configuration ${c.displayName} must be at most ${c.maxLength} characters long`);
                    parsedConfig.push({
                        id: c.id,
                        value: configValue,
                    });
                }
            } else if (c.type === "numeric") {
                // TODO
                if (typeof configValue !== "number") throw Error(`configuration ${c.displayName} must be a number`);
            } else {
                if (typeof configValue !== "boolean") throw Error(`configuration ${c.displayName} must be a boolean`);
                parsedConfig.push({
                    id: c.id,
                    value: configValue,
                });
            }
        }
    });
    return parsedConfig;
}

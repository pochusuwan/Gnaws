import { Configuration, Game, Server, ServerGameConfig } from "./types";
import { getGameFromDB } from "./games";
import { ROLE_ADMIN, ROLE_OWNER, User } from "./users";
import { clientError, forbidden, success } from "./util";
import { getServerFromDB, updateServerAttributes } from "./servers";
import { APIGatewayProxyResult } from "aws-lambda";

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
        if (config) {
            try {
                const configValue = validateConfigValue(config, c.value);
                if (configValue !== undefined) {
                    configObj[config.id] = configValue;
                }
            } catch (e) {
                // Ignore any validation issue. Just dont pass to the EC2.
            }
        }
    });
    if (Object.keys(configObj).length === 0) return;

    return btoa(JSON.stringify(configObj));
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
            if (c.type === "alphanumeric" || c.type === "numeric" || c.type === "boolean" || c.type === "enum") {
                parsedConfig.push({
                    id: c.id,
                    value: c.default,
                    isAdminOnly: c.isAdminOnly,
                });
            }
        } else {
            parsedConfig.push({
                id: c.id,
                value: validateConfigValue(c, configValue),
                isAdminOnly: c.isAdminOnly,
            });
        }
    });
    return parsedConfig;
}

export async function buildGameServerConfigForReinstall(gameId?: string, configs?: ServerGameConfig[]): Promise<ServerGameConfig[] | undefined> {
    let game;
    if (gameId) {
        game = await getGameFromDB(gameId);
    }
    if (!game) {
        console.error("Game not found for server");
        return configs;
    }

    const currentConfig = Object.fromEntries(configs?.map((c) => [c.id, c]) ?? []);
    return game.configurations?.map((c) => {
        // If exist, keep existing config. Otherwise, create new config with default value
        if (currentConfig[c.id] !== undefined) {
            return currentConfig[c.id];
        } else {
            return {
                id: c.id,
                value: c.default,
                isAdminOnly: c.isAdminOnly,
            }
        }
    }) ?? [];
}

export async function saveGameConfig(user: User, params: any): Promise<APIGatewayProxyResult> {
    if (user.role !== ROLE_ADMIN && user.role !== ROLE_OWNER) {
        return forbidden();
    }

    const serverName = params.serverName;
    const configInput = params.config;
    if (typeof serverName !== "string") {
        return clientError("Invalid server name")
    }
    if (typeof configInput !== "object") {
        return clientError("Invalid config input")
    }
    const server = await getServerFromDB(serverName);
    if (!server) {
        return clientError("Server not found");
    }
    const game = server.game?.id ? await getGameFromDB(server.game?.id) : null;
    if (!game) {
        return clientError("Game not found");
    }

    const configurations = Object.fromEntries(game.configurations?.map((c) => [c.id, c]) ?? []);
    const currentConfig = server.game?.configurations ?? [];
    let newConfig: ServerGameConfig[];
    try {
        newConfig = currentConfig.map((oldConfig) => {
            const config = configurations[oldConfig.id];
            const newValue = configInput[oldConfig.id];
            if (config && config.isCreationOnly !== true && newValue !== undefined) {
                return {
                    id: oldConfig.id,
                    value: validateConfigValue(config, newValue),
                    isAdminOnly: oldConfig.isAdminOnly,
                }
            } else {
                // Old config is not available in game config or no new value provided, keep old one
                return oldConfig;
            }
        });
    } catch (e: any) {
        return clientError(`Invalid config: ${e.message}`)
    }

    server.game.configurations = newConfig;
    await updateServerAttributes(server.name, {
        game: server.game
    })
    return success({ server })
}

function validateConfigValue(config: Configuration, configValue: any): string | number | boolean | undefined {
    if (config.type === "alphanumeric") {
        if (typeof configValue !== "string") {
            throw Error(`configuration ${config.displayName} must be a text`);
        } else if (configValue.length === 0) {
            // If empty, use default value or undefined
            return config.default;
        } else {
            if (!/^[a-zA-Z0-9]+$/.test(configValue)) throw Error(`configuration ${config.displayName} must only contain a-z A-z 0-9`);
            if (config.minLength !== undefined && configValue.length < config.minLength)
                throw Error(`configuration ${config.displayName} must be at least ${config.minLength} characters long`);
            if (config.maxLength !== undefined && configValue.length > config.maxLength)
                throw Error(`configuration ${config.displayName} must be at most ${config.maxLength} characters long`);
            return configValue;
        }
    } else if (config.type === "numeric") {
        if (configValue === "" || configValue === null || configValue === undefined) {
            return config.default;
        }
        const num = Number(configValue);
        if (Number.isNaN(num)) {
            throw Error(`configuration ${config.displayName} must be a number`);
        }
        if (config.isIntegerOnly && !Number.isInteger(num)) {
            throw Error(`configuration ${config.displayName} must be a whole number`);
        }
        if (config.minValue !== undefined && num < config.minValue) {
            throw Error(`configuration ${config.displayName} must be at least ${config.minValue}`);
        }

        if (config.maxValue !== undefined && num > config.maxValue) {
            throw Error(`configuration ${config.displayName} must be at most ${config.maxValue}`);
        }
        return num;
    } else if (config.type === "enum") {
        if (typeof configValue !== "string") {
            throw Error(`configuration ${config.displayName} must be a valid option`);
        } else if (configValue.length === 0) {
            // If empty, use default value or undefined
            return config.default;
        } else {
            if (!config.values.includes(configValue)) {
                throw Error(
                    `configuration ${config.displayName} must be one of: ${config.values.join(", ")}`
                );
            }
        }
        return configValue;
    } else {
        if (typeof configValue !== "boolean") throw Error(`configuration ${config.displayName} must be a boolean`);
        return configValue;
    }
}

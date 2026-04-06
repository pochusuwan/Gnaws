import { AlphanumericConfig, NumericConfig, Server } from "./types";
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
        if (config) {
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

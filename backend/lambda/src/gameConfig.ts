import { Server } from "./types";

export function buildGameConfigPayload(server: Server): string {
    return btoa(
        JSON.stringify({
            serverName: "Po Server",
            serverPassword: 12424,
            isPublic: false,
        }),
    );
}

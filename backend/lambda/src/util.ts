import { APIGatewayProxyResult } from "aws-lambda";
import { Server } from "./types";
import { User, ROLE_ADMIN, ROLE_OWNER } from "./users";

export function response(code: number, body: any): APIGatewayProxyResult {
    return {
        statusCode: code,
        body: JSON.stringify(body),
    };
}

export function invalidCredential(): APIGatewayProxyResult {
    return response(401, { error: "Invalid credentials" })
};

export function forbidden(): APIGatewayProxyResult {
    return response(403, { error: "Forbidden" })
};

export function serverError(message: string): APIGatewayProxyResult {
    return response(500, { error: message })
};

export function clientError(message: string): APIGatewayProxyResult {
    return response(400, { error: message })
};

export function success(body: any): APIGatewayProxyResult {
    return response(200, body)
}

export function sanatizeServer(server: Server, user: User): Server {
    const isAdmin = user.role === ROLE_ADMIN || user.role === ROLE_OWNER;
    if (server.game !== undefined) {
        server.game.configurations = server.game.configurations?.filter(c => isAdmin || !c.isAdminOnly);
    }
    const allowedUsers = server.configuration?.allowedUsers;
    if (!isAdmin && allowedUsers) {
        const list = allowedUsers.split(",").map((u) => u.trim()).filter((u) => u.length > 0);
        server.userCanAct = list.length === 0 || list.includes(user.username);
    } else {
        server.userCanAct = true;
    }
    if (!isAdmin && server.configuration !== undefined) {
        const config = { ...server.configuration };
        delete config.allowedUsers;
        server.configuration = config;
    }
    return server;
}

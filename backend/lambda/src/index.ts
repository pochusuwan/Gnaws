import { APIGatewayProxyEventV2, APIGatewayProxyResult } from "aws-lambda";
import { Request } from "./types";
import { getInviteCode, getUserFromJwt, login, logout, randomizeInviteCode } from "./auth";
import { getUsers, updateUsers } from "./users";
import { getServers, serverAction } from "./servers";
import { createServer } from "./createServer";
import { initCreateServer } from "./initCreateServer";
import { invalidCredential, serverError } from "./util";
import { checkForNewRelease } from "./versioning";

const MAX_BODY = 10_000;
const LOGIN_TYPE = "login";
const LOGOUT_TYPE = "logout";
const GET_USERS_TYPE = "getUsers";
const UPDATE_USERS_TYPE = "updateUsers";
const GET_SERVERS_TYPE = "getServers";
const CREATE_SERVER_TYPE = "createServer";
const SERVER_ACTION_TYPE = "serverAction";
const INIT_CRATE_SERVER_TYPE = "initCreateServer";
const CHECK_NEW_RELEASE_TYPE = "checkNewRelease";
const GET_INVITE_CODE = "getInviteCode";
const RANDOM_INVITE_CODE = "randomizeInviteCode";
const ALLOWED_REQUESTS = [
    LOGIN_TYPE,
    LOGOUT_TYPE,
    GET_USERS_TYPE,
    UPDATE_USERS_TYPE,
    GET_SERVERS_TYPE,
    SERVER_ACTION_TYPE,
    INIT_CRATE_SERVER_TYPE,
    CREATE_SERVER_TYPE,
    CHECK_NEW_RELEASE_TYPE,
    GET_INVITE_CODE,
    RANDOM_INVITE_CODE,
];

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
    let requestType, params;
    const request = parseRequest(event.body);
    if (request === null) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid request" }),
        };
    } else {
        requestType = request.requestType;
        params = request.params;
    }

    // Handle login request which may be with username and password or JWT
    if (requestType === LOGOUT_TYPE) {
        return await logout(params);
    }

    // Handle login request which may be with username and password or JWT
    if (requestType === LOGIN_TYPE) {
        return await login(params, event.cookies);
    }

    // All other request require valid JWT
    let user;
    try {
        user = await getUserFromJwt(event.cookies);
    } catch (e: any) {
        console.error(`Failed to get user from JWT: ${e.message}`);
        return serverError("Internal server error");
    }
    if (!user) {
        return invalidCredential();
    }
    if (requestType === GET_USERS_TYPE) {
        return await getUsers(user, params);
    }
    if (requestType === UPDATE_USERS_TYPE) {
        return await updateUsers(user, params);
    }
    if (requestType === GET_INVITE_CODE) {
        return await getInviteCode(user, params);
    }
    if (requestType === RANDOM_INVITE_CODE) {
        return await randomizeInviteCode(user, params);
    }
    if (requestType === GET_SERVERS_TYPE) {
        return await getServers(user, params);
    }
    if (requestType === SERVER_ACTION_TYPE) {
        return await serverAction(user, params);
    }
    if (requestType === INIT_CRATE_SERVER_TYPE) {
        return await initCreateServer(user, params);
    }
    if (requestType === CREATE_SERVER_TYPE) {
        return await createServer(user, params);
    }
    if (requestType === CHECK_NEW_RELEASE_TYPE) {
        return await checkForNewRelease(user, params);
    }

    return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid request" }),
    };
};

const parseRequest = (body: string | undefined): Request | null => {
    if (!body || body.length > MAX_BODY) return null;
    try {
        const parsed = JSON.parse(body || "{}");
        if (!ALLOWED_REQUESTS.includes(parsed.requestType)) return null;

        return { requestType: parsed.requestType, params: parsed.params };
    } catch (e) {
        return null;
    }
};

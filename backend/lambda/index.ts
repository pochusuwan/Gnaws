import { APIGatewayProxyEventV2, APIGatewayProxyResult } from "aws-lambda";
import { Request } from "./types";
import { getUserFromJwt, login, logout } from "./auth";
import { getUsers, updateUsers } from "./users";
import { testStartServer } from "./workflows";
import { getServers } from "./servers";

const MAX_BODY = 10_000;
const LOGIN_TYPE = "login";
const LOGOUT_TYPE = "logout";
const GET_USERS_TYPE = "getUsers";
const UPDATE_USERS_TYPE = "updateUsers";
const GET_SERVERS_TYPE = "getServers";
const START_TEST_SERVER_TYPE = "startTestServer";
const ALLOWED_REQUESTS = [LOGIN_TYPE, LOGOUT_TYPE, GET_USERS_TYPE, UPDATE_USERS_TYPE, GET_SERVERS_TYPE, START_TEST_SERVER_TYPE];

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
    const user = await getUserFromJwt(event.cookies);
    if (!user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: "Invalid credentials" }),
        };
    }
    if (requestType === GET_USERS_TYPE) {
        return await getUsers(user, params);
    }
    if (requestType === UPDATE_USERS_TYPE) {
        return await updateUsers(user, params);
    }
    if (requestType === GET_SERVERS_TYPE) {
        return await getServers(user, params);
    }
    if (requestType === START_TEST_SERVER_TYPE) {
        return await testStartServer(user, params);
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

import { APIGatewayProxyResult } from "aws-lambda";
import { Params } from "./types";
import { JwtPayload } from "./auth";

export const ROLE_NEW = "new";
export const ROLE_MANAGER = "manager";
export const ROLE_ADMIN = "admin";

export const getUsers = async (params: Params, payload: JwtPayload | null): Promise<APIGatewayProxyResult> => {
    if (payload?.role !== "admin") {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: "Forbidden" }),
        };
    }
    return {
        statusCode: 200,
        body: JSON.stringify({
            users: [],
        }),
    };
};

import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

const sfnClient = new SFNClient({});

const START_SERVER_FUNCTION_ARN = process.env.START_SERVER_FUNCTION_ARN!;
const GET_SERVER_STATUS_FUNCTION_ARN = process.env.GET_SERVER_STATUS_FUNCTION_ARN!;

const SERVER_TABLE = process.env.SERVER_TABLE_NAME!;
const WORKFLOW_TABLE = process.env.WORKFLOW_TABLE_NAME!;

export const getServerStatusWorkflow = async (serverName: string, instanceId: string) => {
    const cmd = new StartExecutionCommand({
        stateMachineArn: GET_SERVER_STATUS_FUNCTION_ARN,
        input: JSON.stringify({
            instanceId,
            serverName,
            serverTable: SERVER_TABLE
        }),
    });
    try {
        const result = await sfnClient.send(cmd);
        const executionArn = result.executionArn;
        if (executionArn) {
            return {
                executionArn,
                startedAt: result.startDate?.getTime() ?? Date.now(),
            };
        } else {
            return null;
        }
    } catch (e) {
        return null;
    }
}

export const startServerWorkflow = async (instanceId: string) => {
    const cmd = new StartExecutionCommand({
        stateMachineArn: START_SERVER_FUNCTION_ARN,
        input: JSON.stringify({
            instanceId,
            workflowTable: WORKFLOW_TABLE,
        }),
    });
    try {
        const result = await sfnClient.send(cmd);
        const executionArn = result.executionArn;
        if (executionArn) {
            return {
                executionArn,
                startedAt: result.startDate?.getTime() ?? Date.now(),
            };
        } else {
            return null;
        }
    } catch (e) {
        return null;
    }
};

import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

const sfnClient = new SFNClient({});

export const START_SERVER_FUNCTION_ARN = process.env.START_SERVER_FUNCTION_ARN!;
export const STOP_SERVER_FUNCTION_ARN = process.env.STOP_SERVER_FUNCTION_ARN!;
export const BACKUP_SERVER_FUNCTION_ARN = process.env.BACKUP_SERVER_FUNCTION_ARN!;
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

export const startWorkflow = async (serverName: string, instanceId: string, stateMachineArn: string) => {
    const cmd = new StartExecutionCommand({
        stateMachineArn,
        input: JSON.stringify({
            serverName,
            instanceId,
            workflowTable: WORKFLOW_TABLE,
            serverTable: SERVER_TABLE,
        }),
    });
    try {
        const result = await sfnClient.send(cmd);
        const executionId = result.executionArn;
        if (executionId) {
            return {
                executionId,
                startedAt: result.startDate ?? new Date(),
            };
        } else {
            return null;
        }
    } catch (e) {
        return null;
    }
};

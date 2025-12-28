import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

const sfnClient = new SFNClient({});

const START_SERVER_FUNCTION_ARN = process.env.START_SERVER_FUNCTION_ARN!;

export const startServerWorkflow = async (instanceId: string) => {
    const cmd = new StartExecutionCommand({
        stateMachineArn: START_SERVER_FUNCTION_ARN,
        input: JSON.stringify({
            instanceIds: [instanceId],
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

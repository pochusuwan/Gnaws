import { useCallback, useEffect, useRef, useState } from "react";
import useApiCall from "../../hooks/useApiCall";
import { HOUR_IN_MS, type Server } from "../../types";
import "./ServerTable.css";
import Spinner from "../Spinner/Spinner";
import { ConfirmDialog, useConfirm } from "../ConfirmDialog/ConfirmDialog";
import { useUser } from "../../hooks/useUser";
import { hasUserPermission, serverHasRunningTask, serverRefreshingStatus } from "../../utils";
import { useCurrentTime } from "../../hooks/useCurrentTime";

type ServerTableProps = {
    servers: Server[];
    refreshServer: (serverName: string) => void;
    setFocusedServer: (server: string) => void;
};

enum ServerAction {
    Start = "Start",
    Stop = "Stop",
    AddHour = "add_hour"
}

export default function ServerTable(props: ServerTableProps) {
    const [message, setMessage] = useState<string>("");
    const lastAction = useRef<{ action: ServerAction, serverName: string} | null>(null);
    const { call: callServerAction, state: serverActionState } = useApiCall<{ message: string }>("serverAction");
    const currentTime = useCurrentTime();

    // Stop server action backup dialog
    const { open, onResult, confirm } = useConfirm();

    const serverAction = useCallback(
        async (serverName: string, action: ServerAction) => {
            const payload: { serverName: string; action: string; shouldBackup?: boolean } = { serverName, action: action.toLowerCase() };
            if (action === ServerAction.Stop) {
                const shouldBackup = await confirm();
                if (shouldBackup === null) {
                    return;
                }
                payload.shouldBackup = shouldBackup.result;
            }
            setMessage("");
            lastAction.current = { action, serverName };
            callServerAction(payload);
        },
        [callServerAction],
    );

    useEffect(() => {
        if (serverActionState.state === "Loaded") {
            setMessage(`${lastAction?.current?.action} action: ${serverActionState.data.message}`);
            const serverName = lastAction?.current?.serverName;
            if (serverName) {
                props.refreshServer(serverName);
            }
        } else if (serverActionState.state === "Error") {
            setMessage(`${lastAction?.current?.action} action failed: ${serverActionState.error}`);
        }
    }, [serverActionState, props.refreshServer]);

    return (
        <div>
            <div className="serverTableMessage">{message}</div>
            <table className="serverTable">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>IP Address</th>
                        <th>Scheduled Shutdown</th>
                        <th>Player Count</th>
                        <th>Last Backup</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {props.servers.map((server) => (
                        <ServerRow
                            key={server.name}
                            server={server}
                            serverAction={serverAction}
                            actionInProgress={serverActionState.state === "Loading"}
                            onClick={props.setFocusedServer}
                            currentTime={currentTime}
                        />
                    ))}
                </tbody>
            </table>
            {open && <ConfirmDialog message={"Do you want to back up the server?"} onResult={onResult} />}
        </div>
    );
}

type ServerRowProps = {
    server: Server;
    serverAction: (serverName: string, action: ServerAction) => void;
    actionInProgress: boolean;
    onClick: (server: string) => void;
    currentTime: number;
};
function ServerRow(props: ServerRowProps) {
    const { server, serverAction, actionInProgress } = props;

    const userRole = useUser().role;
    const onActionClick = useCallback(
        (action: ServerAction) => {
            props.serverAction(server.name, action);
        },
        [serverAction, server.name],
    );

    let timeSinceBackup;
    if (server.status?.lastBackup) {
        const timeSince = (Date.now() - new Date(server.status.lastBackup).getTime()) / HOUR_IN_MS;
        timeSinceBackup = Math.round(timeSince * 100) / 100 + "hr";
    }
    let shutdownTime = "";
    if (server.scheduledShutdown?.shutdownTime) {
        const date = new Date(server.scheduledShutdown?.shutdownTime);
        const duration = Math.max(0, date.getTime() - props.currentTime);
        const h = Math.floor(duration / HOUR_IN_MS);
        const m = Math.floor(duration % HOUR_IN_MS / 1000 / 60);
        if (h > 0) shutdownTime = h + "h ";
        shutdownTime += m + "min";
    } else {
        shutdownTime = "-"
    }
    const actions = Object.values(ServerAction).filter(a => {
        if (a === ServerAction.AddHour) {
            return !server.configuration?.scheduledShutdownDisabled && server.ec2?.ipAddress
        } else {
            return true;
        }
    });

    let status = "";
    if (server.status?.status) {
        status = server.status.status;
    }
    let currentTask = "";
    if (server.workflow && server.workflow.currentTask && server.workflow.status !== "success") {
        currentTask = server.workflow.currentTask + ": " + server.workflow?.status;
    }
    const showSpinner = serverRefreshingStatus(server) || serverHasRunningTask(server);

    return (
        <tr onClick={() => props.onClick(server.name)}>
            <Cell value={server.name} loading={showSpinner} />
            <Cell value={<>{status}{currentTask && <><br />{currentTask}</>}</>} />
            <Cell value={<>{server.configuration?.customSubdomain}{server.configuration?.customSubdomain && <br/>}{server.ec2?.ipAddress}</>} />
            <Cell value={shutdownTime} />
            <Cell value={server.status?.playerCount} />
            <Cell value={timeSinceBackup} />
            <td>
                {hasUserPermission(userRole) ? (
                    <div className="actionRow">
                        {actions.map((action) => (
                            <button key={action} disabled={actionInProgress} onClick={() => onActionClick(action)}>
                                {action === ServerAction.AddHour ? 'Add Hour' : action}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div>No permission</div>
                )}
            </td>
        </tr>
    );
}

type CellProps = {
    loading?: boolean;
    value?: React.ReactNode | string | number;
};
function Cell(props: CellProps) {
    return (
        <td>
            <div className="cell">
                <div>{props.value}</div>
                {props.loading && <Spinner />}
            </div>
        </td>
    );
}

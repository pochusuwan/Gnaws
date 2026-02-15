import { useCallback, useEffect, useRef, useState } from "react";
import useApiCall from "../../hooks/useApiCall";
import { GIB, HOUR_IN_MS, Role, type Server } from "../../types";
import "./ServerTable.css";
import Spinner from "../Spinner/Spinner";
import { ConfirmDialog, useConfirm } from "../ConfirmDialog/ConfirmDialog";
import { useUser } from "../../hooks/useUser";
import { serverHasRunningTask, serverRefreshingStatus } from "../../utils";

type ServerTableProps = {
    servers: Server[];
    refreshServer: (serverName: string) => void;
    setFocusedServer: (server: string) => void;
};

enum ServerAction {
    Start = "Start",
    Stop = "Stop"
}

export default function ServerTable(props: ServerTableProps) {
    const [message, setMessage] = useState<string>("");
    const lastAction = useRef<{ action: ServerAction, serverName: string} | null>(null);
    const { call: callServerAction, state: serverActionState } = useApiCall<{ message: string }>("serverAction");

    // Stop server action backup dialog
    const { open, onResult, confirm } = useConfirm();

    const serverAction = useCallback(
        async (serverName: string, action: ServerAction) => {
            const payload: { name: string; action: string; shouldBackup?: boolean } = { name: serverName, action: action.toLowerCase() };
            if (action === ServerAction.Stop) {
                const shouldBackup = await confirm();
                if (shouldBackup === null) {
                    return;
                }
                payload.shouldBackup = shouldBackup;
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
            setMessage(`${lastAction?.current} action failed: ${serverActionState.error}`);
        }
    }, [serverActionState, props.refreshServer]);

    return (
        <div>
            <div className="serverTableMessage">{message}</div>
            <table className="serverTable">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Task</th>
                        <th>IP Address</th>
                        <th>Player Count</th>
                        <th>Storage</th>
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

    const showSpinner = serverRefreshingStatus(server) || serverHasRunningTask(server);
    let currentTask = server.workflow?.currentTask;
    if (currentTask) {
        currentTask += ": " + server.workflow?.status;
    }
    let timeSinceBackup;
    if (server.status?.lastBackup) {
        const timeSince = (Date.now() - new Date(server.status.lastBackup).getTime()) / HOUR_IN_MS;
        timeSinceBackup = Math.round(timeSince * 100) / 100 + "hr";
    }
    let storageString;
    if (server.status?.usedStorage && server.status?.totalStorage) {
        const used = parseInt(server.status?.usedStorage);
        const total = parseInt(server.status?.totalStorage);
        storageString = "" + Math.round((used / GIB) * 100) / 100 + "/" + Math.ceil(total / GIB) + "GiB";
    }

    return (
        <tr onClick={() => props.onClick(server.name)}>
            <Cell value={server.name} loading={showSpinner} />
            <Cell value={server.ec2?.instanceType} />
            <Cell value={server.status?.status} />
            <Cell value={currentTask} />
            <Cell value={server.status?.ipAddress} />
            <Cell value={server.status?.playerCount} />
            <Cell value={storageString} />
            <Cell value={timeSinceBackup} />
            <td>
                {userRole === Role.Admin || userRole === Role.Manager ? (
                    <div className="actionRow">
                        {Object.values(ServerAction).map((action) => (
                            <button key={action} disabled={actionInProgress} onClick={() => onActionClick(action)}>
                                {action}
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
    value?: string | number;
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

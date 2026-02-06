import { useCallback, useEffect, useRef, useState } from "react";
import useApiCall from "../../hooks/useApiCall";
import { GIB, HOUR_IN_MS, Role, type Server } from "../../types";
import "./ServerTable.css";
import Spinner from "../Spinner/Spinner";
import { ConfirmDialog, useConfirm } from "../ConfirmDialog/ConfirmDialog";
import { useUser } from "../../hooks/useUser";

type ServerTableProps = {
    servers: Server[];
    refreshServers: () => void;
    onServerRowClick: (server: Server) => void;
};

enum ServerAction {
    Start = "Start",
    Stop = "Stop",
    Backup = "Backup",
}

export default function ServerTable(props: ServerTableProps) {
    const [message, setMessage] = useState<string>("");
    const lastAction = useRef<ServerAction | null>(null);
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
            lastAction.current = action;
            callServerAction(payload);
        },
        [callServerAction],
    );
    useEffect(() => {
        if (serverActionState.state === "Loaded") {
            setMessage(`${lastAction?.current} action: ${serverActionState.data.message}`);
            props.refreshServers();
        } else if (serverActionState.state === "Error") {
            setMessage(`${lastAction?.current} action failed: ${serverActionState.error}`);
        }
    }, [serverActionState, props.refreshServers]);

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
                        <ServerRow key={server.name} server={server} serverAction={serverAction} actionInProgress={serverActionState.state === "Loading"} onClick={props.onServerRowClick} />
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
    onClick: (server: Server) => void;
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

    const loadingStatus = server.status?.lastRequest !== undefined && (server.status?.lastUpdated === undefined || new Date(server.status.lastRequest) > new Date(server.status?.lastUpdated));
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
        <tr onClick={() => props.onClick(server)}>
            <Cell value={server.name} />
            <Cell value={server.ec2?.instanceType} />
            <Cell value={server.status?.status} loading={loadingStatus} />
            <Cell value={currentTask} />
            <Cell value={server.status?.ipAddress} loading={loadingStatus} />
            <Cell value={server.status?.playerCount} loading={loadingStatus} />
            <Cell value={storageString} loading={loadingStatus} />
            <Cell value={timeSinceBackup} loading={loadingStatus} />
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
            <div className="cell">{props.loading ? <Spinner /> : props.value}</div>
        </td>
    );
}

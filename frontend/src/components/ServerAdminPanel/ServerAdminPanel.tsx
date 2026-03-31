import { useCallback, useEffect, useRef, useState } from "react";
import useApiCall from "../../hooks/useApiCall";
import type { Server } from "../../types";
import "./ServerAdminPanel.css";
import { hasAdminPermission, serverHasRunningTask, serverRefreshingStatus } from "../../utils";
import Spinner from "../Spinner/Spinner";
import { ConfirmDialog, useConfirm } from "../ConfirmDialog/ConfirmDialog";
import PageSelector from "../../components/PageSelector/PageSelector";
import GameActionPanel from "../GameActionPanel/GameActionPanel";
import ServerConfigPanel from "../ServerConfigPanel/ServerConfigPanel";
import AdminPanelButton from "../AdminPanelButton/AdminPanelButton";
import MonitorPanel from "../MonitorPanel/MonitorPanel";
import { useUser } from "../../hooks/useUser";

const SERVER_ACTION = "Server Action";
const SERVER_CONFIG = "Server Config";
const SERVER_DATA = "Server Data";
const GAME_ACTION = "Game Action";
const GAME_CONFIG = "Game Config";
const MONITOR = "Monitor";
const PAGES = [SERVER_ACTION, SERVER_CONFIG, SERVER_DATA, GAME_ACTION, GAME_CONFIG, MONITOR];

type ServerAdminPanelProps = {
    servers: Server[];
    refreshServer: (serverName: string) => void;
    server: Server;
};
export default function ServerAdminPanel(props: ServerAdminPanelProps) {
    const userRole = useUser().role;
    const [page, setPage] = useState(SERVER_ACTION);
    const server = props.server;
    const { call, state } = useApiCall<{ message: string }>("serverAction");
    const [message, setMessage] = useState("");
    const lastAction = useRef<{ action: string; refreshAfterSuccess: boolean }>(null);

    // Terminate server action dialog
    const { open: terminateOpen, onResult: terminateResult, confirm: terminateConfirm } = useConfirm();
    // Stop instance action dialog
    const { open: stopInstanceOpen, onResult: stopInstanceResult, confirm: stopInstanceConfirm } = useConfirm();

    const callAction = useCallback(
        (action: string, refreshAfterSuccess: boolean, params?: { [key: string]: string | number }) => {
            if (server !== null) {
                lastAction.current = { action, refreshAfterSuccess };
                const payload = { serverName: server.name, action: action.toLowerCase(), ...params };
                call(payload);
            }
        },
        [server],
    );

    const callStopInstance = useCallback(async () => {
        const result = await stopInstanceConfirm();
        if (result?.result) {
            callAction("Stop_Instance", true);
        }
    }, [server, callAction]);

    const callTerminateAction = useCallback(async () => {
        const result = await terminateConfirm();
        if (result?.result) {
            if (result?.input === server.name) {
                lastAction.current = { action: "Terminate", refreshAfterSuccess: false };
                const payload = { serverName: server.name, action: "terminate" };
                call(payload);
            } else {
                setMessage("Termination failed. Server name did not match.");
            }
        } else {
            setMessage("Termination cancelled");
        }
    }, [server]);

    useEffect(() => {
        if (state.state === "Loading") {
            setMessage("Loading");
        } else if (state.state === "Loaded") {
            setMessage(`${lastAction.current?.action} ${state.data.message}`);
            if (lastAction.current?.refreshAfterSuccess) {
                props.refreshServer(server.name);
            }
        } else if (state.state === "Error") {
            setMessage(state.error);
        }
    }, [server, state, props.refreshServer]);

    if (server == null) return null;

    const inProgress = state.state === "Loading";
    const showSpinner = serverRefreshingStatus(server) || serverHasRunningTask(server);

    return (
        <div className="serverAdminPanel">
            <div className="adminPanelRow">
                <h2 style={{ margin: 0 }}>Server Admin: {server.name}</h2>
                {showSpinner && <Spinner />}
            </div>
            <div className="adminPanelMessage">{message}</div>
            <PageSelector current={page} onSelect={setPage} pages={PAGES} />
            {page === SERVER_ACTION && (
                <ServerActionButtons
                    disabled={inProgress || !hasAdminPermission(userRole)}
                    callAction={callAction}
                    callStopInstance={callStopInstance}
                    callTerminateAction={callTerminateAction}
                />
            )}
            {page === SERVER_CONFIG && <ServerConfigPanel server={server} callAction={callAction} disabled={inProgress || !hasAdminPermission(userRole)} setMessage={setMessage} />}
            {page === SERVER_DATA && <pre className="jsonView">{JSON.stringify(server, null, 2)}</pre>}
            {page === GAME_ACTION && <GameActionPanel server={server} callAction={callAction} disabled={inProgress || !hasAdminPermission(userRole)} />}
            {page === MONITOR && <MonitorPanel server={server} />}
            {stopInstanceOpen && (
                <ConfirmDialog
                    message={"Are you sure you want to force stop instance? Unsaved game progress may be lost."}
                    yesMessage="Confirm"
                    noMessage="Cancel"
                    onResult={stopInstanceResult}
                />
            )}
            {terminateOpen && (
                <ConfirmDialog
                    message={
                        <p style={{ whiteSpace: "pre-line" }}>{"Are you sure you want to terminate this server? This will delete the server and cannot be undone.\nYou should create backup before terminating.\nEnter server name to confirm."}</p>
                    }
                    yesMessage="Delete"
                    noMessage="Cancel"
                    onResult={terminateResult}
                    inputValue={""}
                />
            )}
        </div>
    );
}

type ServerActionProps = {
    disabled: boolean;
    callAction: (action: string, refreshAfterSuccess: boolean) => void;
    callStopInstance: () => void;
    callTerminateAction: () => void;
};
function ServerActionButtons(props: ServerActionProps) {
    const { disabled, callAction, callStopInstance, callTerminateAction } = props;
    return (
        <div className="serverAdminPanelButtonGrid">
            <AdminPanelButton
                disabled={disabled}
                label="Start Instance"
                description="Start EC2 instance without starting the game server."
                onClick={() => callAction("Start_Instance", true)}
            />
            <AdminPanelButton
                disabled={disabled}
                label="Stop Game Server"
                description="Stop game server without stopping the EC2 instance."
                onClick={() => callAction("Stop_Game", true)}
            />
            <AdminPanelButton
                disabled={disabled}
                label="Force Stop Instance"
                description="Force stop that shuts down the EC2 instance without gracefully stopping the game server first. Unsaved game progress may be lost."
                onClick={callStopInstance}
            />
            <AdminPanelButton
                disabled={disabled}
                label="Backup Server Save"
                description="Backup current server save files to S3 storage. Note that some games only save periodically or when shutting down. This does not force the game to save, so recent progress may not be included if the server is running. EC2 instance must be running to run this command."
                onClick={() => callAction("Backup", false)}
            />
            <AdminPanelButton
                disabled={disabled}
                label="Update Game Server Version"
                description="Update the game server to the latest version. Save files are preserved, but newer versions may be incompatible with existing saves. Create a backup before updating. EC2 instance must be running and server not running to run this command."
                onClick={() => callAction("Update", true)}
            />
            <AdminPanelButton
                disabled={disabled}
                label="Remove workflow lock"
                description="Clear the workflow lock if the server is stuck after a failed action. The lock prevents multiple operations from running at once. Removing it does not change the server state."
                onClick={() => callAction("Remove_Lock", false)}
            />
            <AdminPanelButton
                disabled={disabled}
                label="Terminate Server"
                description="Permanently delete the server and all its resources. This cannot be undone. Any backups in S3 storage will be preserved and can be used to restore to a new server."
                onClick={callTerminateAction}
            />
        </div>
    );
}

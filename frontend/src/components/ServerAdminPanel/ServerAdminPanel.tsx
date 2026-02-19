import { useCallback, useEffect, useRef, useState } from "react";
import useApiCall from "../../hooks/useApiCall";
import type { Server } from "../../types";
import "./ServerAdminPanel.css";
import { serverHasRunningTask, serverRefreshingStatus } from "../../utils";
import Spinner from "../Spinner/Spinner";
import { ConfirmDialog, useConfirm } from "../ConfirmDialog/ConfirmDialog";

type ServerAdminPanelProps = {
    servers: Server[];
    refreshServer: (serverName: string) => void;
    server: Server;
};
export default function ServerAdminPanel(props: ServerAdminPanelProps) {
    const server = props.server;
    const { call, state } = useApiCall<{ message: string }>("serverAction");
    const [message, setMessage] = useState("");
    const lastAction = useRef<string>(null);

    // Terminate server action dialog
    const { open, onResult, confirm } = useConfirm();

    const callAction = useCallback(
        (action: string) => {
            if (server !== null) {
                lastAction.current = action;
                const payload = { name: server.name, action: action.toLowerCase() };
                call(payload);
            }
        },
        [server],
    );

    const callTerminateAction = useCallback(async () => {
        const shouldBackup = await confirm();
        if (shouldBackup?.result) {
            if (shouldBackup?.input === server.name) {
                lastAction.current = "Terminate";
                const payload = { name: server.name, action: "terminate" };
                call(payload);
            } else {
                setMessage("Termination failed. Server name did not match.")
            }
        } else {
            setMessage("Termination cancelled")
        }
    }, [server])

    useEffect(() => {
        if (state.state === "Loading") {
            setMessage("Loading");
        } else if (state.state === "Loaded") {
            setMessage(`${lastAction.current} ${state.data.message}`);
            props.refreshServer(server.name);
        } else if (state.state === "Error") {
            setMessage(state.error);
        }
    }, [state, props.refreshServer]);

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
            <div className="serverAdminPanelButtonGrid">
                <Button disabled={inProgress} label="Start Instance" description="Start EC2 instance without starting the game server." />
                <Button disabled={inProgress} label="Stop Game Server" description="Stop game server without stopping the EC2 instance." />
                <Button
                    disabled={inProgress}
                    label="Backup Server Save"
                    description="Backup current server save files to S3 storage. Note that some games only save periodically or when shutting down. This does not force the game to save, so recent progress may not be included if the server is running. EC2 instance must be running to run this command."
                    onClick={() => callAction("Backup")}
                />
                <Button
                    disabled={inProgress}
                    label="Update Game Server Version"
                    description="Update the game server to the latest version. Save files are preserved, but newer versions may be incompatible with existing saves. Create a backup before updating. EC2 instance must be running and server not running to run this command."
                    onClick={() => callAction("Update")}
                />
                <Button
                    disabled={inProgress}
                    label="Force Stop Instance"
                    description="Force stop that shuts down the EC2 instance without gracefully stopping the game server first. Unsaved game progress may be lost."
                />
                <Button
                    disabled={inProgress}
                    label="Remove workflow lock"
                    description="Clear the workflow lock if the server is stuck after a failed action. The lock prevents multiple operations from running at once. Removing it does not change the server state."
                />
                <Button
                    disabled={inProgress}
                    label="Terminate Server"
                    description="Permanently delete the server and all its resources. This cannot be undone. Any backups in S3 storage will be preserved and can be used to restore to a new server."
                    onClick={callTerminateAction}
                />
            </div>
            <pre className="jsonView">{JSON.stringify(server, null, 2)}</pre>;
            {open && <ConfirmDialog message={"Are you sure you want to terminate this server? This will delete the server and cannot be undone.\nYou should create backup before terminating.\nEnter server name to confirm."} yesMessage="Delete" noMessage="Cancel" onResult={onResult} inputValue />}
        </div>
    );
}

type ButtonProps = {
    label: string;
    description: string;
    disabled: boolean;
    onClick?: () => void;
};
function Button(props: ButtonProps) {
    return (
        <>
            <button className="adminPanelButton" disabled={props.disabled || props.onClick === undefined} onClick={props.onClick}>
                {props.label}
            </button>
            <div>{props.description}</div>
        </>
    );
}

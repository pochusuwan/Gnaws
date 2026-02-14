import { useCallback, useEffect, useRef, useState } from "react";
import useApiCall from "../../hooks/useApiCall";
import type { Server } from "../../types";
import "./ServerAdminPanel.css";

type ServerAdminPanelProps = {
    servers: Server[];
    refreshServers: () => void;
    focusedServer: string | null;
};
export default function ServerAdminPanel(props: ServerAdminPanelProps) {
    const [server, setServer] = useState<Server | null>(null);
    const { call, state } = useApiCall<{ message: string }>("serverAction");
    const [message, setMessage] = useState("");
    const lastAction = useRef<string>(null);

    useEffect(() => {
        if (props.focusedServer) {
            const focusedServer = props.servers.find((s) => s.name === props.focusedServer);
            if (focusedServer) {
                setServer(focusedServer);
            }
        }
    }, [props.focusedServer, props.servers]);

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

    useEffect(() => {
        if (state.state === "Loading") {
            setMessage("Loading");
        } else if (state.state === "Loaded") {
            setMessage(`${lastAction.current} ${state.data.message}`);
            props.refreshServers();
        } else if (state.state === "Error") {
            setMessage(state.error);
        }
    }, [state, props.refreshServers]);

    if (server == null) return null;

    const inProgress = state.state === "Loading";

    return (
        <div className="serverAdminPanel">
            <h3 style={{ marginBottom: "4px" }}>{server.name}</h3>
            <div className="adminPanelMessage">{message}</div>
            <div className="serverAdminPanelButtonGrid">
                <Button disabled={inProgress} label="Start Instance" description="Start EC2 instance without starting the game server." />
                <Button disabled={inProgress} label="Stop Game Server" description="Stop game server without stopping the EC2 instance." />
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
                    label="Backup Server Save"
                    description="Backup current server save files to S3 storage. Note that some games only save periodically or when shutting down. This does not force the game to save, so recent progress may not be included if the server is running. EC2 instance must be running to run this command."
                />
                <Button
                    disabled={inProgress}
                    label="Update Server"
                    description="Update the game server to the latest version. Save files are preserved, but newer versions may be incompatible with existing saves. Create a backup before updating. EC2 instance must be running and server not running to run this command."
                    onClick={() => callAction("Update")}
                />
                <Button
                    disabled={inProgress}
                    label="Terminate Server"
                    description="Permanently delete the server and all its resources. This cannot be undone. Backups in S3 storage will be preserved and can be used to restore to a new server."
                />
            </div>
            <pre className="jsonView">{JSON.stringify(server, null, 2)}</pre>;
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
            <button disabled={props.disabled || props.onClick === undefined} onClick={props.onClick}>
                {props.label}
            </button>
            <div>{props.description}</div>
        </>
    );
}

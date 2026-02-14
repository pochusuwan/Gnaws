import type { Server } from "../../types";
import "./ServerAdminPanel.css";

type ServerAdminPanelProps = {
    server: Server | null;
};
export default function ServerAdminPanel(props: ServerAdminPanelProps) {
    const server = props.server;

    if (server == null) return null;

    return (
        <div className="serverAdminPanel">
            <h3>{server.name}</h3>
            <div className="serverAdminPanelButtonGrid">
                <button>Start Instance</button>
                <div>Start EC2 instance without starting the game server.</div>
                <button>Stop Game Server</button>
                <div>Stop game server without stopping the EC2 instance.</div>
                <button>Force Stop Instance</button>
                <div>Force stop that shuts down the EC2 instance without gracefully stopping the game server first. Unsaved game progress may be lost.</div>
                <button>Remove workflow lock</button>
                <div>
                    Clear the workflow lock if the server is stuck after a failed action. The lock prevents multiple operations from running at once. Removing it does not change the server state.
                </div>
                <button>Backup Server</button>
                <div>
                    Backup current server save files to S3 storage. Note that some games only save periodically or when shutting down. This does not force the game to save, so recent progress may not
                    be included if the server is running.
                </div>
                <button>Update Server</button>
                <div>Update the game server to the latest version. Save files are preserved, but newer versions may be incompatible with existing saves. Create a backup before updating.</div>
                <button>Terminate Server</button>
                <div>Permanently delete the server and all its resources. This cannot be undone. Backups in S3 storage will be preserved and can be used to restore to a new server.</div>
            </div>
            <pre className="jsonView">{JSON.stringify(server, null, 2)}</pre>;
        </div>
    );
}

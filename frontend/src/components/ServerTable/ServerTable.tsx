import { GIB, HOUR_IN_MS, type Server } from "../../types";
import Spinner from "../Spinner/Spinner";
import "./ServerTable.css";

type ServerTableProps = {
    servers: Server[];
};

export default function ServerTable(props: ServerTableProps) {
    return (
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
                    <ServerRow server={server} key={server.name} />
                ))}
            </tbody>
        </table>
    );
}

type ServerRowProps = {
    server: Server;
};
function ServerRow(props: ServerRowProps) {
    const server = props.server;

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
        <tr>
            <Cell value={server.name} />
            <Cell value={server.ec2?.instanceType} />
            <Cell value={server.status?.status} loading={loadingStatus} />
            <Cell value={currentTask} />
            <Cell value={server.status?.ipAddress} loading={loadingStatus} />
            <Cell value={server.status?.playerCount} loading={loadingStatus} />
            <Cell value={storageString} loading={loadingStatus} />
            <Cell value={timeSinceBackup} loading={loadingStatus} />
            <td>
                <div className="actionRow">
                    <button>Start</button>
                    <button>Stop</button>
                    <button>Backup</button>
                </div>
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

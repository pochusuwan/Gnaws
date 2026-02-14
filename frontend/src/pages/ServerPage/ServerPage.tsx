import { useState } from "react";
import ServerTable from "../../components/ServerTable/ServerTable";
import { Role, type NetworkDataState, type Server } from "../../types";
import "./ServerPage.css";
import ServerAdminPanel from "../../components/ServerAdminPanel/ServerAdminPanel";
import { useUser } from "../../hooks/useUser";

type Props = {
    servers: NetworkDataState<Server[]>;
    refreshServers: () => void;
};

export default function ServerPage(props: Props) {
    const userRole = useUser().role;
    const [focusedServer, setFocusedServer] = useState<string | null>(null);

    if (props.servers.state === "Error") {
        return <div>Failed to load servers: {props.servers.error}</div>;
    }

    if (props.servers.state !== "Loaded") {
        return <div>Loading servers...</div>;
    }

    return (
        <div className="serverPage">
            <ServerTable servers={props.servers.data} refreshServers={props.refreshServers} setFocusedServer={setFocusedServer} />
            {userRole === Role.Admin && (
                <ServerAdminPanel focusedServer={focusedServer} refreshServers={props.refreshServers} servers={props.servers.data} />
            )}
        </div>
    );
}

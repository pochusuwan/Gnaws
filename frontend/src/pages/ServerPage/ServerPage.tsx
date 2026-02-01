import { useState } from "react";
import ServerTable from "../../components/ServerTable/ServerTable";
import type { Server } from "../../types";
import "./ServerPage.css";
import ServerAdminPanel from "../../components/ServerAdminPanel/ServerAdminPanel";

type Props = {
    servers: Server[];
    loading: boolean;
    loadServers: (refreshStatus: boolean) => void;
};

export default function ServerPage(props: Props) {
    const [focusedServer, setFocusedServer] = useState<Server | null>(null);
    if (props.loading) {
        return <div>Loading servers...</div>;
    }

    return (
        <div className="serverPage">
            <ServerTable servers={props.servers} loadServers={props.loadServers} onServerRowClick={setFocusedServer} />
            <ServerAdminPanel server={focusedServer} />
        </div>
    );
}

import type { Server } from "../../types";
import "./ServerAdminPanel.css";

type ServerAdminPanelProps = {
    server: Server | null;
};
export default function ServerAdminPanel(props: ServerAdminPanelProps) {
    const server = props.server;

    if (server == null) return null;

    return <pre className="jsonView">{JSON.stringify(server, null, 2)}</pre>;
}

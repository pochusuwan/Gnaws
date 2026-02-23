import { useEffect, useMemo, useRef, useState } from "react";
import ServerTable from "../../components/ServerTable/ServerTable";
import { Role, type NetworkDataState, type Server } from "../../types";
import "./ServerPage.css";
import ServerAdminPanel from "../../components/ServerAdminPanel/ServerAdminPanel";
import { useUser } from "../../hooks/useUser";

type Props = {
    servers: NetworkDataState<Server[]>;
    refreshServer: (serverName: string) => void;
};

export default function ServerPage(props: Props) {
    const userRole = useUser().role;
    const [focusedServerName, setFocusedServerName] = useState<string | null>(null);
    const [delayedServerName, setDelayedServerName] = useState<string | null>(null);

    // Artificially delay setting server to prevent
    // accidently switching server and perform action
    const timeoutId = useRef<number>(null);
    useEffect(() => {
        setDelayedServerName(null);

        if (timeoutId.current) {
            clearTimeout(timeoutId.current);
            timeoutId.current = null;
        }
        timeoutId.current = setTimeout(() => setDelayedServerName(focusedServerName), 250);

        return () => {
            if (timeoutId.current) {
                clearTimeout(timeoutId.current);
            }
        };
    }, [focusedServerName]);

    const focusedServer = useMemo(() => {
        if (props.servers.state !== "Loaded" || !delayedServerName) return null;

        return props.servers.data.find((s) => s.name === delayedServerName) ?? null;
    }, [props.servers, delayedServerName]);

    if (props.servers.state === "Error") {
        return <div>Failed to load servers: {props.servers.error}</div>;
    }

    if (props.servers.state !== "Loaded") {
        return <div>Loading servers...</div>;
    }

    return (
        <div className="serverPage">
            <ServerTable servers={props.servers.data} refreshServer={props.refreshServer} setFocusedServer={setFocusedServerName} />
            {userRole === Role.Admin &&
                focusedServerName !== null &&
                (focusedServer == null ? (
                    <h2 style={{ marginBottom: "4px" }}>Loading server data...</h2>
                ) : (
                    <ServerAdminPanel server={focusedServer} refreshServer={props.refreshServer} servers={props.servers.data} />
                ))}
        </div>
    );
}

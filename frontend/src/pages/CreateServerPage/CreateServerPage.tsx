import { useEffect, useState } from "react";
import { useUser } from "../../hooks/useUser";
import { Role, type Game, type NetworkDataState, type Port } from "../../types";
import type { GamesData } from "../../hooks/useGames";
import "./CreateServerPage.css";

type CreateServer = {
    serverName: string;
    id: string;
    instanceType: string;
    storage: string;
    ports: Port[];
};

type CreateServerPageProps = {
    games: NetworkDataState<GamesData>;
    loadGames: () => void;
};

export default function CreateServerPage(props: CreateServerPageProps) {
    const userRole = useUser().role;
    const [createServerData, setCreateServerData] = useState<CreateServer | null>(null);

    useEffect(() => {
        if (userRole === Role.Admin) {
            props.loadGames();
        }
    }, [userRole, props.loadGames]);

    useEffect(() => {
        if (props.games.state === "Loaded") {
            const data = props.games.data;
            setCreateServerData(builldCreateServerData(data.games[data.initialGame], ""));
        }
    }, [props.games]);

    if (userRole !== Role.Admin) {
        return <div>No permission</div>;
    }
    if (props.games.state === "Error") return <div>Failed to load games: {props.games.error}</div>;

    if (createServerData == null) return <div>Loading games...</div>;

    return (
        <div className="createServerPage">
            <div className="createServerGrid">
                <div>Server Name:</div>
                <input type="text" id="createServerName" />
                <div>Valid characters: a-z, A-Z, 0-9, _-</div>

                <div>Template:</div>
                <div>Server template TODO</div>
                <div>Server template</div>

                <div>Instance Type:</div>
                <input type="text" id="createServerInstanceType" value="t3.small" />
                <div>EC2 instance type</div>

                <div>Storage:</div>
                <input type="text" id="createServerStorage" value="8" />
                <div>{">= 4 GiB"}</div>
            </div>
        </div>
    );
}

export function builldCreateServerData(game: Game, serverName: string): CreateServer {
    return {
        serverName: serverName,
        id: game.id,
        instanceType: game.ec2.instanceType,
        storage: `${game.ec2.storage}`,
        ports: game.ec2.ports.map((p) => ({
            port: p.port,
            protocol: p.protocol,
        })),
    };
}
